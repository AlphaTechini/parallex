import { mutation, query } from "./_generated/server";
import {
  getAuthenticatedUserId,
  requireOwnedRun,
} from "./lib/authHelpers";
import { mapRunStatusToUiStage } from "./lib/stageMap";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);
const promoteNextQueuedRun = makeFunctionReference<"mutation">(
  "workers/runMutations:promoteNextQueuedRun",
);

export const getRun = query({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const run = await requireOwnedRun(ctx, ownerId, args.runId);
    return {
      _id: run._id,
      status: run.status,
      currentStage: run.currentStage,
      model: run.model,
      reasoningEffort: run.reasoningEffort,
      failureCode: run.failureCode ?? null,
      failureMessage: run.failureMessage ?? null,
      createdAt: run.createdAt,
      startedAt: run.startedAt ?? null,
      completedAt: run.completedAt ?? null,
    };
  },
});

export const cancelRun = mutation({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const run = await requireOwnedRun(ctx, ownerId, args.runId);
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      return { ok: true };
    }

    const now = Date.now();
    await ctx.db.patch("researchRuns", run._id, {
      status: "canceled",
      currentStage: mapRunStatusToUiStage("canceled"),
      cancelRequested: true,
      updatedAt: now,
    });
    if (run.assistantMessageId !== undefined) {
      const assistant = await ctx.db.get("messages", run.assistantMessageId);
      if (
        assistant !== null &&
        assistant.ownerId === ownerId &&
        assistant.runId === run._id &&
        assistant.role === "assistant"
      ) {
        await ctx.db.patch("messages", assistant._id, {
          content: assistant.content.trim() || "Research canceled.",
          status: "failed",
          updatedAt: now,
        });
      }
    }

    const chat = await ctx.db.get("chats", run.chatId);
    if (
      chat !== null &&
      chat.ownerId === ownerId &&
      chat.botId === run.botId &&
      chat.activeRunId === run._id
    ) {
      await ctx.db.patch("chats", chat._id, {
        activeRunId: undefined,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(0, promoteNextQueuedRun, {
      chatId: run.chatId,
    });
    return { ok: true };
  },
});
