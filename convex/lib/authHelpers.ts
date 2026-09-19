import { getAuthUserId } from "@convex-dev/auth/server";

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type ReadContext = Pick<QueryCtx, "db">;

export async function getAuthenticatedUserId(
  ctx: Pick<QueryCtx, "auth">,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("UNAUTHENTICATED");
  }
  return userId;
}

export async function requireOwnedBot(
  ctx: ReadContext,
  ownerId: Id<"users">,
  botId: Id<"bots">,
): Promise<Doc<"bots">> {
  const bot = await ctx.db.get("bots", botId);
  if (bot === null || bot.ownerId !== ownerId) {
    throw new Error("NOT_FOUND");
  }
  return bot;
}

export async function requireOwnedChat(
  ctx: ReadContext,
  ownerId: Id<"users">,
  chatId: Id<"chats">,
): Promise<Doc<"chats">> {
  const chat = await ctx.db.get("chats", chatId);
  if (chat === null || chat.ownerId !== ownerId) {
    throw new Error("NOT_FOUND");
  }
  return chat;
}

export async function requireOwnedRun(
  ctx: ReadContext,
  ownerId: Id<"users">,
  runId: Id<"researchRuns">,
): Promise<Doc<"researchRuns">> {
  const run = await ctx.db.get("researchRuns", runId);
  if (run === null || run.ownerId !== ownerId) {
    throw new Error("NOT_FOUND");
  }
  return run;
}

export async function requireOwnedSchedule(
  ctx: ReadContext,
  ownerId: Id<"users">,
  scheduleId: Id<"researchSchedules">,
): Promise<Doc<"researchSchedules">> {
  const schedule = await ctx.db.get("researchSchedules", scheduleId);
  if (schedule === null || schedule.ownerId !== ownerId) {
    throw new Error("NOT_FOUND");
  }
  return schedule;
}

export async function requireOwnedReport(
  ctx: ReadContext,
  ownerId: Id<"users">,
  reportId: Id<"reports">,
): Promise<Doc<"reports">> {
  const report = await ctx.db.get("reports", reportId);
  if (report === null || report.ownerId !== ownerId) {
    throw new Error("NOT_FOUND");
  }
  return report;
}
