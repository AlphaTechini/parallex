import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { providerForRun } from "../lib/models";
import { getActiveProviderCredential } from "../lib/providerCredentials";
import { loadRunGraph } from "../lib/runGraph";
import { scheduleRunDrive } from "../lib/runScheduling";
import {
  insertFunctionCall,
  insertRunEvent,
} from "../lib/toolCallPersistence";
import { mapRunStatusToUiStage } from "../lib/stageMap";
import {
  toolPhase,
} from "../tools/definitions";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

const LEASE_MS = 5 * 60 * 1000;
const WATCHDOG_MS = 6 * 60 * 1000;
const MAX_ASSISTANT_CHARS = 500_000;
const MAX_TOOL_OUTPUT_CHARS = 200_000;
const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);
const NONTERMINAL_RUN_STATUSES = new Set([
  "accepted",
  "queued",
  "initializing_provider",
  "researching",
  "waiting_for_tool",
  "composing",
  "preparing_report",
  "sending_email",
]);

const abortRun = makeFunctionReference<"action">("workers/runWorker:abort");
const replyForEmailRun = makeFunctionReference<"action">(
  "workers/emailSender:replyForEmailRun",
);

const functionCallValidator = v.object({
  callId: v.string(),
  name: v.string(),
  argumentsJson: v.string(),
});

async function scheduleDrive(
  ctx: MutationCtx,
  runId: Id<"researchRuns">,
  generation: number,
  delayMs: number,
) {
  const run = await ctx.db.get("researchRuns", runId);
  if (run === null) throw new Error("RUN_NOT_FOUND");
  await scheduleRunDrive(ctx, run, generation, delayMs);
}

async function promoteQueuedInChat(
  ctx: MutationCtx,
  chatId: Id<"chats">,
): Promise<Id<"researchRuns"> | null> {
  const chat = await ctx.db.get("chats", chatId);
  if (chat === null || chat.status === "deleted") return null;

  if (chat.activeRunId !== undefined) {
    const active = await ctx.db.get("researchRuns", chat.activeRunId);
    if (
      active !== null &&
      active.ownerId === chat.ownerId &&
      active.botId === chat.botId &&
      active.chatId === chat._id &&
      NONTERMINAL_RUN_STATUSES.has(active.status)
    ) {
      return null;
    }
    await ctx.db.patch("chats", chat._id, { activeRunId: undefined });
  }

  const queuedRuns = await ctx.db
    .query("researchRuns")
    .withIndex("by_chat_status", (q) =>
      q.eq("chatId", chat._id).eq("status", "queued"),
    )
    .collect();
  const next = queuedRuns
    .filter(
      (run) => run.ownerId === chat.ownerId && run.botId === chat.botId,
    )
    .sort((left, right) =>
      left.createdAt === right.createdAt
        ? left._creationTime - right._creationTime
        : left.createdAt - right.createdAt,
    )[0];
  if (next === undefined) return null;

  const now = Date.now();
  await ctx.db.patch("researchRuns", next._id, {
    status: "accepted",
    currentStage: mapRunStatusToUiStage("accepted"),
    updatedAt: now,
  });
  await ctx.db.patch("chats", chat._id, {
    activeRunId: next._id,
    updatedAt: now,
  });
  await scheduleDrive(ctx, next._id, 1, 0);
  await scheduleDrive(ctx, next._id, 2, WATCHDOG_MS);
  return next._id;
}

async function propagateScheduleOccurrenceTerminal(
  ctx: MutationCtx,
  run: Doc<"researchRuns">,
  status: "completed" | "failed",
  completedAt: number,
  failureCode?: string,
) {
  if (run.triggerKind !== "schedule") return;
  if (run.scheduleId === undefined || run.scheduleOccurrenceId === undefined) {
    throw new Error("SCHEDULE_RUN_LINK_INVALID");
  }

  const occurrence = await ctx.db
    .query("scheduleOccurrences")
    .withIndex("by_run", (q) => q.eq("runId", run._id))
    .unique();
  if (occurrence === null) throw new Error("SCHEDULE_OCCURRENCE_NOT_FOUND");

  const schedule = await ctx.db.get("researchSchedules", occurrence.scheduleId);
  if (
    schedule === null ||
    occurrence._id !== run.scheduleOccurrenceId ||
    occurrence.ownerId !== run.ownerId ||
    occurrence.scheduleId !== run.scheduleId ||
    occurrence.runId !== run._id ||
    schedule._id !== run.scheduleId ||
    schedule.ownerId !== run.ownerId ||
    schedule.botId !== run.botId ||
    schedule.chatId !== run.chatId
  ) {
    throw new Error("SCHEDULE_OCCURRENCE_OWNERSHIP_INVALID");
  }
  if (
    occurrence.status === "completed" ||
    occurrence.status === "failed" ||
    occurrence.status === "skipped"
  ) {
    return;
  }
  if (occurrence.status !== "run_created") {
    throw new Error("SCHEDULE_OCCURRENCE_STATE_INVALID");
  }

  await ctx.db.patch("scheduleOccurrences", occurrence._id, {
    status,
    failureCode: status === "failed" ? failureCode?.slice(0, 200) : undefined,
    completedAt,
  });
  if (status === "completed") {
    await ctx.db.patch("researchSchedules", schedule._id, {
      lastSuccessfulRunAt: Math.max(
        schedule.lastSuccessfulRunAt ?? 0,
        completedAt,
      ),
      updatedAt: completedAt,
    });
  }
}

async function terminalizeRun(
  ctx: MutationCtx,
  run: Doc<"researchRuns">,
  status: "failed" | "completed",
  fields: {
    failureCode?: string;
    failureMessage?: string;
    completedAt?: number;
    failedAt?: number;
  },
) {
  const now = Date.now();
  await ctx.db.patch("researchRuns", run._id, {
    status,
    currentStage: mapRunStatusToUiStage(status),
    leaseExpiresAt: undefined,
    updatedAt: now,
    ...fields,
  });
  await propagateScheduleOccurrenceTerminal(
    ctx,
    run,
    status,
    fields.completedAt ?? fields.failedAt ?? now,
    fields.failureCode,
  );
  const chat = await ctx.db.get("chats", run.chatId);
  if (chat !== null && chat.activeRunId === run._id) {
    await ctx.db.patch("chats", chat._id, {
      activeRunId: undefined,
      updatedAt: now,
    });
  }
  await promoteQueuedInChat(ctx, run.chatId);
}

export const promoteNextQueuedRun = internalMutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const canceledRuns = await ctx.db
      .query("researchRuns")
      .withIndex("by_chat_status", (q) =>
        q.eq("chatId", args.chatId).eq("status", "canceled"),
      )
      .collect();
    for (const canceled of canceledRuns) {
      await propagateScheduleOccurrenceTerminal(
        ctx,
        canceled,
        "failed",
        canceled.updatedAt,
        "run_canceled",
      );
      if (
        providerForRun(canceled) === "openai" &&
        canceled.openaiResponseId !== undefined
      ) {
        const response = await ctx.db
          .query("openaiResponses")
          .withIndex("by_response_id", (q) =>
            q.eq("responseId", canceled.openaiResponseId),
          )
          .unique();
        if (response?.status === "active") {
          await ctx.scheduler.runAfter(0, abortRun, { runId: canceled._id });
        }
      }
    }
    return { runId: await promoteQueuedInChat(ctx, args.chatId) };
  },
});

export const claimRun = internalMutation({
  args: { runId: v.id("researchRuns"), generation: v.number() },
  handler: async (ctx, args) => {
    const graph = await loadRunGraph(ctx, args.runId);
    const { run, chat, bot } = graph;
    if (TERMINAL_RUN_STATUSES.has(run.status) || run.cancelRequested) {
      return { claimed: false, reason: "terminal" as const };
    }
    if (run.status === "queued" || chat.activeRunId !== run._id) {
      return { claimed: false, reason: "not_active" as const };
    }
    const now = Date.now();
    if (
      !Number.isInteger(args.generation) ||
      args.generation <= run.workerGeneration ||
      (run.leaseExpiresAt !== undefined && run.leaseExpiresAt > now)
    ) {
      return { claimed: false, reason: "generation_or_lease" as const };
    }
    const provider = providerForRun(run);
    const credential = await getActiveProviderCredential(
      ctx,
      run.ownerId,
      provider,
    );
    if (
      chat.status !== "active" ||
      bot.status !== "active" ||
      credential === null
    ) {
      await terminalizeRun(ctx, run, "failed", {
        failureCode:
          credential === null
            ? `${provider}_credential_unavailable`
            : "run_context_inactive",
        failureMessage:
          credential === null
            ? `A usable ${provider === "zhipu" ? "Zhipu" : "OpenAI"} credential is required to continue this run.`
            : "This chat or bot is no longer active.",
        failedAt: now,
      });
      return { claimed: false, reason: "invalid_context" as const };
    }

    const status = run.status === "accepted" ? "initializing_provider" : run.status;
    await ctx.db.patch("researchRuns", run._id, {
      workerGeneration: args.generation,
      leaseExpiresAt: now + LEASE_MS,
      status,
      currentStage: mapRunStatusToUiStage(status),
      startedAt: run.startedAt ?? now,
      updatedAt: now,
    });
    await scheduleDrive(ctx, run._id, args.generation + 1, WATCHDOG_MS);
    return { claimed: true, reason: "claimed" as const };
  },
});

export const getRunContext = internalMutation({
  args: { runId: v.id("researchRuns"), generation: v.number() },
  handler: async (ctx, args) => {
    const graph = await loadRunGraph(ctx, args.runId);
    const { run, chat, bot, triggerMessage, assistantMessage } = graph;
    if (providerForRun(run) !== "openai") {
      throw new Error("INVALID_OPENAI_RUN_PROVIDER");
    }
    if (
      run.workerGeneration !== args.generation ||
      run.leaseExpiresAt === undefined ||
      run.leaseExpiresAt <= Date.now() ||
      TERMINAL_RUN_STATUSES.has(run.status) ||
      run.cancelRequested ||
      chat.activeRunId !== run._id ||
      chat.status !== "active" ||
      bot.status !== "active"
    ) {
      throw new Error("RUN_LEASE_INVALID");
    }
    if (
      run.triggerKind === "schedule" &&
      run.openaiConversationId !== undefined &&
      run.openaiConversationId === chat.openaiConversationId
    ) {
      throw new Error("SCHEDULE_CONVERSATION_NOT_ISOLATED");
    }
    if (
      run.triggerKind !== "schedule" &&
      run.openaiConversationId !== undefined &&
      chat.openaiConversationId !== undefined &&
      run.openaiConversationId !== chat.openaiConversationId
    ) {
      throw new Error("OPENAI_CONVERSATION_CONFLICT");
    }
    const credential = await ctx.db
      .query("openaiCredentials")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", run.ownerId).eq("status", "active"),
      )
      .first();
    if (credential === null) throw new Error("OPENAI_CREDENTIAL_UNAVAILABLE");

    const [
      globalMemory,
      botMemory,
      responses,
      attachments,
      priorReports,
      recentMessages,
      recentRuns,
    ] =
      await Promise.all([
        run.globalInstructionVersionId === undefined
          ? Promise.resolve(null)
          : ctx.db.get("instructionVersions", run.globalInstructionVersionId),
        run.botInstructionVersionId === undefined
          ? Promise.resolve(null)
          : ctx.db.get("instructionVersions", run.botInstructionVersionId),
        ctx.db
          .query("openaiResponses")
          .withIndex("by_run", (q) => q.eq("runId", run._id))
          .collect(),
        ctx.db
          .query("messageAttachments")
          .withIndex("by_run", (q) => q.eq("runId", run._id))
          .collect(),
        run.triggerKind === "schedule"
          ? ctx.db
              .query("reports")
              .withIndex("by_chat_created", (q) => q.eq("chatId", run.chatId))
              .order("desc")
              .collect()
          : Promise.resolve([]),
        run.triggerKind === "schedule"
          ? Promise.resolve([])
          : ctx.db
              .query("messages")
              .withIndex("by_chat_created", (q) =>
                q
                  .eq("chatId", run.chatId)
                  .lte("createdAt", triggerMessage.createdAt),
              )
              .order("desc")
              .take(50),
        run.triggerKind === "schedule"
          ? Promise.resolve([])
          : ctx.db
              .query("researchRuns")
              .withIndex("by_chat_created", (q) =>
                q.eq("chatId", run.chatId).lte("createdAt", run.createdAt),
              )
              .order("desc")
              .take(50),
      ]);
    if (
      (run.globalInstructionVersionId !== undefined && globalMemory === null) ||
      (run.botInstructionVersionId !== undefined && botMemory === null) ||
      (globalMemory !== null &&
        (globalMemory.ownerId !== run.ownerId || globalMemory.scope !== "global")) ||
      (botMemory !== null &&
        (botMemory.ownerId !== run.ownerId ||
          botMemory.scope !== "bot" ||
          botMemory.botId !== run.botId))
    ) {
      throw new Error("INSTRUCTION_SNAPSHOT_INVALID");
    }
    for (const response of responses) {
      if (
        response.ownerId !== run.ownerId ||
        response.runId !== run._id ||
        (run.openaiConversationId !== undefined &&
          response.conversationId !== run.openaiConversationId)
      ) {
        throw new Error("OPENAI_RESPONSE_OWNERSHIP_INVALID");
      }
    }
    for (const attachment of attachments) {
      if (
        attachment.ownerId !== run.ownerId ||
        attachment.chatId !== run.chatId ||
        attachment.messageId !== triggerMessage._id ||
        attachment.status === "uploaded"
      ) {
        throw new Error("ATTACHMENT_OWNERSHIP_INVALID");
      }
    }

    const priorReport = priorReports.find((report) => report.runId !== run._id);
    const previousRun = recentRuns.find(
      (candidate) => candidate._creationTime < run._creationTime,
    );
    const seedLocalHistory =
      previousRun !== undefined &&
      (previousRun.status !== "completed" ||
        providerForRun(previousRun) !== "openai" ||
        previousRun.openaiConversationId === undefined ||
        previousRun.openaiConversationId !== chat.openaiConversationId);
    return {
      run,
      chat,
      bot,
      triggerMessage,
      assistantMessage,
      credential: {
        ciphertext: credential.ciphertext,
        initializationVector: credential.initializationVector,
      },
      globalMemory: globalMemory?.content,
      botMemory: botMemory?.content,
      responses,
      attachments: attachments.map((attachment) => ({
        id: attachment._id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
      priorReportSummary:
        priorReport === undefined
          ? undefined
          : `${priorReport.title}\n${priorReport.summary}`.slice(0, 8_000),
      seedLocalHistory,
      localHistory: seedLocalHistory
        ? recentMessages
            .filter(
              (message) =>
                message.ownerId === run.ownerId &&
                message.botId === run.botId &&
                message._creationTime < triggerMessage._creationTime &&
                message.content.trim().length > 0 &&
                (message.status === "accepted" || message.status === "complete"),
            )
            .reverse()
            .map((message) => ({
              role: message.role,
              content: message.content,
            }))
        : [],
    };
  },
});

export const getAbortContext = internalMutation({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const { run } = await loadRunGraph(ctx, args.runId);
    if (providerForRun(run) !== "openai") {
      return { responseId: undefined };
    }
    const credential = await ctx.db
      .query("openaiCredentials")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", run.ownerId).eq("status", "active"),
      )
      .first();
    if (credential === null) {
      return { responseId: run.openaiResponseId };
    }
    return {
      responseId: run.openaiResponseId,
      credential: {
        ciphertext: credential.ciphertext,
        initializationVector: credential.initializationVector,
      },
    };
  },
});

export const setRunConversation = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    conversationId: v.string(),
    replaceChatConversation: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { run, chat } = await loadRunGraph(ctx, args.runId);
    if (run.workerGeneration !== args.generation || run.cancelRequested) {
      throw new Error("RUN_LEASE_INVALID");
    }
    if (
      run.openaiConversationId !== undefined &&
      run.openaiConversationId !== args.conversationId
    ) {
      throw new Error("OPENAI_CONVERSATION_CONFLICT");
    }
    if (
      run.triggerKind !== "schedule" &&
      chat.openaiConversationId !== undefined &&
      chat.openaiConversationId !== args.conversationId &&
      !args.replaceChatConversation
    ) {
      throw new Error("OPENAI_CONVERSATION_CONFLICT");
    }
    const now = Date.now();
    await ctx.db.patch("researchRuns", run._id, {
      openaiConversationId: args.conversationId,
      updatedAt: now,
    });
    if (
      run.triggerKind !== "schedule" &&
      (chat.openaiConversationId === undefined || args.replaceChatConversation)
    ) {
      await ctx.db.patch("chats", chat._id, {
        openaiConversationId: args.conversationId,
        updatedAt: now,
      });
    }
    return { conversationId: args.conversationId };
  },
});

export const beginInitialResponse = internalMutation({
  args: { runId: v.id("researchRuns"), generation: v.number() },
  handler: async (ctx, args) => {
    const { run } = await loadRunGraph(ctx, args.runId);
    if (
      run.workerGeneration !== args.generation ||
      run.openaiConversationId === undefined ||
      run.cancelRequested
    ) {
      throw new Error("RUN_LEASE_INVALID");
    }
    const responses = await ctx.db
      .query("openaiResponses")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();
    const active = responses.find((response) => response.status === "active");
    if (active !== undefined) return { state: "active" as const, response: active };
    const creatingResponses = responses.filter(
      (response) => response.status === "creating",
    );
    if (creatingResponses.length > 1) {
      throw new Error("RESPONSE_INTENT_CONFLICT");
    }
    const creating = creatingResponses[0];
    if (creating !== undefined) {
      if (
        creating.kind !== "initial" ||
        creating.parentResponseId !== undefined ||
        creating.conversationId !== run.openaiConversationId ||
        creating.responseId !== undefined
      ) {
        return { state: "not_initial" as const };
      }
      await ctx.db.patch("openaiResponses", creating._id, {
        generation: args.generation,
      });
      return { state: "created" as const, intentId: creating._id };
    }
    if (responses.length > 0) return { state: "not_initial" as const };

    const intentId = await ctx.db.insert("openaiResponses", {
      ownerId: run.ownerId,
      runId: run._id,
      conversationId: run.openaiConversationId,
      kind: "initial",
      status: "creating",
      toolOutputsSubmitted: false,
      generation: args.generation,
      createdAt: Date.now(),
    });
    return { state: "created" as const, intentId };
  },
});

export const activateResponseIntent = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    intentId: v.id("openaiResponses"),
    responseId: v.string(),
  },
  handler: async (ctx, args) => {
    const { run } = await loadRunGraph(ctx, args.runId);
    const intent = await ctx.db.get("openaiResponses", args.intentId);
    if (
      intent === null ||
      intent.runId !== run._id ||
      intent.ownerId !== run.ownerId ||
      intent.generation !== args.generation ||
      intent.status !== "creating" ||
      run.workerGeneration !== args.generation ||
      run.cancelRequested
    ) {
      throw new Error("RESPONSE_INTENT_INVALID");
    }
    const duplicate = await ctx.db
      .query("openaiResponses")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.responseId))
      .unique();
    if (duplicate !== null && duplicate._id !== intent._id) {
      throw new Error("OPENAI_RESPONSE_ID_CONFLICT");
    }
    const now = Date.now();
    await ctx.db.patch("openaiResponses", intent._id, {
      responseId: args.responseId,
      status: "active",
    });
    await ctx.db.patch("researchRuns", run._id, {
      openaiResponseId: args.responseId,
      lastOpenAISequenceNumber: undefined,
      status: "researching",
      currentStage: mapRunStatusToUiStage("researching"),
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const checkpointResponseEvent = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    responseId: v.string(),
    sequenceNumber: v.number(),
    kind: v.union(
      v.literal("response_created"),
      v.literal("assistant_delta"),
      v.literal("reasoning_summary_delta"),
      v.literal("tool_call"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("checkpoint"),
    ),
    delta: v.optional(v.string()),
    finalText: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    openaiItemId: v.optional(v.string()),
    functionCalls: v.optional(v.array(functionCallValidator)),
  },
  handler: async (ctx, args) => {
    const { run, assistantMessage } = await loadRunGraph(ctx, args.runId);
    if (run.workerGeneration !== args.generation || run.cancelRequested) {
      throw new Error("RUN_LEASE_INVALID");
    }
    const response = await ctx.db
      .query("openaiResponses")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.responseId))
      .unique();
    if (
      response === null ||
      response.runId !== run._id ||
      response.ownerId !== run.ownerId
    ) {
      throw new Error("OPENAI_RESPONSE_NOT_OWNED");
    }
    if (
      response.lastSequenceNumber !== undefined &&
      args.sequenceNumber <= response.lastSequenceNumber
    ) {
      return { accepted: false, terminal: false };
    }
    if (!Number.isInteger(args.sequenceNumber) || args.sequenceNumber < 0) {
      throw new Error("INVALID_PROVIDER_SEQUENCE");
    }

    if (args.kind === "assistant_delta" && args.delta !== undefined) {
      const content = assistantMessage.content + args.delta;
      if (content.length > MAX_ASSISTANT_CHARS) throw new Error("ASSISTANT_OUTPUT_TOO_LARGE");
      await ctx.db.patch("messages", assistantMessage._id, {
        content,
        status: "streaming",
        updatedAt: Date.now(),
      });
    }
    for (const call of args.functionCalls ?? []) {
      await insertFunctionCall(ctx, run, args.responseId, call);
    }

    const now = Date.now();
    let terminal = false;
    if (args.kind === "completed") {
      if (args.openaiItemId !== undefined) {
        await ctx.db.patch("messages", assistantMessage._id, {
          openaiItemId: args.openaiItemId,
          updatedAt: now,
        });
      }
      await ctx.db.patch("openaiResponses", response._id, {
        status: "completed",
        lastSequenceNumber: args.sequenceNumber,
        completedAt: now,
      });
      const calls = await ctx.db
        .query("toolCalls")
        .withIndex("by_run_requested", (q) => q.eq("runId", run._id))
        .collect();
      const hasCalls = calls.some((call) => call.originResponseId === args.responseId);
      const status = hasCalls ? "waiting_for_tool" : "composing";
      await ctx.db.patch("researchRuns", run._id, {
        lastOpenAISequenceNumber: args.sequenceNumber,
        status,
        currentStage: mapRunStatusToUiStage(status),
        updatedAt: now,
      });
      terminal = true;
    } else if (args.kind === "failed") {
      await ctx.db.patch("openaiResponses", response._id, {
        status: "failed",
        lastSequenceNumber: args.sequenceNumber,
        completedAt: now,
      });
      await ctx.db.patch("researchRuns", run._id, {
        lastOpenAISequenceNumber: args.sequenceNumber,
        updatedAt: now,
      });
      terminal = true;
    } else {
      await ctx.db.patch("openaiResponses", response._id, {
        lastSequenceNumber: args.sequenceNumber,
      });
      await ctx.db.patch("researchRuns", run._id, {
        lastOpenAISequenceNumber: args.sequenceNumber,
        updatedAt: now,
      });
    }
    return { accepted: true, terminal };
  },
});

export const getToolBarrier = internalMutation({
  args: { runId: v.id("researchRuns"), originResponseId: v.string() },
  handler: async (ctx, args) => {
    const { run } = await loadRunGraph(ctx, args.runId);
    const response = await ctx.db
      .query("openaiResponses")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.originResponseId))
      .unique();
    if (response === null || response.runId !== run._id) {
      throw new Error("OPENAI_RESPONSE_NOT_OWNED");
    }
    const calls = (await ctx.db
      .query("toolCalls")
      .withIndex("by_run_requested", (q) => q.eq("runId", run._id))
      .collect())
      .filter((call) => call.originResponseId === args.originResponseId)
      .sort((left, right) => left.requestedAt - right.requestedAt);
    return {
      hasCalls: calls.length > 0,
      allTerminal:
        calls.length > 0 &&
        calls.every((call) => call.status === "succeeded" || call.status === "failed"),
      toolOutputsSubmitted: response.toolOutputsSubmitted,
      calls,
    };
  },
});

export const claimToolPhase = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    originResponseId: v.string(),
  },
  handler: async (ctx, args) => {
    const { run } = await loadRunGraph(ctx, args.runId);
    if (
      run.workerGeneration !== args.generation ||
      run.leaseExpiresAt === undefined ||
      run.leaseExpiresAt <= Date.now() ||
      run.cancelRequested
    ) {
      throw new Error("RUN_LEASE_INVALID");
    }
    const calls = (await ctx.db
      .query("toolCalls")
      .withIndex("by_run_requested", (q) => q.eq("runId", run._id))
      .collect()).filter((call) => call.originResponseId === args.originResponseId);
    if (calls.length === 0) return { state: "none" as const, toolCallIds: [] };
    const nonterminal = calls.filter(
      (call) => call.status !== "succeeded" && call.status !== "failed",
    );
    if (nonterminal.length === 0) {
      return { state: "terminal" as const, toolCallIds: [] };
    }
    const nextPhase = Math.min(...nonterminal.map((call) => toolPhase(call.functionName)));
    const phaseCalls = nonterminal.filter(
      (call) => toolPhase(call.functionName) === nextPhase,
    );
    if (phaseCalls.some((call) => call.status === "running")) {
      return { state: "waiting" as const, toolCallIds: [] };
    }
    const now = Date.now();
    let callsToClaim = phaseCalls;
    if (nextPhase === 3) {
      const reports = await ctx.db
        .query("reports")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      const runnableCalls = [];
      for (const call of phaseCalls) {
        if (call.functionName !== "send_research_email") {
          runnableCalls.push(call);
          continue;
        }
        const hasCurrentReport = reports.some(
          (report) =>
            report.ownerId === run.ownerId &&
            report.chatId === run.chatId &&
            (report.status === "ready" || report.status === "partial"),
        );
        let valid = hasCurrentReport;
        if (!valid) {
          try {
            const parsed: unknown = JSON.parse(call.argumentsJson);
            const reportId =
              typeof parsed === "object" && parsed !== null && "reportId" in parsed
                ? (parsed as { reportId?: unknown }).reportId
                : undefined;
            if (typeof reportId === "string" && reportId.length > 0) {
              const normalizedReportId = ctx.db.normalizeId("reports", reportId);
              const report =
                normalizedReportId === null
                  ? null
                  : await ctx.db.get("reports", normalizedReportId);
              valid =
                report !== null &&
                report.ownerId === run.ownerId &&
                report.chatId === run.chatId &&
                (report.status === "ready" || report.status === "partial");
            }
          } catch {
            valid = false;
          }
        }
        if (valid) {
          runnableCalls.push(call);
        } else {
          const safeMessage =
            "A stored research report is required before email delivery.";
          await ctx.db.patch("toolCalls", call._id, {
            status: "failed",
            resultJson: JSON.stringify({
              ok: false,
              error: {
                code: "report_required",
                message: safeMessage,
                retryable: false,
              },
            }),
            failureCode: "report_required",
            completedAt: now,
          });
          const events = await ctx.db
            .query("runEvents")
            .withIndex("by_tool_call", (q) => q.eq("toolCallId", call._id))
            .collect();
          for (const event of events) {
            await ctx.db.patch("runEvents", event._id, {
              status: "failed",
              safeDetail: safeMessage,
            });
          }
        }
      }
      if (runnableCalls.length === 0) {
        return { state: "terminal" as const, toolCallIds: [] };
      }
      callsToClaim = runnableCalls;
    }
    for (const call of callsToClaim) {
      await ctx.db.patch("toolCalls", call._id, {
        status: "running",
        startedAt: call.startedAt ?? now,
      });
    }
    const status =
      nextPhase === 2
        ? "preparing_report"
        : nextPhase === 3
          ? "sending_email"
          : "waiting_for_tool";
    await ctx.db.patch("researchRuns", run._id, {
      status,
      currentStage: mapRunStatusToUiStage(status),
      updatedAt: now,
    });
    return {
      state: "claimed" as const,
      toolCallIds: callsToClaim.map((call) => call._id),
    };
  },
});

export const completeToolCall = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    status: v.union(v.literal("succeeded"), v.literal("failed")),
    outputJson: v.optional(v.string()),
    code: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
    safeMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get("toolCalls", args.toolCallId);
    if (call === null) throw new Error("TOOL_CALL_NOT_FOUND");
    const { run } = await loadRunGraph(ctx, call.runId);
    if (call.ownerId !== run.ownerId) throw new Error("TOOL_CALL_NOT_OWNED");
    if (call.status === "succeeded" || call.status === "failed") {
      return { ok: true, alreadyTerminal: true };
    }
    if (call.status !== "running") throw new Error("TOOL_CALL_NOT_RUNNING");

    let resultJson: string;
    if (args.status === "succeeded") {
      if (args.outputJson === undefined) throw new Error("TOOL_OUTPUT_REQUIRED");
      JSON.parse(args.outputJson);
      resultJson = args.outputJson;
    } else {
      resultJson = JSON.stringify({
        ok: false,
        error: {
          code: args.code ?? "tool_failed",
          message: args.safeMessage ?? "The function could not be completed.",
          retryable: args.retryable ?? false,
        },
      });
    }
    if (resultJson.length > MAX_TOOL_OUTPUT_CHARS) throw new Error("TOOL_OUTPUT_TOO_LARGE");
    await ctx.db.patch("toolCalls", call._id, {
      status: args.status,
      resultJson,
      failureCode: args.status === "failed" ? args.code ?? "tool_failed" : undefined,
      completedAt: Date.now(),
    });
    const events = await ctx.db
      .query("runEvents")
      .withIndex("by_tool_call", (q) => q.eq("toolCallId", call._id))
      .collect();
    for (const event of events) {
      await ctx.db.patch("runEvents", event._id, {
        status: args.status === "succeeded" ? "completed" : "failed",
        safeDetail:
          args.status === "failed"
            ? args.safeMessage ?? "The function could not be completed."
            : event.safeDetail,
      });
    }

    if (call.originResponseId !== undefined && !TERMINAL_RUN_STATUSES.has(run.status)) {
      const siblings = (await ctx.db
        .query("toolCalls")
        .withIndex("by_run_requested", (q) => q.eq("runId", run._id))
        .collect()).filter((candidate) => candidate.originResponseId === call.originResponseId);
      const allTerminal = siblings.every(
        (candidate) =>
          candidate._id === call._id ||
          candidate.status === "succeeded" ||
          candidate.status === "failed",
      );
      if (allTerminal) {
        await scheduleDrive(ctx, run._id, run.workerGeneration + 1, 0);
        await scheduleDrive(ctx, run._id, run.workerGeneration + 2, WATCHDOG_MS);
      }
    }
    return { ok: true, alreadyTerminal: false };
  },
});

export const prepareToolContinuation = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    originResponseId: v.string(),
  },
  handler: async (ctx, args) => {
    const { run } = await loadRunGraph(ctx, args.runId);
    if (
      run.workerGeneration !== args.generation ||
      run.openaiConversationId === undefined ||
      run.cancelRequested
    ) {
      throw new Error("RUN_LEASE_INVALID");
    }
    const origin = await ctx.db
      .query("openaiResponses")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.originResponseId))
      .unique();
    if (
      origin === null ||
      origin.runId !== run._id ||
      origin.status !== "completed"
    ) {
      throw new Error("ORIGIN_RESPONSE_INVALID");
    }
    const responses = await ctx.db
      .query("openaiResponses")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();
    if (responses.some((response) => response.status === "active")) {
      return { state: "active" as const };
    }

    const calls = (await ctx.db
      .query("toolCalls")
      .withIndex("by_run_requested", (q) => q.eq("runId", run._id))
      .collect())
      .filter((call) => call.originResponseId === args.originResponseId)
      .sort(
        (left, right) =>
          left.requestedAt - right.requestedAt ||
          left._creationTime - right._creationTime,
      );
    if (
      calls.length === 0 ||
      calls.some(
        (call) => call.status !== "succeeded" && call.status !== "failed",
      )
    ) {
      return { state: "waiting" as const };
    }

    const outputs = calls.map((call) => ({
      type: "function_call_output" as const,
      call_id: call.openaiCallId,
      output:
        call.resultJson ??
        JSON.stringify({
          ok: false,
          error: {
            code: "missing_tool_output",
            message: "The function ended without a usable output.",
            retryable: false,
          },
        }),
    }));
    const creatingResponses = responses.filter(
      (response) => response.status === "creating",
    );
    if (creatingResponses.length > 1) {
      throw new Error("RESPONSE_INTENT_CONFLICT");
    }
    const creating = creatingResponses[0];
    if (creating !== undefined) {
      if (
        creating.kind !== "tool_continuation" ||
        creating.parentResponseId !== args.originResponseId ||
        creating.conversationId !== run.openaiConversationId ||
        creating.responseId !== undefined
      ) {
        throw new Error("RESPONSE_INTENT_CONFLICT");
      }
      await ctx.db.patch("openaiResponses", creating._id, {
        generation: args.generation,
      });
      return {
        state: "created" as const,
        intentId: creating._id,
        outputs,
      };
    }
    if (origin.toolOutputsSubmitted) {
      return { state: "already_submitted" as const };
    }

    await ctx.db.patch("openaiResponses", origin._id, {
      toolOutputsSubmitted: true,
    });
    const intentId = await ctx.db.insert("openaiResponses", {
      ownerId: run.ownerId,
      runId: run._id,
      parentResponseId: args.originResponseId,
      conversationId: run.openaiConversationId,
      kind: "tool_continuation",
      status: "creating",
      toolOutputsSubmitted: false,
      generation: args.generation,
      createdAt: Date.now(),
    });
    return {
      state: "created" as const,
      intentId,
      outputs,
    };
  },
});

export const yieldRun = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    delayMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("researchRuns", args.runId);
    if (
      run === null ||
      run.workerGeneration !== args.generation ||
      TERMINAL_RUN_STATUSES.has(run.status)
    ) {
      return { scheduled: false };
    }
    const delayMs = Math.max(0, Math.min(args.delayMs ?? 0, WATCHDOG_MS));
    await ctx.db.patch("researchRuns", run._id, {
      leaseExpiresAt: undefined,
      updatedAt: Date.now(),
    });
    await scheduleDrive(ctx, run._id, args.generation + 1, delayMs);
    if (delayMs === 0) {
      await scheduleDrive(ctx, run._id, args.generation + 2, WATCHDOG_MS);
    }
    return { scheduled: true };
  },
});

export const finalizeRun = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    finalText: v.optional(v.string()),
    openaiItemId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { run, chat, triggerMessage, assistantMessage } = await loadRunGraph(
      ctx,
      args.runId,
    );
    if (
      run.workerGeneration !== args.generation ||
      TERMINAL_RUN_STATUSES.has(run.status) ||
      run.cancelRequested
    ) {
      throw new Error("RUN_LEASE_INVALID");
    }
    const content = assistantMessage.content || args.finalText?.trim() || "";
    if (!content) throw new Error("EMPTY_ASSISTANT_RESPONSE");
    const now = Date.now();
    await ctx.db.patch("messages", assistantMessage._id, {
      content,
      openaiItemId: args.openaiItemId ?? assistantMessage.openaiItemId,
      status: "complete",
      updatedAt: now,
    });
    if (!chat.titleLocked) {
      const fallbackTitle = triggerMessage.content
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      await ctx.db.patch("chats", chat._id, {
        title: chat.title ?? fallbackTitle,
        titleSource: chat.title === undefined ? "fallback" : chat.titleSource,
        titleLocked: true,
        updatedAt: now,
      });
    }
    if (run.triggerKind === "email") {
      await ctx.scheduler.runAfter(0, replyForEmailRun, { runId: run._id });
    }
    await terminalizeRun(ctx, run, "completed", { completedAt: now });
    return { ok: true };
  },
});

export const failRun = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.optional(v.number()),
    code: v.string(),
    safeMessage: v.string(),
    intentId: v.optional(v.id("openaiResponses")),
  },
  handler: async (ctx, args) => {
    const { run, assistantMessage } = await loadRunGraph(ctx, args.runId);
    if (TERMINAL_RUN_STATUSES.has(run.status)) return { ok: true };
    if (args.generation !== undefined && run.workerGeneration !== args.generation) {
      return { ok: false };
    }
    if (args.intentId !== undefined) {
      const intent = await ctx.db.get("openaiResponses", args.intentId);
      if (
        args.generation === undefined ||
        intent === null ||
        intent.runId !== run._id ||
        intent.ownerId !== run.ownerId ||
        intent.generation !== args.generation ||
        intent.status !== "creating"
      ) {
        throw new Error("RESPONSE_INTENT_INVALID");
      }
      await ctx.db.patch("openaiResponses", intent._id, {
        status: "abandoned",
      });
    }
    const now = Date.now();
    await ctx.db.patch("messages", assistantMessage._id, {
      status: "failed",
      updatedAt: now,
    });
    await insertRunEvent(ctx, run, {
      kind: "run_error",
      label: "Research run failed",
      status: "failed",
      safeDetail: args.safeMessage.slice(0, 2000),
    });
    await terminalizeRun(ctx, run, "failed", {
      failureCode: args.code.slice(0, 200),
      failureMessage: args.safeMessage.slice(0, 2000),
      failedAt: now,
    });
    return { ok: true };
  },
});
