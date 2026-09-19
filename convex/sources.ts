import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { canonicalizeUrl, sha256Hex } from "./lib/normalize";
import { v } from "convex/values";

export type ResearchSourceType =
  | "web"
  | "news"
  | "research"
  | "developer"
  | "pdf"
  | "document"
  | "image"
  | "video"
  | "other";

export type EvidenceCompleteness = "complete" | "incomplete";

export const EVIDENCE_COMPLETE_MARKER = "evidence_complete";
export const EVIDENCE_INCOMPLETE_MARKER = "evidence_incomplete";

export type SourceInput = {
  canonicalUrl: string;
  title?: string;
  description?: string;
  sourceType: ResearchSourceType;
  publisher?: string;
  publishedAt?: number;
  pageStatusCode?: number;
  contentHash?: string;
  excerpt?: string;
  citationLabel?: string;
  evidenceCompleteness?: EvidenceCompleteness;
};

const sourceTypeValidator = v.union(
  v.literal("web"),
  v.literal("news"),
  v.literal("research"),
  v.literal("developer"),
  v.literal("pdf"),
  v.literal("document"),
  v.literal("image"),
  v.literal("video"),
  v.literal("other"),
);

const sourceInputValidator = v.object({
  canonicalUrl: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  sourceType: sourceTypeValidator,
  publisher: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  pageStatusCode: v.optional(v.number()),
  contentHash: v.optional(v.string()),
  excerpt: v.optional(v.string()),
  citationLabel: v.optional(v.string()),
  evidenceCompleteness: v.optional(
    v.union(v.literal("complete"), v.literal("incomplete")),
  ),
});

const MAX_TITLE = 500;
const MAX_DESCRIPTION = 1_000;
const MAX_EXCERPT = 6_000;
const MAX_PUBLISHER = 300;
const MAX_CITATION_LABEL = 300;

const FETCHED_RETRIEVAL_METHODS = new Set<string>([
  "firecrawl_scrape_page",
  "firecrawl_batch_scrape",
  "firecrawl_crawl_site",
  "firecrawl_parse_document",
  "firecrawl_extract_structured",
  "firecrawl_query_page",
  "firecrawl_interact_page",
  "firecrawl_browser_research",
  "firecrawl_extract_media",
  "firecrawl_compare_page_change",
]);

function bounded(value: string | undefined, limit: number): string | undefined {
  const trimmed = value?.replace(/\u0000/g, "").trim();
  return trimmed ? trimmed.slice(0, limit) : undefined;
}

function normalizeSourceUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("attachment://")) {
    if (trimmed.length > 2_048 || /[\s<>]/.test(trimmed)) throw new Error("INVALID_SOURCE_URL");
    return trimmed;
  }
  try {
    const url = canonicalizeUrl(trimmed);
    if (url.length > 2_048) throw new Error("INVALID_SOURCE_URL");
    return url;
  } catch {
    throw new Error("INVALID_SOURCE_URL");
  }
}

function sourceCandidate(
  value: SourceInput,
  retrievalMethod: Doc<"researchSources">["retrievalMethod"],
): SourceInput {
  return {
    canonicalUrl: normalizeSourceUrl(value.canonicalUrl),
    title: bounded(value.title, MAX_TITLE),
    description: bounded(value.description, MAX_DESCRIPTION),
    sourceType: value.sourceType,
    publisher: bounded(value.publisher, MAX_PUBLISHER),
    publishedAt:
      value.publishedAt !== undefined && Number.isFinite(value.publishedAt)
        ? value.publishedAt
        : undefined,
    pageStatusCode:
      value.pageStatusCode !== undefined &&
      Number.isInteger(value.pageStatusCode) &&
      value.pageStatusCode >= 100 &&
      value.pageStatusCode <= 599
        ? value.pageStatusCode
        : undefined,
    contentHash: bounded(value.contentHash, 200),
    excerpt: bounded(value.excerpt, MAX_EXCERPT),
    citationLabel: bounded(value.citationLabel, MAX_CITATION_LABEL),
    evidenceCompleteness:
      value.evidenceCompleteness ??
      (FETCHED_RETRIEVAL_METHODS.has(retrievalMethod) ? "complete" : "incomplete"),
  };
}

export function isEvidenceComplete(source: {
  disposition: Doc<"researchSources">["disposition"];
  rejectionReason?: string;
  retrievalMethod: Doc<"researchSources">["retrievalMethod"];
}): boolean {
  if (source.disposition === "rejected" || source.disposition === "failed") return false;
  if (source.rejectionReason === EVIDENCE_COMPLETE_MARKER) return true;
  if (source.rejectionReason !== undefined) return false;
  return FETCHED_RETRIEVAL_METHODS.has(source.retrievalMethod);
}

export function isCitableSource(source: {
  disposition: Doc<"researchSources">["disposition"];
  rejectionReason?: string;
  retrievalMethod: Doc<"researchSources">["retrievalMethod"];
}): boolean {
  return isEvidenceComplete(source);
}

export async function upsertSourceRecords(
  ctx: MutationCtx,
  args: {
    ownerId: Id<"users">;
    runId: Id<"researchRuns">;
    toolCallId?: Id<"toolCalls">;
    retrievalMethod: Doc<"researchSources">["retrievalMethod"];
    sources: SourceInput[];
  },
): Promise<Array<{ sourceId: Id<"researchSources">; canonicalUrl: string }>> {
  const run = await ctx.db.get("researchRuns", args.runId);
  if (
    run === null ||
    run.ownerId !== args.ownerId ||
    (args.toolCallId !== undefined && run.ownerId !== args.ownerId)
  ) {
    throw new Error("SOURCE_RUN_NOT_OWNED");
  }
  if (args.toolCallId !== undefined) {
    const toolCall = await ctx.db.get("toolCalls", args.toolCallId);
    const chat = await ctx.db.get("chats", run.chatId);
    const bot = await ctx.db.get("bots", run.botId);
    if (
      toolCall === null ||
      chat === null ||
      bot === null ||
      toolCall.ownerId !== args.ownerId ||
      toolCall.runId !== args.runId ||
      toolCall.status !== "running" ||
      run.cancelRequested ||
      chat.ownerId !== args.ownerId ||
      bot.ownerId !== args.ownerId ||
      chat.status !== "active" ||
      bot.status !== "active" ||
      chat.activeRunId !== run._id
    ) {
      throw new Error("SOURCE_TOOL_CALL_NOT_LIVE");
    }
  }

  const byUrl = new Map<string, SourceInput>();
  for (const input of args.sources) {
    const candidate = sourceCandidate(input, args.retrievalMethod);
    if (!byUrl.has(candidate.canonicalUrl)) byUrl.set(candidate.canonicalUrl, candidate);
  }

  const result: Array<{ sourceId: Id<"researchSources">; canonicalUrl: string }> = [];
  for (const candidate of byUrl.values()) {
    const urlHash = await sha256Hex(candidate.canonicalUrl);
    const existing = await ctx.db
      .query("researchSources")
      .withIndex("by_run_url_hash", (q) =>
        q.eq("runId", args.runId).eq("urlHash", urlHash),
      )
      .first();
    const now = Date.now();
    if (existing !== null) {
      if (existing.ownerId !== args.ownerId || existing.canonicalUrl !== candidate.canonicalUrl) {
        throw new Error("SOURCE_OWNERSHIP_INVALID");
      }
      const incomingComplete = candidate.evidenceCompleteness === "complete";
      const existingComplete = isEvidenceComplete(existing);
      const preserveExisting = existingComplete && !incomingComplete;
      const evidenceMarker = incomingComplete || existingComplete
        ? EVIDENCE_COMPLETE_MARKER
        : EVIDENCE_INCOMPLETE_MARKER;
      await ctx.db.patch("researchSources", existing._id, {
        toolCallId: args.toolCallId ?? existing.toolCallId,
        title: preserveExisting ? existing.title : candidate.title ?? existing.title,
        description: preserveExisting
          ? existing.description
          : candidate.description ?? existing.description,
        sourceType: preserveExisting ? existing.sourceType : candidate.sourceType,
        publisher: preserveExisting ? existing.publisher : candidate.publisher ?? existing.publisher,
        publishedAt: preserveExisting ? existing.publishedAt : candidate.publishedAt ?? existing.publishedAt,
        pageStatusCode: preserveExisting
          ? existing.pageStatusCode
          : candidate.pageStatusCode ?? existing.pageStatusCode,
        contentHash: preserveExisting ? existing.contentHash : candidate.contentHash ?? existing.contentHash,
        excerpt: preserveExisting ? existing.excerpt : candidate.excerpt ?? existing.excerpt,
        citationLabel: preserveExisting
          ? existing.citationLabel
          : candidate.citationLabel ?? existing.citationLabel,
        retrievedAt: now,
        retrievalMethod: preserveExisting ? existing.retrievalMethod : args.retrievalMethod,
        disposition:
          (incomingComplete || existingComplete) && existing.disposition === "used"
            ? "used"
            : "candidate",
        rejectionReason: evidenceMarker,
      });
      result.push({ sourceId: existing._id, canonicalUrl: candidate.canonicalUrl });
      continue;
    }

    const sourceId = await ctx.db.insert("researchSources", {
      ownerId: args.ownerId,
      runId: args.runId,
      toolCallId: args.toolCallId,
      canonicalUrl: candidate.canonicalUrl,
      urlHash,
      title: candidate.title,
      description: candidate.description,
      sourceType: candidate.sourceType,
      publisher: candidate.publisher,
      publishedAt: candidate.publishedAt,
      retrievedAt: now,
      retrievalMethod: args.retrievalMethod,
      pageStatusCode: candidate.pageStatusCode,
      contentHash: candidate.contentHash,
      excerpt: candidate.excerpt,
      disposition: "candidate",
      citationLabel: candidate.citationLabel,
      rejectionReason:
        candidate.evidenceCompleteness === "complete"
          ? EVIDENCE_COMPLETE_MARKER
          : EVIDENCE_INCOMPLETE_MARKER,
    });
    result.push({ sourceId, canonicalUrl: candidate.canonicalUrl });
  }
  return result;
}

export const upsertSources = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    toolCallId: v.optional(v.id("toolCalls")),
    retrievalMethod: v.union(
      v.literal("firecrawl_search_web"),
      v.literal("firecrawl_search_research"),
      v.literal("firecrawl_search_developer"),
      v.literal("firecrawl_map_site"),
      v.literal("firecrawl_scrape_page"),
      v.literal("firecrawl_batch_scrape"),
      v.literal("firecrawl_crawl_site"),
      v.literal("firecrawl_parse_document"),
      v.literal("firecrawl_extract_structured"),
      v.literal("firecrawl_query_page"),
      v.literal("firecrawl_interact_page"),
      v.literal("firecrawl_browser_research"),
      v.literal("firecrawl_extract_media"),
      v.literal("firecrawl_compare_page_change"),
      v.literal("firecrawl_agent_gather"),
    ),
    sources: v.array(sourceInputValidator),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null) throw new Error("NOT_FOUND");
    return await upsertSourceRecords(ctx, {
      ownerId: run.ownerId,
      runId: args.runId,
      toolCallId: args.toolCallId,
      retrievalMethod: args.retrievalMethod,
      sources: args.sources,
    });
  },
});

export const listSourcesForRun = internalQuery({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null) throw new Error("NOT_FOUND");
    const sources = await ctx.db
      .query("researchSources")
      .withIndex("by_run_retrieved", (q) => q.eq("runId", args.runId))
      .order("asc")
      .collect();
    return sources.filter((source) => source.ownerId === run.ownerId);
  },
});

export const listCitableSourcesForRun = internalQuery({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null) throw new Error("NOT_FOUND");
    const sources = await ctx.db
      .query("researchSources")
      .withIndex("by_run_retrieved", (q) => q.eq("runId", args.runId))
      .order("asc")
      .collect();
    return sources
      .filter((source) => source.ownerId === run.ownerId && isCitableSource(source))
      .map((source) => ({ canonicalUrl: source.canonicalUrl }));
  },
});

export const markSourcesUsed = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    canonicalUrls: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null) throw new Error("NOT_FOUND");
    const normalized = new Set(args.canonicalUrls.map(normalizeSourceUrl));
    const sources = await ctx.db
      .query("researchSources")
      .withIndex("by_run_retrieved", (q) => q.eq("runId", args.runId))
      .collect();
    let marked = 0;
    for (const source of sources) {
      if (
        source.ownerId === run.ownerId &&
        normalized.has(source.canonicalUrl) &&
        isCitableSource(source)
      ) {
        await ctx.db.patch("researchSources", source._id, {
          disposition: "used",
          rejectionReason: EVIDENCE_COMPLETE_MARKER,
        });
        marked += 1;
      }
    }
    return { marked };
  },
});
