import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function loadRunGraph(
  ctx: MutationCtx,
  runId: Id<"researchRuns">,
) {
  const run = await ctx.db.get("researchRuns", runId);
  if (run === null) throw new Error("RUN_NOT_FOUND");
  const [chat, bot, triggerMessage, assistantMessage] = await Promise.all([
    ctx.db.get("chats", run.chatId),
    ctx.db.get("bots", run.botId),
    ctx.db.get("messages", run.triggerMessageId),
    run.assistantMessageId === undefined
      ? Promise.resolve(null)
      : ctx.db.get("messages", run.assistantMessageId),
  ]);
  if (
    chat === null ||
    bot === null ||
    triggerMessage === null ||
    assistantMessage === null ||
    chat.ownerId !== run.ownerId ||
    bot.ownerId !== run.ownerId ||
    triggerMessage.ownerId !== run.ownerId ||
    assistantMessage.ownerId !== run.ownerId ||
    chat.botId !== run.botId ||
    triggerMessage.botId !== run.botId ||
    assistantMessage.botId !== run.botId ||
    triggerMessage.chatId !== run.chatId ||
    assistantMessage.chatId !== run.chatId ||
    triggerMessage.runId !== run._id ||
    assistantMessage.runId !== run._id
  ) {
    throw new Error("RUN_OWNERSHIP_INVALID");
  }
  return { run, chat, bot, triggerMessage, assistantMessage };
}
