import { makeFunctionReference } from "convex/server";
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { ExecutorResult, ToolExecutionContext } from "./types";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);

const applyTitle = makeFunctionReference<
  "mutation",
  { toolCallId: ToolExecutionContext["toolCallId"]; title: string },
  { title: string }
>("tools/updateChatTitle:applyTitle");

export const applyTitleMutation = internalMutation({
  args: { toolCallId: v.id("toolCalls"), title: v.string() },
  handler: async (ctx, args) => {
    const call = await ctx.db.get("toolCalls", args.toolCallId);
    if (call === null || call.functionName !== "update_chat_title") {
      throw new Error("TOOL_CALL_INVALID");
    }
    const run = await ctx.db.get("researchRuns", call.runId);
    if (run === null || run.ownerId !== call.ownerId || run.cancelRequested) {
      throw new Error("RUN_NOT_LIVE");
    }
    const chat = await ctx.db.get("chats", run.chatId);
    const bot = await ctx.db.get("bots", run.botId);
    if (
      chat === null ||
      bot === null ||
      chat.ownerId !== run.ownerId ||
      bot.ownerId !== run.ownerId ||
      chat.botId !== bot._id ||
      run.botId !== bot._id ||
      run.chatId !== chat._id ||
      chat.status !== "active" ||
      bot.status !== "active" ||
      TERMINAL_RUN_STATUSES.has(run.status) ||
      chat.activeRunId !== run._id ||
      chat.titleLocked ||
      call.status !== "running"
    ) {
      throw new Error("CHAT_TITLE_NOT_AVAILABLE");
    }
    const title = args.title.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!title) throw new Error("INVALID_CHAT_TITLE");
    await ctx.db.patch("chats", chat._id, {
      title,
      titleSource: "model_function",
      titleLocked: true,
      updatedAt: Date.now(),
    });
    return { title };
  },
});

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  const result = await context.ctx.runMutation(applyTitle, {
    toolCallId: context.toolCallId,
    title: context.args.title as string,
  });
  return {
    kind: "immediate",
    outputJson: JSON.stringify({ ok: true, title: result.title }),
  };
}
