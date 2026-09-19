"use node";

import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { getFirecrawlClient, safeProviderError, assertPublicUrlShape } from "./lib/firecrawlClient";
import type { SourceInput } from "./sources";
import type { ProviderDocument } from "./tools/firecrawl/shared";
import {
  asProviderDocument,
  boundedJson,
  documentSource,
  resultDocumentList,
  textValue,
} from "./tools/firecrawl/shared";
import { v } from "convex/values";

type PollContext =
  | { active: false; reason: "terminal" | "run_not_live"; job: Doc<"firecrawlJobs"> }
  | {
      active: true;
      job: Doc<"firecrawlJobs">;
      toolCall: Doc<"toolCalls">;
      run: Doc<"researchRuns">;
      chat: Doc<"chats">;
      bot: Doc<"bots">;
      args: Record<string, unknown>;
    };

const preparePoll = makeFunctionReference<
  "mutation",
  { providerJobId: string },
  PollContext
>("firecrawlJobs:preparePoll");
const recordProgress = makeFunctionReference<
  "mutation",
  {
    providerJobId: string;
    completedItems?: number;
    totalItems?: number;
    creditsUsed?: number;
    pollCursor?: string;
  },
  { active: boolean }
>("firecrawlJobs:recordProgress");
const completeJob = makeFunctionReference<
  "mutation",
  {
    providerJobId: string;
    outputJson: string;
    sources: SourceInput[];
    completedItems?: number;
    totalItems?: number;
    creditsUsed?: number;
  },
  {
    active: boolean;
    reason?: string;
    runId?: Id<"researchRuns">;
    generation?: number;
    toolCallId?: Id<"toolCalls">;
    outputJson?: string;
    sources?: Array<{ sourceId: Id<"researchSources">; canonicalUrl: string }>;
  }
>("firecrawlJobs:completeJob");
const failJob = makeFunctionReference<
  "mutation",
  { providerJobId: string; errorCode: string },
  {
    active: boolean;
    runId: Id<"researchRuns">;
    generation: number;
    toolCallId: Id<"toolCalls">;
  }
>("firecrawlJobs:failJob");
const completeToolCall = makeFunctionReference<
  "mutation",
  {
    toolCallId: Id<"toolCalls">;
    status: "succeeded" | "failed";
    outputJson?: string;
    code?: string;
    retryable?: boolean;
    safeMessage?: string;
  },
  { ok: boolean; alreadyTerminal: boolean }
>("workers/runMutations:completeToolCall");
const assertRunCanDrive = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns"> },
  { ok: boolean; generation: number }
>("firecrawlJobs:assertRunCanDrive");
const driveRun = makeFunctionReference<"action">("workers/runWorker:drive");
const pollAgain = makeFunctionReference<
  "action",
  { providerJobId: string },
  unknown
>("firecrawlJobPoller:poll");

function jobDocuments(status: Record<string, unknown>): ProviderDocument[] {
  return resultDocumentList(status.data);
}

function providerSources(
  context: Extract<PollContext, { active: true }>,
  documents: ProviderDocument[],
): Array<SourceInput & { retrievedAt?: number }> {
  const urls = Array.isArray(context.args.urls) ? context.args.urls : [];
  const fallback = typeof context.args.url === "string" ? context.args.url : undefined;
  const sourceType: SourceInput["sourceType"] =
    context.toolCall.functionName === "firecrawl_agent_gather" ? "other" : "web";
  const sources: Array<SourceInput & { retrievedAt?: number }> = [];
  for (let index = 0; index < documents.length; index += 1) {
    const source = documentSource(
      documents[index],
      urls[index] ?? fallback,
      sourceType,
      context.toolCall.functionName as Doc<"researchSources">["retrievalMethod"],
    );
    if (source) sources.push(source);
  }
  if (context.toolCall.functionName === "firecrawl_agent_gather") {
    const serialized = JSON.stringify(context.args.goal ?? "");
    const urlsFromData = extractUrls(documents.length > 0 ? documents : [asProviderDocument(context.args)]);
    for (const url of urlsFromData) {
      try {
        assertPublicUrlShape(url);
      } catch {
        continue;
      }
      if (!sources.some((source) => source.canonicalUrl === url)) {
        sources.push({
          canonicalUrl: url,
          sourceType: "other",
          excerpt: serialized.slice(0, 2_000),
          citationLabel: url,
          retrievedAt: Date.now(),
        });
      }
    }
  }
  return sources.slice(0, 100);
}

function extractUrls(value: unknown, found = new Set<string>()): string[] {
  if (typeof value === "string") {
    for (const match of value.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
      found.add(match.replace(/[),.;]+$/, ""));
    }
    return Array.from(found);
  }
  if (Array.isArray(value)) {
    for (const item of value) extractUrls(item, found);
    return Array.from(found);
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) extractUrls(item, found);
  }
  return Array.from(found);
}

function statusSnapshot(
  context: Extract<PollContext, { active: true }>,
  status: Record<string, unknown>,
) {
  const documents = jobDocuments(status);
  const sources = providerSources(context, documents);
  const output = {
    ok: true,
    capability: context.toolCall.functionName,
    providerStatus: typeof status.status === "string" ? status.status : undefined,
    completedItems: typeof status.completed === "number" ? status.completed : undefined,
    totalItems: typeof status.total === "number" ? status.total : undefined,
    creditsUsed: typeof status.creditsUsed === "number" ? status.creditsUsed : undefined,
    documents: documents.slice(0, 100).map((document) => ({
      url: document.metadata?.url ?? document.metadata?.sourceURL ?? document.url,
      title: document.metadata?.title ?? document.title,
      description: document.metadata?.description ?? document.description,
      markdown: textValue(document.markdown, 8_000),
      json: boundedJson(document.json, 20_000),
      summary: textValue(document.summary, 4_000),
      answer: textValue(document.answer, 4_000),
      changeTracking: boundedJson(document.changeTracking, 12_000),
    })),
    data:
      context.toolCall.functionName === "firecrawl_agent_gather"
        ? boundedJson(status.data, 80_000)
        : undefined,
    sources: sources.map((source) => ({
      url: source.canonicalUrl,
      title: source.title,
      excerpt: source.excerpt,
      publisher: source.publisher,
      publishedAt: source.publishedAt,
      retrievedAt: source.retrievedAt,
      retrievalMethod: context.toolCall.functionName,
      citationLabel: source.citationLabel,
      pageStatusCode: source.pageStatusCode,
    })),
  };
  return { output, sources, documents };
}

function stateOf(status: Record<string, unknown>): "running" | "completed" | "failed" {
  const state = status.status;
  if (state === "completed") return "completed";
  if (state === "failed" || state === "cancelled") return "failed";
  return "running";
}

function progressOf(status: Record<string, unknown>) {
  return {
    completedItems:
      typeof status.completed === "number" ? status.completed : undefined,
    totalItems: typeof status.total === "number" ? status.total : undefined,
    creditsUsed:
      typeof status.creditsUsed === "number" ? status.creditsUsed : undefined,
    pollCursor: typeof status.next === "string" ? status.next : undefined,
  };
}

async function safeCompleteFailure(
  ctx: ActionCtx,
  toolCallId: Id<"toolCalls">,
  failure: { code: string; retryable: boolean; safeMessage: string },
) {
  try {
    await ctx.runMutation(completeToolCall, {
      toolCallId,
      status: "failed",
      code: failure.code,
      retryable: failure.retryable,
      safeMessage: failure.safeMessage,
    });
  } catch {
    return;
  }
}

export const poll = internalAction({
  args: { providerJobId: v.string() },
  handler: async (ctx, args) => {
    const prepared = await ctx.runMutation(preparePoll, args);
    if (!prepared.active) {
      if (prepared.reason === "run_not_live") {
        await safeCompleteFailure(ctx, prepared.job.toolCallId, {
          code: "run_not_live",
          retryable: false,
          safeMessage: "The research run is no longer active.",
        });
      }
      return { ok: true, active: false };
    }

    try {
      const client = getFirecrawlClient();
      let status: Record<string, unknown>;
      switch (prepared.toolCall.functionName) {
        case "firecrawl_batch_scrape":
        case "firecrawl_extract_structured":
          status = (await client.getBatchScrapeStatus(args.providerJobId, {
            autoPaginate: false,
            maxResults: 100,
            maxPages: 1,
          })) as unknown as Record<string, unknown>;
          break;
        case "firecrawl_crawl_site":
          status = (await client.getCrawlStatus(args.providerJobId, {
            autoPaginate: false,
            maxResults: 100,
            maxPages: 1,
          })) as unknown as Record<string, unknown>;
          break;
        case "firecrawl_agent_gather":
          status = (await client.getAgentStatus(args.providerJobId)) as unknown as Record<string, unknown>;
          break;
        default:
          throw new Error("UNSUPPORTED_FIRECRAWL_JOB");
      }

      const state = stateOf(status);
      if (state === "running") {
        const progress = progressOf(status);
        const progressResult = await ctx.runMutation(recordProgress, {
          providerJobId: args.providerJobId,
          ...progress,
        });
        if (progressResult.active) {
          await ctx.scheduler.runAfter(5_000, pollAgain, args);
        }
        return { ok: true, active: progressResult.active, state };
      }

      if (state === "failed") {
        const failure = safeProviderError(status.error ?? new Error("Firecrawl job failed"));
        const failed = await ctx.runMutation(failJob, {
          providerJobId: args.providerJobId,
          errorCode: failure.code,
        });
        if (failed.active) await safeCompleteFailure(ctx, failed.toolCallId, failure);
        return { ok: false, active: failed.active, state };
      }

      const normalized = statusSnapshot(prepared, status);
      const progress = progressOf(status);
      const completed = await ctx.runMutation(completeJob, {
        providerJobId: args.providerJobId,
        outputJson: JSON.stringify(normalized.output),
        sources: normalized.sources,
        ...progress,
      });
      if (!completed.active || completed.runId === undefined || completed.generation === undefined) {
        return { ok: true, active: false, state };
      }
      const sourceIds = new Map(
        (completed.sources ?? []).map((source) => [source.canonicalUrl, source.sourceId]),
      );
      const finalOutput = {
        ...normalized.output,
        sources: normalized.sources.map((source) => ({
          sourceId: sourceIds.get(source.canonicalUrl),
          url: source.canonicalUrl,
          title: source.title,
          description: source.description,
          publisher: source.publisher,
          publishedAt: source.publishedAt,
          retrievedAt: source.retrievedAt,
          retrievalMethod: prepared.toolCall.functionName,
          excerpt: source.excerpt,
          citationLabel: source.citationLabel,
          pageStatusCode: source.pageStatusCode,
        })),
      };
      const completion = await ctx.runMutation(completeToolCall, {
        toolCallId: completed.toolCallId!,
        status: "succeeded",
        outputJson: JSON.stringify(boundedJson(finalOutput)),
      });
      if (!completion.alreadyTerminal) {
        const continuation = await ctx.runMutation(assertRunCanDrive, {
          runId: completed.runId,
        });
        if (continuation.ok) {
          await ctx.scheduler.runAfter(0, driveRun, {
            runId: completed.runId,
            generation: continuation.generation + 1,
          });
        }
      }
      return { ok: true, active: true, state };
    } catch (error) {
      const failure = safeProviderError(error);
      const failed = await ctx.runMutation(failJob, {
        providerJobId: args.providerJobId,
        errorCode: failure.code,
      });
      if (failed.active) await safeCompleteFailure(ctx, failed.toolCallId, failure);
      return { ok: false, active: failed.active, state: "failed" as const };
    }
  },
});
