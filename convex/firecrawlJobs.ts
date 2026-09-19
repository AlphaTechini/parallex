import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { validateToolArguments, isToolFunctionName } from "./tools/definitions";
import {
  boundedJsonString,
  FIRECRAWL_OUTPUT_BUDGET,
} from "./tools/firecrawl/outputBudget";
import { upsertSourceRecords } from "./sources";
import { v } from "convex/values";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "canceled", "closed"]);
const TOOL_WATCHDOG_MS = 6 * 60 * 1000;

const driveRun = makeFunctionReference<
  "action",
  { runId: Id<"researchRuns">; generation: number }
>("workers/runWorker:drive");

const capabilityValidator = v.union(
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
);

const sourceInputValidator = v.object({
  canonicalUrl: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
  sourceType: v.union(
    v.literal("web"),
    v.literal("news"),
    v.literal("research"),
    v.literal("developer"),
    v.literal("pdf"),
    v.literal("document"),
    v.literal("image"),
    v.literal("video"),
    v.literal("other"),
  ),
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

type OwnedToolGraph = {
  call: Doc<"toolCalls">;
  run: Doc<"researchRuns">;
  chat: Doc<"chats">;
  bot: Doc<"bots">;
};

type ToolFailure = {
  code: string;
  retryable: boolean;
  safeMessage: string;
};

async function loadOwnedToolGraph(
  ctx: MutationCtx,
  toolCallId: Id<"toolCalls">,
): Promise<OwnedToolGraph> {
  const call = await ctx.db.get("toolCalls", toolCallId);
  if (call === null) throw new Error("TOOL_CALL_NOT_FOUND");
  const run = await ctx.db.get("researchRuns", call.runId);
  const chat = run === null ? null : await ctx.db.get("chats", run.chatId);
  const bot = run === null ? null : await ctx.db.get("bots", run.botId);
  if (
    run === null ||
    chat === null ||
    bot === null ||
    call.ownerId !== run.ownerId ||
    run.ownerId !== chat.ownerId ||
    run.ownerId !== bot.ownerId ||
    run.botId !== bot._id ||
    run.chatId !== chat._id ||
    chat.botId !== bot._id
  ) {
    throw new Error("TOOL_CALL_OWNERSHIP_INVALID");
  }
  return { call, run, chat, bot };
}

function isRunLive(graph: OwnedToolGraph): boolean {
  return (
    !TERMINAL_RUN_STATUSES.has(graph.run.status) &&
    !graph.run.cancelRequested &&
    graph.chat.status === "active" &&
    graph.bot.status === "active" &&
    graph.chat.activeRunId === graph.run._id
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failureResult(failure: ToolFailure): string {
  return JSON.stringify({
    ok: false,
    error: {
      code: failure.code,
      message: failure.safeMessage,
      retryable: failure.retryable,
    },
  });
}

async function completeToolCallInTransaction(
  ctx: MutationCtx,
  graph: OwnedToolGraph,
  completion:
    | { status: "succeeded"; outputJson: string }
    | { status: "failed"; failure: ToolFailure },
): Promise<{ alreadyTerminal: boolean }> {
  if (graph.call.status === "succeeded" || graph.call.status === "failed") {
    return { alreadyTerminal: true };
  }
  if (graph.call.status !== "running") throw new Error("TOOL_CALL_NOT_RUNNING");

  const resultJson =
    completion.status === "succeeded"
      ? completion.outputJson
      : failureResult(completion.failure);
  if (completion.status === "succeeded") {
    try {
      JSON.parse(resultJson);
    } catch {
      throw new Error("TOOL_OUTPUT_INVALID_JSON");
    }
    if (resultJson.length > FIRECRAWL_OUTPUT_BUDGET) {
      throw new Error("FIRECRAWL_OUTPUT_TOO_LARGE");
    }
  }

  await ctx.db.patch("toolCalls", graph.call._id, {
    status: completion.status,
    resultJson,
    failureCode:
      completion.status === "failed" ? completion.failure.code : undefined,
    completedAt: Date.now(),
  });
  const events = await ctx.db
    .query("runEvents")
    .withIndex("by_tool_call", (q) => q.eq("toolCallId", graph.call._id))
    .collect();
  for (const event of events) {
    await ctx.db.patch("runEvents", event._id, {
      status: completion.status === "succeeded" ? "completed" : "failed",
      safeDetail:
        completion.status === "failed"
          ? completion.failure.safeMessage
          : event.safeDetail,
    });
  }

  if (graph.call.originResponseId !== undefined && !TERMINAL_RUN_STATUSES.has(graph.run.status)) {
    const siblings = (await ctx.db
      .query("toolCalls")
      .withIndex("by_run_requested", (q) => q.eq("runId", graph.run._id))
      .collect()).filter((candidate) => candidate.originResponseId === graph.call.originResponseId);
    const allTerminal = siblings.every(
      (candidate) =>
        candidate.status === "succeeded" || candidate.status === "failed",
    );
    if (allTerminal) {
      await ctx.scheduler.runAfter(0, driveRun, {
        runId: graph.run._id,
        generation: graph.run.workerGeneration + 1,
      });
      await ctx.scheduler.runAfter(TOOL_WATCHDOG_MS, driveRun, {
        runId: graph.run._id,
        generation: graph.run.workerGeneration + 2,
      });
    }
  }
  return { alreadyTerminal: false };
}

async function repairRunningToolCall(
  ctx: MutationCtx,
  graph: OwnedToolGraph,
  failure: ToolFailure,
): Promise<void> {
  if (graph.call.status !== "running") return;
  await completeToolCallInTransaction(ctx, graph, { status: "failed", failure });
}

function outputWithSourceIds(
  outputJson: string,
  sources: Array<{ sourceId: Id<"researchSources">; canonicalUrl: string }>,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputJson);
  } catch {
    throw new Error("FIRECRAWL_OUTPUT_INVALID_JSON");
  }
  if (!isRecord(parsed)) throw new Error("FIRECRAWL_OUTPUT_INVALID_SHAPE");
  const sourceIds = new Map(sources.map((source) => [source.canonicalUrl, source.sourceId]));
  const outputSources = parsed.sources;
  const withIds = Array.isArray(outputSources)
    ? outputSources.map((source) => {
        if (!isRecord(source)) return source;
        const url = typeof source.url === "string" ? source.url : undefined;
        const sourceId = url === undefined ? undefined : sourceIds.get(url);
        return sourceId === undefined ? source : { ...source, sourceId };
      })
    : outputSources;
  return boundedJsonString(
    { ...parsed, sources: withIds },
    FIRECRAWL_OUTPUT_BUDGET,
  );
}

async function attachmentForTool(
  ctx: MutationCtx,
  graph: OwnedToolGraph,
  attachmentId: string,
) {
  const attachment = await ctx.db.get(
    "messageAttachments",
    attachmentId as Id<"messageAttachments">,
  );
  if (
    attachment === null ||
    attachment.ownerId !== graph.run.ownerId ||
    attachment.chatId !== graph.run.chatId ||
    attachment.runId !== graph.run._id ||
    (attachment.status !== "bound" && attachment.status !== "parsed")
  ) {
    throw new Error("ATTACHMENT_NOT_AVAILABLE");
  }
  return attachment;
}

export const getToolExecutionContext = internalMutation({
  args: { toolCallId: v.id("toolCalls") },
  handler: async (ctx, args) => {
    const graph = await loadOwnedToolGraph(ctx, args.toolCallId);
    if (graph.call.status !== "running") {
      throw new Error("TOOL_CALL_NOT_RUNNING");
    }
    if (!isRunLive(graph)) throw new Error("RUN_NOT_LIVE");
    if (!isToolFunctionName(graph.call.functionName)) throw new Error("UNKNOWN_TOOL");
    const validation = validateToolArguments(
      graph.call.functionName,
      graph.call.argumentsJson,
    );
    if (!validation.ok) throw new Error(validation.code);

    const attachments = [];
    const attachmentId = validation.value.attachmentId;
    if (typeof attachmentId === "string") {
      const attachment = await attachmentForTool(ctx, graph, attachmentId);
      attachments.push({
        id: attachment._id,
        storageId: attachment.storageId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        status: attachment.status,
      });
    }

    return {
      toolCall: graph.call,
      run: graph.run,
      chat: graph.chat,
      bot: graph.bot,
      args: validation.value,
      attachments,
    };
  },
});

export const assertToolCallLive = internalMutation({
  args: { toolCallId: v.id("toolCalls") },
  handler: async (ctx, args) => {
    const graph = await loadOwnedToolGraph(ctx, args.toolCallId);
    if (graph.call.status !== "running") throw new Error("TOOL_CALL_NOT_RUNNING");
    if (!isRunLive(graph)) throw new Error("RUN_NOT_LIVE");
    return { ok: true, runId: graph.run._id, generation: graph.run.workerGeneration };
  },
});

export const assertRunCanDrive = internalMutation({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null) throw new Error("RUN_NOT_FOUND");
    const chat = await ctx.db.get("chats", run.chatId);
    const bot = await ctx.db.get("bots", run.botId);
    if (
      chat === null ||
      bot === null ||
      run.ownerId !== chat.ownerId ||
      run.ownerId !== bot.ownerId ||
      run.botId !== bot._id ||
      run.chatId !== chat._id ||
      run.cancelRequested ||
      TERMINAL_RUN_STATUSES.has(run.status) ||
      chat.status !== "active" ||
      bot.status !== "active"
    ) {
      return { ok: false, generation: run.workerGeneration };
    }
    return { ok: true, generation: run.workerGeneration };
  },
});

export const createJob = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    capability: capabilityValidator,
    providerJobId: v.string(),
  },
  handler: async (ctx, args) => {
    const graph = await loadOwnedToolGraph(ctx, args.toolCallId);
    if (graph.call.functionName !== args.capability) throw new Error("JOB_CAPABILITY_CONFLICT");
    if (!isRunLive(graph) || graph.call.status !== "running") throw new Error("RUN_NOT_LIVE");

    const existing = await ctx.db
      .query("firecrawlJobs")
      .withIndex("by_tool_call", (q) => q.eq("toolCallId", args.toolCallId))
      .first();
    if (existing !== null) {
      if (
        existing.ownerId !== graph.run.ownerId ||
        existing.runId !== graph.run._id ||
        existing.capability !== args.capability ||
        existing.providerJobId !== args.providerJobId
      ) {
        throw new Error("JOB_IDEMPOTENCY_CONFLICT");
      }
      if (existing.status === "starting") {
        await ctx.db.patch("firecrawlJobs", existing._id, {
          status: "running",
          updatedAt: Date.now(),
        });
      }
      return { jobId: existing._id, providerJobId: existing.providerJobId };
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("firecrawlJobs", {
      ownerId: graph.run.ownerId,
      runId: graph.run._id,
      toolCallId: args.toolCallId,
      capability: args.capability,
      providerJobId: args.providerJobId,
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
    return { jobId, providerJobId: args.providerJobId };
  },
});

export const preparePoll = internalMutation({
  args: { providerJobId: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("firecrawlJobs")
      .withIndex("by_provider_job", (q) => q.eq("providerJobId", args.providerJobId))
      .unique();
    if (job === null) throw new Error("FIRECRAWL_JOB_NOT_FOUND");
    const graph = await loadOwnedToolGraph(ctx, job.toolCallId);
    if (job.ownerId !== graph.run.ownerId || job.runId !== graph.run._id) {
      throw new Error("FIRECRAWL_JOB_OWNERSHIP_INVALID");
    }
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      await repairRunningToolCall(ctx, graph, {
        code: "firecrawl_job_completion_recovery",
        retryable: false,
        safeMessage: "The Firecrawl job completed before its tool result was recorded.",
      });
      return { active: false as const, reason: "terminal" as const, job };
    }
    if (!isRunLive(graph)) {
      await ctx.db.patch("firecrawlJobs", job._id, {
        status: "canceled",
        lastErrorCode: "run_not_live",
        updatedAt: Date.now(),
      });
      await repairRunningToolCall(ctx, graph, {
        code: "run_not_live",
        retryable: false,
        safeMessage: "The research run is no longer active.",
      });
      return { active: false as const, reason: "run_not_live" as const, job };
    }
    await ctx.db.patch("firecrawlJobs", job._id, {
      status: "running",
      lastPolledAt: Date.now(),
      updatedAt: Date.now(),
    });
    const validation = validateToolArguments(graph.call.functionName, graph.call.argumentsJson);
    if (!validation.ok) throw new Error(validation.code);
    return {
      active: true as const,
      job,
      toolCall: graph.call,
      run: graph.run,
      chat: graph.chat,
      bot: graph.bot,
      args: validation.value,
    };
  },
});

export const recordProgress = internalMutation({
  args: {
    providerJobId: v.string(),
    completedItems: v.optional(v.number()),
    totalItems: v.optional(v.number()),
    creditsUsed: v.optional(v.number()),
    pollCursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("firecrawlJobs")
      .withIndex("by_provider_job", (q) => q.eq("providerJobId", args.providerJobId))
      .unique();
    if (job === null) throw new Error("FIRECRAWL_JOB_NOT_FOUND");
    const graph = await loadOwnedToolGraph(ctx, job.toolCallId);
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      await repairRunningToolCall(ctx, graph, {
        code: "firecrawl_job_completion_recovery",
        retryable: false,
        safeMessage: "The Firecrawl job completed before its tool result was recorded.",
      });
      return { active: false };
    }
    if (!isRunLive(graph) || job.ownerId !== graph.run.ownerId) {
      await ctx.db.patch("firecrawlJobs", job._id, {
        status: "canceled",
        lastErrorCode: "run_not_live",
        updatedAt: Date.now(),
      });
      await repairRunningToolCall(ctx, graph, {
        code: "run_not_live",
        retryable: false,
        safeMessage: "The research run is no longer active.",
      });
      return { active: false };
    }
    await ctx.db.patch("firecrawlJobs", job._id, {
      status: "running",
      completedItems: args.completedItems,
      totalItems: args.totalItems,
      creditsUsed: args.creditsUsed,
      pollCursor: args.pollCursor,
      lastPolledAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { active: true };
  },
});

export const completeJob = internalMutation({
  args: {
    providerJobId: v.string(),
    outputJson: v.string(),
    sources: v.array(sourceInputValidator),
    completedItems: v.optional(v.number()),
    totalItems: v.optional(v.number()),
    creditsUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("firecrawlJobs")
      .withIndex("by_provider_job", (q) => q.eq("providerJobId", args.providerJobId))
      .unique();
    if (job === null) throw new Error("FIRECRAWL_JOB_NOT_FOUND");
    const graph = await loadOwnedToolGraph(ctx, job.toolCallId);
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      await repairRunningToolCall(ctx, graph, {
        code: "firecrawl_job_completion_recovery",
        retryable: false,
        safeMessage: "The Firecrawl job completed before its tool result was recorded.",
      });
      return { active: false as const, reason: "terminal" as const };
    }
    if (!isRunLive(graph) || job.ownerId !== graph.run.ownerId) {
      await ctx.db.patch("firecrawlJobs", job._id, {
        status: "canceled",
        lastErrorCode: "run_not_live",
        updatedAt: Date.now(),
      });
      await repairRunningToolCall(ctx, graph, {
        code: "run_not_live",
        retryable: false,
        safeMessage: "The research run is no longer active.",
      });
      return { active: false as const, reason: "run_not_live" as const };
    }
    if (args.outputJson.length > FIRECRAWL_OUTPUT_BUDGET) {
      throw new Error("FIRECRAWL_OUTPUT_TOO_LARGE");
    }
    let parsedOutput: unknown;
    try {
      parsedOutput = JSON.parse(args.outputJson);
    } catch {
      throw new Error("FIRECRAWL_OUTPUT_INVALID_JSON");
    }
    if (!isRecord(parsedOutput)) throw new Error("FIRECRAWL_OUTPUT_INVALID_SHAPE");
    const persistedSources = await upsertSourceRecords(ctx, {
      ownerId: graph.run.ownerId,
      runId: graph.run._id,
      toolCallId: graph.call._id,
      retrievalMethod: job.capability,
      sources: args.sources,
    });
    const resultJson = outputWithSourceIds(args.outputJson, persistedSources);
    await completeToolCallInTransaction(ctx, graph, {
      status: "succeeded",
      outputJson: resultJson,
    });
    await ctx.db.patch("firecrawlJobs", job._id, {
      status: "completed",
      completedItems: args.completedItems,
      totalItems: args.totalItems,
      creditsUsed: args.creditsUsed,
      lastPolledAt: Date.now(),
      updatedAt: Date.now(),
    });
    return {
      active: true as const,
      runId: graph.run._id,
      generation: graph.run.workerGeneration,
      toolCallId: graph.call._id,
      outputJson: resultJson,
      sources: persistedSources,
    };
  },
});

export const failJob = internalMutation({
  args: {
    providerJobId: v.string(),
    errorCode: v.string(),
    retryable: v.optional(v.boolean()),
    safeMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("firecrawlJobs")
      .withIndex("by_provider_job", (q) => q.eq("providerJobId", args.providerJobId))
      .unique();
    if (job === null) throw new Error("FIRECRAWL_JOB_NOT_FOUND");
    const graph = await loadOwnedToolGraph(ctx, job.toolCallId);
    if (job.ownerId !== graph.run.ownerId || job.runId !== graph.run._id) {
      throw new Error("FIRECRAWL_JOB_OWNERSHIP_INVALID");
    }
    const failure: ToolFailure = {
      code: args.errorCode.slice(0, 200),
      retryable: args.retryable ?? false,
      safeMessage:
        args.safeMessage?.slice(0, 2_000) ??
        "Firecrawl could not complete the research request.",
    };
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      await repairRunningToolCall(ctx, graph, failure);
      return {
        active: false,
        runId: graph.run._id,
        generation: graph.run.workerGeneration,
        toolCallId: graph.call._id,
      };
    }
    const active = isRunLive(graph) && job.ownerId === graph.run.ownerId;
    await ctx.db.patch("firecrawlJobs", job._id, {
      status: active ? "failed" : "canceled",
      lastErrorCode: failure.code,
      updatedAt: Date.now(),
    });
    await repairRunningToolCall(ctx, graph, failure);
    return {
      active,
      runId: graph.run._id,
      generation: graph.run.workerGeneration,
      toolCallId: graph.call._id,
    };
  },
});

export const markAttachmentParsing = internalMutation({
  args: { toolCallId: v.id("toolCalls"), attachmentId: v.id("messageAttachments") },
  handler: async (ctx, args) => {
    const graph = await loadOwnedToolGraph(ctx, args.toolCallId);
    if (graph.call.status !== "running" || !isRunLive(graph)) throw new Error("RUN_NOT_LIVE");
    const attachment = await ctx.db.get("messageAttachments", args.attachmentId);
    if (
      attachment === null ||
      attachment.ownerId !== graph.run.ownerId ||
      attachment.runId !== graph.run._id ||
      attachment.chatId !== graph.run.chatId ||
      (attachment.status !== "bound" && attachment.status !== "parsed")
    ) {
      throw new Error("ATTACHMENT_NOT_AVAILABLE");
    }
    await ctx.db.patch("messageAttachments", attachment._id, {
      status: "parsing",
      updatedAt: Date.now(),
    });
    return { ok: true, storageId: attachment.storageId, fileName: attachment.fileName, mimeType: attachment.mimeType };
  },
});

export const markAttachmentParsed = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    attachmentId: v.id("messageAttachments"),
    firecrawlDocumentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const graph = await loadOwnedToolGraph(ctx, args.toolCallId);
    if (graph.call.status !== "running" || !isRunLive(graph)) throw new Error("RUN_NOT_LIVE");
    const attachment = await ctx.db.get("messageAttachments", args.attachmentId);
    if (
      attachment === null ||
      attachment.ownerId !== graph.run.ownerId ||
      attachment.runId !== graph.run._id ||
      attachment.chatId !== graph.run.chatId
    ) {
      throw new Error("ATTACHMENT_OWNERSHIP_INVALID");
    }
    await ctx.db.patch("messageAttachments", attachment._id, {
      status: "parsed",
      firecrawlDocumentId: args.firecrawlDocumentId,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const markAttachmentFailed = internalMutation({
  args: { toolCallId: v.id("toolCalls"), attachmentId: v.id("messageAttachments") },
  handler: async (ctx, args) => {
    const graph = await loadOwnedToolGraph(ctx, args.toolCallId);
    if (graph.call.status !== "running" || !isRunLive(graph)) throw new Error("RUN_NOT_LIVE");
    const attachment = await ctx.db.get("messageAttachments", args.attachmentId);
    if (
      attachment === null ||
      attachment.ownerId !== graph.run.ownerId ||
      attachment.runId !== graph.run._id ||
      attachment.chatId !== graph.run.chatId
    ) {
      throw new Error("ATTACHMENT_OWNERSHIP_INVALID");
    }
    await ctx.db.patch("messageAttachments", attachment._id, {
      status: "failed",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
