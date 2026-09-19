export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function usernameFromBotName(value: string): string {
  const username = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");

  return username || "bot";
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("INVALID_URL");
  }
  if (url.username || url.password) {
    throw new Error("INVALID_URL");
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  url.hash = "";
  url.searchParams.sort();
  return url.toString();
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function toolKey(runId: string, openaiCallId: string): string {
  return `tool:${runId}:${openaiCallId}`;
}

export function emailSendKey(runId: string, reportId: string): string {
  return `email:${runId}:${reportId}`;
}

export function occurrenceKey(scheduleId: string, scheduledFor: number): string {
  return `occurrence:${scheduleId}:${scheduledFor}`;
}

export function sanitizeErrorCode(error: unknown): string {
  const candidate =
    typeof error === "object" && error !== null
      ? error as { message?: unknown; name?: unknown; statusCode?: unknown }
      : undefined;
  const message =
    typeof candidate?.message === "string" ? candidate.message.toLowerCase() : "";
  const name = typeof candidate?.name === "string" ? candidate.name.toLowerCase() : "";
  const statusCode =
    typeof candidate?.statusCode === "number" ? candidate.statusCode : undefined;
  const source = `${name} ${message}`;

  if (statusCode === 401 || statusCode === 403 || /unauthoriz|forbidden/.test(source)) {
    return "unauthorized";
  }
  if (statusCode === 404 || /not found|does not exist/.test(source)) {
    return "not_found";
  }
  if (statusCode === 409 || /conflict|already exists|already taken|unavailable/.test(source)) {
    return "conflict";
  }
  if (statusCode === 429 || /rate.?limit|too many requests/.test(source)) {
    return "rate_limited";
  }
  if (/timeout|timed out|aborted/.test(source)) {
    return "timeout";
  }
  if (statusCode === 400 || statusCode === 422 || /invalid|validation/.test(source)) {
    return "validation_error";
  }
  if (/configuration|not[_ ]configured|missing environment/.test(source)) {
    return "configuration_error";
  }
  if (
    (statusCode !== undefined && statusCode >= 500) ||
    /provider|agentmail|firecrawl|openai|network/.test(source)
  ) {
    return "provider_error";
  }
  return "unknown_error";
}
