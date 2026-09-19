"use node";

import { lookup } from "node:dns/promises";
import { Firecrawl, type FormatOption } from "firecrawl";

import { sanitizeErrorCode } from "./normalize";

const MAX_PROVIDER_TIMEOUT_MS = 300_000;
const MAX_GOAL_LENGTH = 2_000;
const MAX_GOAL_URLS = 20;
const PRIVATE_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "ip6-allnodes",
  "ip6-allrouters",
]);

export type FirecrawlFormatName =
  | "markdown"
  | "links"
  | "screenshot"
  | "html"
  | "rawHtml"
  | "images"
  | "summary";

export type PublicUrlCheck = {
  url: URL;
  addresses: string[];
};

export function getFirecrawlClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (!apiKey) throw new Error("FIRECRAWL_NOT_CONFIGURED");
  return new Firecrawl({ apiKey });
}

function isIpv4(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function isPrivateIpv4(value: string): boolean {
  if (!isIpv4(value)) return false;
  const octets = value.split(".").map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return true;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
}

function isPrivateIpv6(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

export function isPrivateAddress(value: string): boolean {
  return isPrivateIpv4(value) || value.includes(":") && isPrivateIpv6(value);
}

function rejectPrivateHostname(hostname: string): void {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (
    PRIVATE_HOSTNAMES.has(normalized) ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    normalized.endsWith(".home.arpa") ||
    isPrivateAddress(normalized)
  ) {
    throw new Error("PRIVATE_URL_DISALLOWED");
  }
}

export async function assertPublicUrl(value: string): Promise<PublicUrlCheck> {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("INVALID_URL");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("INVALID_URL");
  }
  if (!url.hostname || url.hostname.length > 253) throw new Error("INVALID_URL");
  rejectPrivateHostname(url.hostname);

  const records = await lookup(url.hostname, { all: true, verbatim: true });
  const addresses = records.map((record) => record.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error("PRIVATE_URL_DISALLOWED");
  }
  return { url, addresses };
}

export function assertPublicUrlShape(value: string): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("INVALID_URL");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("INVALID_URL");
  }
  rejectPrivateHostname(url.hostname);
  return url;
}

export function assertPublicDomain(value: string): string {
  const domain = value.trim().toLowerCase();
  if (
    !domain ||
    domain.includes("/") ||
    domain.includes(":") ||
    domain.includes("@") ||
    domain.includes(" ")
  ) {
    throw new Error("INVALID_DOMAIN");
  }
  rejectPrivateHostname(domain);
  return domain;
}

export function normalizeGoal(value: string): string {
  const goal = value.trim();
  if (!goal || goal.length > MAX_GOAL_LENGTH) throw new Error("INVALID_INTERACTION_GOAL");
  if (
    /\b(?:log[ -]?in|sign[ -]?in|password|passcode|otp|one[ -]?time[ -]?code|two[ -]?factor|credential|private[ -]?account|authenticate|authorization code)\b/i.test(
      goal,
    )
  ) {
    throw new Error("PRIVATE_INTERACTION_DISALLOWED");
  }
  return goal;
}

export async function assertPublicUrlsInText(value: string): Promise<void> {
  const urls = value.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  if (urls.length > MAX_GOAL_URLS) throw new Error("TOO_MANY_GOAL_URLS");
  await Promise.all(
    urls.map(async (candidate) => {
      await assertPublicUrl(candidate.replace(/[),.;]+$/, ""));
    }),
  );
}

export function clampProviderTimeout(milliseconds: number): number {
  if (!Number.isFinite(milliseconds)) return MAX_PROVIDER_TIMEOUT_MS;
  return Math.max(1_000, Math.min(MAX_PROVIDER_TIMEOUT_MS, Math.trunc(milliseconds)));
}

export function toSearchTimeRange(value: string | null): string | undefined {
  if (value === null) return undefined;
  return {
    day: "qdr:d",
    week: "qdr:w",
    month: "qdr:m",
    year: "qdr:y",
  }[value];
}

export function toProviderFormats(values: unknown): FormatOption[] {
  if (!Array.isArray(values) || values.length === 0) return ["markdown"];
  return values.slice(0, 4).map((value) => {
    if (typeof value !== "string") throw new Error("INVALID_FORMAT");
    if (
      ![
        "markdown",
        "links",
        "screenshot",
        "html",
        "rawHtml",
        "images",
        "summary",
      ].includes(value)
    ) {
      throw new Error("INVALID_FORMAT");
    }
    return value as FormatOption;
  });
}

export function safeProviderError(error: unknown): {
  code: string;
  retryable: boolean;
  safeMessage: string;
} {
  const rawMessage =
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const code = /^(?:INVALID_|PRIVATE_|ATTACHMENT_|TOO_MANY_GOAL_URLS|FIRECRAWL_(?:INTERACTION|BROWSER|OUTPUT|TARGET_STATUS)|UNSUPPORTED_FIRECRAWL|PROVIDER_JOB_ID_MISSING)/.test(rawMessage)
    ? "validation_error"
    : sanitizeErrorCode(error);
  const retryable = ["timeout", "rate_limited", "provider_error", "unknown_error"].includes(code);
  const safeMessage =
    code === "unauthorized"
      ? "Firecrawl rejected the configured provider credential."
      : code === "rate_limited"
        ? "Firecrawl is rate-limiting this research request."
        : code === "timeout"
          ? "Firecrawl did not finish before the provider timeout."
          : code === "validation_error"
            ? "Firecrawl rejected the research request parameters."
            : code === "configuration_error"
              ? "Firecrawl is not configured for this deployment."
              : "Firecrawl could not complete the research request.";
  return { code, retryable, safeMessage };
}

export function providerJobState(value: unknown): "running" | "completed" | "failed" {
  if (value === "completed") return "completed";
  if (value === "failed" || value === "cancelled") return "failed";
  return "running";
}
