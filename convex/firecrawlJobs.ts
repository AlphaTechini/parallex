import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { validateToolArguments, isToolFunctionName } from "./tools/definitions";
import { upsertSourceRecords } from "./sources";
import { v } from "convex/values";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "canceled", "closed"]);

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
});

type OwnedToolGraph = {
  call: Doc<"toolCalls">;
  run: Doc<"researchRuns">;
  chat: Doc<"chats">;
  bot: Doc<"bots">;
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
    if (
      job.ownerId !== graph.run.ownerId ||
      job.runId !== graph.run._id ||
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "canceled" ||
      job.status === "closed"
    ) {
      return { active: false as const, reason: "terminal" as const, job };
    }
    if (!isRunLive(graph)) {
      await ctx.db.patch("firecrawlJobs", job._id, {
        status: "canceled",
        lastErrorCode: "run_not_live",
        updatedAt: Date.now(),
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
    if (TERMINAL_JOB_STATUSES.has(job.status)) return { active: false };
    if (!isRunLive(graph) || job.ownerId !== graph.run.ownerId) {
      await ctx.db.patch("firecrawlJobs", job._id, {
        status: "canceled",
        lastErrorCode: "run_not_live",
        updatedAt: Date.now(),
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
      return { active: false as const, reason: "terminal" as const };
    }
    if (!isRunLive(graph) || job.ownerId !== graph.run.ownerId) {
      await ctx.db.patch("firecrawlJobs", job._id, {
        status: "canceled",
        lastErrorCode: "run_not_live",
        updatedAt: Date.now(),
      });
      return { active: false as const, reason: "run_not_live" as const };
    }
    if (args.outputJson.length > 190_000) throw new Error("FIRECRAWL_OUTPUT_TOO_LARGE");
    const persistedSources = await upsertSourceRecords(ctx, {
      ownerId: graph.run.ownerId,
      runId: graph.run._id,
      toolCallId: graph.call._id,
      retrievalMethod: job.capability,
      sources: args.sources,
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
      outputJson: args.outputJson,
      sources: persistedSources,
    };
  },
});

export const failJob = internalMutation({
  args: { providerJobId: v.string(), errorCode: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db
      .query("firecrawlJobs")
      .withIndex("by_provider_job", (q) => q.eq("providerJobId", args.providerJobId))
      .unique();
    if (job === null) throw new Error("FIRECRAWL_JOB_NOT_FOUND");
    const graph = await loadOwnedToolGraph(ctx, job.toolCallId);
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
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
      lastErrorCode: args.errorCode.slice(0, 200),
      updatedAt: Date.now(),
    });
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
