import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { providerForRun } from "../lib/models";
import { loadRunGraph } from "../lib/runGraph";
import { insertFunctionCall } from "../lib/toolCallPersistence";
import { mapRunStatusToUiStage } from "../lib/stageMap";
import { v } from "convex/values";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);
const MAX_ASSISTANT_CHARS = 500_000;

function originForTurn(turnId: Id<"zhipuTurns">): string {
  return `zhipu:${turnId}`;
}

async function assertLiveZhipuRun(
  ctx: Parameters<typeof loadRunGraph>[0],
  runId: Id<"researchRuns">,
  generation: number,
) {
  const graph = await loadRunGraph(ctx, runId);
  if (
    providerForRun(graph.run) !== "zhipu" ||
    graph.run.workerGeneration !== generation ||
    graph.run.leaseExpiresAt === undefined ||
    graph.run.leaseExpiresAt <= Date.now() ||
    TERMINAL_RUN_STATUSES.has(graph.run.status) ||
    graph.run.cancelRequested ||
    graph.chat.activeRunId !== graph.run._id ||
    graph.chat.status !== "active" ||
    graph.bot.status !== "active"
  ) {
    throw new Error("RUN_LEASE_INVALID");
  }
  return graph;
}

export const getRunContext = internalMutation({
  args: { runId: v.id("researchRuns"), generation: v.number() },
  handler: async (ctx, args) => {
    const graph = await assertLiveZhipuRun(
      ctx,
      args.runId,
      args.generation,
    );
    const { run, chat, bot, triggerMessage, assistantMessage } = graph;
    const credential = await ctx.db
      .query("zhipuCredentials")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", run.ownerId).eq("status", "active"),
      )
      .first();
    if (credential === null) throw new Error("ZHIPU_CREDENTIAL_UNAVAILABLE");

    const [
      globalMemory,
      botMemory,
      attachments,
      priorReports,
      recentMessages,
      turns,
      toolCalls,
    ] = await Promise.all([
      run.globalInstructionVersionId === undefined
        ? Promise.resolve(null)
        : ctx.db.get("instructionVersions", run.globalInstructionVersionId),
      run.botInstructionVersionId === undefined
        ? Promise.resolve(null)
        : ctx.db.get("instructionVersions", run.botInstructionVersionId),
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
      ctx.db
        .query("zhipuTurns")
        .withIndex("by_run_sequence", (q) => q.eq("runId", run._id))
        .collect(),
      ctx.db
        .query("toolCalls")
        .withIndex("by_run_requested", (q) => q.eq("runId", run._id))
        .collect(),
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
    for (const turn of turns) {
      if (turn.ownerId !== run.ownerId || turn.runId !== run._id) {
        throw new Error("ZHIPU_TURN_OWNERSHIP_INVALID");
      }
    }
    for (const call of toolCalls) {
      if (call.ownerId !== run.ownerId || call.runId !== run._id) {
        throw new Error("TOOL_CALL_OWNERSHIP_INVALID");
      }
    }

    const priorReport = priorReports.find((report) => report.runId !== run._id);
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
      history: recentMessages
        .filter(
          (message) =>
            message.ownerId === run.ownerId &&
            message.botId === run.botId &&
            message._creationTime < triggerMessage._creationTime &&
            message.content.trim().length > 0 &&
            (message.status === "accepted" || message.status === "complete"),
        )
        .reverse()
        .map((message) => ({ role: message.role, content: message.content })),
      turns,
      toolCalls,
    };
  },
});

export const beginTurn = internalMutation({
  args: { runId: v.id("researchRuns"), generation: v.number() },
  handler: async (ctx, args) => {
    const { run } = await assertLiveZhipuRun(
      ctx,
      args.runId,
      args.generation,
    );
    const turns = await ctx.db
      .query("zhipuTurns")
      .withIndex("by_run_sequence", (q) => q.eq("runId", run._id))
      .collect();
    const creating = turns.filter((turn) => turn.status === "creating");
    if (creating.length > 1) throw new Error("ZHIPU_TURN_INTENT_CONFLICT");
    if (creating[0] !== undefined) {
      await ctx.db.patch("zhipuTurns", creating[0]._id, {
        generation: args.generation,
      });
      return { turnId: creating[0]._id, sequence: creating[0].sequence };
    }

    const sequence = turns.reduce(
      (highest, turn) => Math.max(highest, turn.sequence),
      0,
    ) + 1;
    const turnId = await ctx.db.insert("zhipuTurns", {
      ownerId: run.ownerId,
      runId: run._id,
      sequence,
      generation: args.generation,
      status: "creating",
      createdAt: Date.now(),
    });
    return { turnId, sequence };
  },
});

export const completeTurn = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    turnId: v.id("zhipuTurns"),
    providerCompletionId: v.string(),
    assistantContent: v.optional(v.string()),
    functionCalls: v.array(
      v.object({
        callId: v.string(),
        name: v.string(),
        argumentsJson: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { run } = await assertLiveZhipuRun(
      ctx,
      args.runId,
      args.generation,
    );
    const turn = await ctx.db.get("zhipuTurns", args.turnId);
    if (
      turn === null ||
      turn.ownerId !== run.ownerId ||
      turn.runId !== run._id ||
      turn.status !== "creating" ||
      turn.generation !== args.generation
    ) {
      throw new Error("ZHIPU_TURN_INTENT_INVALID");
    }
    const providerCompletionId = args.providerCompletionId.trim();
    const assistantContent = args.assistantContent?.trim();
    if (!providerCompletionId) throw new Error("ZHIPU_COMPLETION_ID_MISSING");
    if (!assistantContent && args.functionCalls.length === 0) {
      throw new Error("EMPTY_ASSISTANT_RESPONSE");
    }
    if ((assistantContent?.length ?? 0) > MAX_ASSISTANT_CHARS) {
      throw new Error("ASSISTANT_RESPONSE_TOO_LARGE");
    }
    const duplicate = await ctx.db
      .query("zhipuTurns")
      .withIndex("by_provider_completion", (q) =>
        q.eq("providerCompletionId", providerCompletionId),
      )
      .unique();
    if (duplicate !== null && duplicate._id !== turn._id) {
      throw new Error("ZHIPU_COMPLETION_ID_CONFLICT");
    }

    const originResponseId = originForTurn(turn._id);
    const seenCallIds = new Set<string>();
    for (const call of args.functionCalls) {
      const providerCallId = call.callId.trim();
      if (!providerCallId || seenCallIds.has(providerCallId)) {
        throw new Error("ZHIPU_TOOL_CALL_ID_INVALID");
      }
      seenCallIds.add(providerCallId);
      await insertFunctionCall(ctx, run, originResponseId, {
        callId: `${originResponseId}:${providerCallId}`,
        name: call.name,
        argumentsJson: call.argumentsJson,
      });
    }

    const now = Date.now();
    await ctx.db.patch("zhipuTurns", turn._id, {
      status: "completed",
      providerCompletionId,
      assistantContent: assistantContent || undefined,
      completedAt: now,
    });
    await ctx.db.patch("researchRuns", run._id, {
      status: "researching",
      currentStage: mapRunStatusToUiStage("researching"),
      updatedAt: now,
    });
    return {
      originResponseId,
      assistantContent: assistantContent || undefined,
      toolCallCount: args.functionCalls.length,
    };
  },
});

export const getTurnBarrier = internalMutation({
  args: { runId: v.id("researchRuns"), turnId: v.id("zhipuTurns") },
  handler: async (ctx, args) => {
    const { run } = await loadRunGraph(ctx, args.runId);
    if (providerForRun(run) !== "zhipu") {
      throw new Error("INVALID_ZHIPU_RUN_PROVIDER");
    }
    const turn = await ctx.db.get("zhipuTurns", args.turnId);
    if (
      turn === null ||
      turn.ownerId !== run.ownerId ||
      turn.runId !== run._id ||
      turn.status !== "completed"
    ) {
      throw new Error("ZHIPU_TURN_NOT_OWNED");
    }
    const originResponseId = originForTurn(turn._id);
    const calls = (await ctx.db
      .query("toolCalls")
      .withIndex("by_run_requested", (q) => q.eq("runId", run._id))
      .collect()).filter((call) => call.originResponseId === originResponseId);
    return {
      originResponseId,
      hasCalls: calls.length > 0,
      allTerminal:
        calls.length > 0 &&
        calls.every(
          (call) => call.status === "succeeded" || call.status === "failed",
        ),
      calls,
    };
  },
});

export const abandonTurn = internalMutation({
  args: {
    runId: v.id("researchRuns"),
    generation: v.number(),
    turnId: v.id("zhipuTurns"),
  },
  handler: async (ctx, args) => {
    const { run } = await assertLiveZhipuRun(
      ctx,
      args.runId,
      args.generation,
    );
    const turn = await ctx.db.get("zhipuTurns", args.turnId);
    if (
      turn !== null &&
      turn.ownerId === run.ownerId &&
      turn.runId === run._id &&
      turn.status === "creating"
    ) {
      await ctx.db.patch("zhipuTurns", turn._id, { status: "abandoned" });
    }
    return { ok: true };
  },
});
