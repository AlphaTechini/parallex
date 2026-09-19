"use node";

import type { Document } from "firecrawl";
import { makeFunctionReference } from "convex/server";

import {
  assertPublicUrlShape,
  safeProviderError,
} from "../../lib/firecrawlClient";
import { canonicalizeUrl } from "../../lib/normalize";
import type { Doc } from "../../_generated/dataModel";
import type {
  EvidenceCompleteness,
  SourceInput,
  ResearchSourceType,
} from "../../sources";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  boundedJsonString,
  FIRECRAWL_OUTPUT_BUDGET,
  MAX_DOCUMENT_EVIDENCE_CHARS,
} from "./outputBudget";

export {
  boundedJson,
  boundedJsonString,
  FIRECRAWL_OUTPUT_BUDGET,
  MAX_DOCUMENT_EVIDENCE_CHARS,
} from "./outputBudget";

const persistSources = makeFunctionReference<"mutation">(
  "sources:upsertSources",
);
const assertToolLive = makeFunctionReference<"mutation">(
  "firecrawlJobs:assertToolCallLive",
);
const createJob = makeFunctionReference<"mutation">("firecrawlJobs:createJob");
const pollFirecrawlJob = makeFunctionReference<
  "action",
  { providerJobId: string },
  unknown
>("firecrawlJobPoller:poll");

export type ProviderDocument = {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  json?: unknown;
  summary?: string;
  answer?: string;
  highlights?: string;
  links?: string[];
  images?: string[];
  audio?: string;
  video?: string;
  changeTracking?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  title?: string;
  description?: string;
  url?: string;
  sourceURL?: string;
  statusCode?: number;
  scrapeId?: string;
  [key: string]: unknown;
};

export type ProviderSource = SourceInput & {
  evidence?: string;
  providerData?: unknown;
  retrievalMethod?: Doc<"researchSources">["retrievalMethod"];
  retrievedAt?: number;
};

export function asProviderDocument(value: unknown): ProviderDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return value as ProviderDocument;
}

export function textValue(value: unknown, limit = 8_000): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\u0000/g, "").trim();
  return normalized ? normalized.slice(0, limit) : undefined;
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  return textValue(metadata?.[key], 2_000);
}

export function documentEvidence(document: ProviderDocument): string | undefined {
  return (
    textValue(document.markdown, MAX_DOCUMENT_EVIDENCE_CHARS) ??
    textValue(document.answer, MAX_DOCUMENT_EVIDENCE_CHARS) ??
    textValue(document.highlights, MAX_DOCUMENT_EVIDENCE_CHARS) ??
    textValue(document.summary, MAX_DOCUMENT_EVIDENCE_CHARS) ??
    textValue(document.html, MAX_DOCUMENT_EVIDENCE_CHARS) ??
    textValue(document.rawHtml, MAX_DOCUMENT_EVIDENCE_CHARS) ??
    textValue(
      document.json === undefined
        ? undefined
        : boundedJsonString(document.json, MAX_DOCUMENT_EVIDENCE_CHARS),
      MAX_DOCUMENT_EVIDENCE_CHARS,
    )
  );
}

export function documentStatusCode(document: ProviderDocument): number | undefined {
  const statusCode =
    typeof document.statusCode === "number"
      ? document.statusCode
      : typeof document.metadata?.statusCode === "number"
        ? document.metadata.statusCode
        : undefined;
  if (statusCode === undefined || !Number.isInteger(statusCode)) return undefined;
  return statusCode >= 100 && statusCode <= 599 ? statusCode : undefined;
}

export function assertDocumentTargetStatus(document: ProviderDocument): void {
  const statusCode = documentStatusCode(document);
  if (statusCode !== undefined && statusCode >= 400) {
    throw new Error("FIRECRAWL_TARGET_STATUS_INVALID");
  }
}

export function isTargetStatusError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message === "FIRECRAWL_TARGET_STATUS_INVALID"
  );
}

function hasFetchedDocumentEvidence(document: ProviderDocument): boolean {
  return (
    typeof document.markdown === "string" ||
    typeof document.html === "string" ||
    typeof document.rawHtml === "string" ||
    document.json !== undefined
  );
}

function evidenceCompleteness(
  document: ProviderDocument,
  retrievalMethod: Doc<"researchSources">["retrievalMethod"],
): EvidenceCompleteness {
  if (
    retrievalMethod === "firecrawl_search_web" ||
    retrievalMethod === "firecrawl_search_research" ||
    retrievalMethod === "firecrawl_search_developer" ||
    retrievalMethod === "firecrawl_map_site" ||
    retrievalMethod === "firecrawl_agent_gather"
  ) {
    return hasFetchedDocumentEvidence(document) ? "complete" : "incomplete";
  }
  return "complete";
}

function safeSourceUrl(value: string): string | undefined {
  try {
    const url = assertPublicUrlShape(value);
    return canonicalizeUrl(url.toString());
  } catch {
    return undefined;
  }
}

export function documentSource(
  document: ProviderDocument,
  fallbackUrl: string | undefined,
  sourceType: ResearchSourceType,
  retrievalMethod: Doc<"researchSources">["retrievalMethod"],
): ProviderSource | undefined {
  const metadata = document.metadata;
  const candidateUrl =
    textValue(document.sourceURL, 2_048) ??
    textValue(document.url, 2_048) ??
    metadataString(metadata, "sourceURL") ??
    metadataString(metadata, "url") ??
    fallbackUrl;
  assertDocumentTargetStatus(document);
  if (!candidateUrl) return undefined;

  const canonicalUrl = safeSourceUrl(candidateUrl);
  if (!canonicalUrl) return undefined;
  const evidence = documentEvidence(document);
  return {
    canonicalUrl,
    title:
      textValue(document.title, 500) ??
      metadataString(metadata, "title"),
    description:
      textValue(document.description, 1_000) ??
      metadataString(metadata, "description"),
    sourceType,
    publisher: (() => {
      try {
        return new URL(canonicalUrl).hostname;
      } catch {
        return undefined;
      }
    })(),
    publishedAt: parsePublishedAt(metadata),
    pageStatusCode: documentStatusCode(document),
    excerpt: evidence,
    evidence,
    evidenceCompleteness: evidenceCompleteness(document, retrievalMethod),
    providerData: {
      links: Array.isArray(document.links) ? document.links.slice(0, 50) : undefined,
      changeTracking: document.changeTracking,
    },
    citationLabel:
      textValue(document.title, 300) ?? metadataString(metadata, "title"),
    retrievalMethod,
    retrievedAt: Date.now(),
  };
}

function parsePublishedAt(metadata: Record<string, unknown> | undefined): number | undefined {
  const value = metadata?.publishedTime ?? metadata?.published_time ?? metadata?.date;
  if (typeof value !== "string") return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function resultDocumentList(value: unknown): ProviderDocument[] {
  if (Array.isArray(value)) return value.map(asProviderDocument);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data.map(asProviderDocument);
  const documents: ProviderDocument[] = [];
  for (const key of ["web", "news", "images", "developer", "research"]) {
    const entries = record[key];
    if (Array.isArray(entries)) documents.push(...entries.map(asProviderDocument));
  }
  return documents;
}

export async function persistAndBuildImmediateResult(
  context: ToolExecutionContext,
  capability: Doc<"researchSources">["retrievalMethod"],
  payload: Record<string, unknown>,
  sources: ProviderSource[],
): Promise<ExecutorResult> {
  await assertToolCallIsLive(context);
  const uniqueSources = new Map<string, ProviderSource>();
  for (const source of sources) {
    if (!uniqueSources.has(source.canonicalUrl)) uniqueSources.set(source.canonicalUrl, source);
  }
  const persisted = await context.ctx.runMutation(persistSources, {
    runId: context.run._id,
    toolCallId: context.toolCallId,
    retrievalMethod: capability,
    sources: Array.from(uniqueSources.values()).map((source) => ({
      canonicalUrl: source.canonicalUrl,
      title: source.title,
      description: source.description,
      sourceType: source.sourceType,
      publisher: source.publisher,
      publishedAt: source.publishedAt,
      pageStatusCode: source.pageStatusCode,
      contentHash: source.contentHash,
      excerpt: source.excerpt,
      citationLabel: source.citationLabel,
      evidenceCompleteness: source.evidenceCompleteness,
    })),
  });
  const sourceIdsByUrl = new Map(
    (persisted as Array<{ canonicalUrl: string; sourceId: string }>).map((entry) => [
      entry.canonicalUrl,
      entry.sourceId,
    ]),
  );
  const normalizedSources = Array.from(uniqueSources.values()).map((source) => ({
    sourceId: sourceIdsByUrl.get(source.canonicalUrl),
    url: source.canonicalUrl,
    title: source.title,
    description: source.description,
    publisher: source.publisher,
    publishedAt: source.publishedAt,
    retrievedAt: source.retrievedAt,
    retrievalMethod: capability,
    sourceType: source.sourceType,
    excerpt: source.evidence,
    citationLabel: source.citationLabel,
    pageStatusCode: source.pageStatusCode,
    evidenceCompleteness: source.evidenceCompleteness,
  }));
  const output = {
    ok: true,
    capability,
    sources: normalizedSources,
    ...payload,
  };
  return {
    kind: "immediate",
    outputJson: boundedJsonString(output, FIRECRAWL_OUTPUT_BUDGET),
  };
}

export async function assertToolCallIsLive(context: ToolExecutionContext): Promise<void> {
  await context.ctx.runMutation(assertToolLive, { toolCallId: context.toolCallId });
}

export async function startAsyncJob(
  context: ToolExecutionContext,
  capability: Doc<"researchSources">["retrievalMethod"],
  providerJobId: string,
): Promise<ExecutorResult> {
  if (!providerJobId || providerJobId.length > 500) throw new Error("PROVIDER_JOB_ID_MISSING");
  await assertToolCallIsLive(context);
  await context.ctx.runMutation(createJob, {
    toolCallId: context.toolCallId,
    capability,
    providerJobId,
  });
  await assertToolCallIsLive(context);
  await context.ctx.scheduler.runAfter(0, pollFirecrawlJob, {
    providerJobId,
  });
  return { kind: "async", providerJobId, capability };
}

export function failedProviderResult(error: unknown): ExecutorResult {
  const failure = safeProviderError(error);
  return { kind: "failed", ...failure };
}

export function sourceTypeForUrl(value: string): ResearchSourceType {
  const lower = value.toLowerCase();
  if (/\.(?:pdf)(?:$|[?#])/.test(lower)) return "pdf";
  if (/\.(?:png|jpe?g|gif|webp|svg)(?:$|[?#])/.test(lower)) return "image";
  if (/(?:youtube\.com|youtu\.be|vimeo\.com)/.test(lower)) return "video";
  return "web";
}

export function normalizeSearchEntry(
  value: unknown,
  sourceType: ResearchSourceType,
  retrievalMethod: Doc<"researchSources">["retrievalMethod"],
): ProviderSource | undefined {
  const record = asProviderDocument(value);
  const url = textValue(record.url, 2_048);
  if (!url) return undefined;
  const source = documentSource(record, url, sourceType, retrievalMethod);
  if (source) return source;
  return undefined;
}

export function providerErrorResult(error: unknown): ExecutorResult {
  return failedProviderResult(error);
}

export function isFirecrawlDocument(value: unknown): value is Document {
  return typeof value === "object" && value !== null;
}
