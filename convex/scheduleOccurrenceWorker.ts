import { makeFunctionReference } from "convex/server";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { occurrenceKey } from "./lib/normalize";
import { nextOccurrence } from "./lib/recurrence";
import { mapRunStatusToUiStage } from "./lib/stageMap";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

const driveRun = makeFunctionReference<"action">("workers/runWorker:drive");
const occurrenceWorker = makeFunctionReference<
  "mutation",
  { scheduleId: Id<"researchSchedules">; scheduledFor: number }
>("scheduleOccurrenceWorker:run");
const WATCHDOG_MS = 6 * 60 * 1000;
const DEFAULT_MODEL = "gpt-5.6-terra" as const;
const DEFAULT_EFFORT = "medium" as const;

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

async function scheduleNext(
  ctx: MutationCtx,
  schedule: Doc<"researchSchedules">,
  afterTimestamp: number,
) {
  if (schedule.scheduleKind !== "recurring" || schedule.recurrence === undefined) {
    await ctx.db.patch("researchSchedules", schedule._id, {
      status: "completed",
      convexScheduledFunctionId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  }
  let next = nextOccurrence(schedule.recurrence, schedule.timezone, afterTimestamp);
  let guard = 0;
  while (next <= Date.now() && guard < 100) {
    next = nextOccurrence(schedule.recurrence, schedule.timezone, next);
    guard += 1;
  }
  if (guard >= 100) throw new Error("RECURRENCE_TOO_DENSE");
   const scheduledFunctionId = await ctx.scheduler.runAt(next, occurrenceWorker, {
    scheduleId: schedule._id,
    scheduledFor: next,
  });
  await ctx.db.patch("researchSchedules", schedule._id, {
    nextRunAt: next,
    convexScheduledFunctionId: scheduledFunctionId,
    updatedAt: Date.now(),
  });
  return next;
}

async function markSkipped(
  ctx: MutationCtx,
  schedule: Doc<"researchSchedules">,
  scheduledFor: number,
  reason: string,
) {
  const key = occurrenceKey(schedule._id, scheduledFor);
  const existing = await ctx.db
    .query("scheduleOccurrences")
    .withIndex("by_occurrence_key", (q) => q.eq("occurrenceKey", key))
    .unique();
  if (existing === null) {
    await ctx.db.insert("scheduleOccurrences", {
      ownerId: schedule.ownerId,
      scheduleId: schedule._id,
      scheduledFor,
      occurrenceKey: key,
      status: "skipped",
      failureCode: reason.slice(0, 200),
      claimedAt: Date.now(),
      completedAt: Date.now(),
    });
  }
  if (schedule.status === "active") await scheduleNext(ctx, schedule, scheduledFor);
  return { ok: true, skipped: true };
}

export const run = internalMutation({
  args: { scheduleId: v.id("researchSchedules"), scheduledFor: v.number() },
  handler: async (ctx, args) => {
    const schedule = await ctx.db.get("researchSchedules", args.scheduleId);
    if (schedule === null) return { ok: true, skipped: true };
    if (schedule.nextRunAt !== args.scheduledFor && schedule.status === "active") {
      return { ok: true, skipped: true, reason: "stale_schedule_handle" };
    }
    if (schedule.status !== "active") return await markSkipped(ctx, schedule, args.scheduledFor, "schedule_not_active");

    const bot = await ctx.db.get("bots", schedule.botId);
    const chat = await ctx.db.get("chats", schedule.chatId);
    const creatorRun = await ctx.db.get("researchRuns", schedule.createdByRunId);
    if (
      bot === null ||
      chat === null ||
      creatorRun === null ||
      schedule.ownerId !== bot.ownerId ||
      schedule.ownerId !== chat.ownerId ||
      schedule.ownerId !== creatorRun.ownerId ||
      schedule.botId !== bot._id ||
      schedule.chatId !== chat._id ||
      creatorRun.botId !== bot._id ||
      creatorRun.chatId !== chat._id ||
      bot.status !== "active" ||
      chat.status !== "active"
    ) {
      return await markSkipped(ctx, schedule, args.scheduledFor, "schedule_context_invalid");
    }

    const key = occurrenceKey(schedule._id, args.scheduledFor);
    const duplicate = await ctx.db
      .query("scheduleOccurrences")
      .withIndex("by_occurrence_key", (q) => q.eq("occurrenceKey", key))
      .unique();
    if (duplicate !== null) return { ok: true, duplicate: true, runId: duplicate.runId };

    const credential = await ctx.db
      .query("openaiCredentials")
      .withIndex("by_owner_status", (q) => q.eq("ownerId", schedule.ownerId).eq("status", "active"))
      .first();
    if (credential === null) return await markSkipped(ctx, schedule, args.scheduledFor, "openai_credential_unavailable");

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", schedule.ownerId))
      .unique();
    const globalInstructionVersionId = profile?.globalInstructionVersionId;
    const botInstructionVersionId = bot.currentInstructionVersionId;
    if (globalInstructionVersionId !== undefined) {
      const globalVersion = await ctx.db.get("instructionVersions", globalInstructionVersionId);
      if (globalVersion === null || globalVersion.ownerId !== schedule.ownerId || globalVersion.scope !== "global") {
        return await markSkipped(ctx, schedule, args.scheduledFor, "global_instruction_invalid");
      }
    }
    if (botInstructionVersionId !== undefined) {
      const botVersion = await ctx.db.get("instructionVersions", botInstructionVersionId);
      if (botVersion === null || botVersion.ownerId !== schedule.ownerId || botVersion.scope !== "bot" || botVersion.botId !== bot._id) {
        return await markSkipped(ctx, schedule, args.scheduledFor, "bot_instruction_invalid");
      }
    }

    let activeRun: Doc<"researchRuns"> | null = null;
    if (chat.activeRunId !== undefined) {
      const candidate = await ctx.db.get("researchRuns", chat.activeRunId);
      if (
        candidate !== null &&
        candidate.ownerId === schedule.ownerId &&
        candidate.botId === bot._id &&
        candidate.chatId === chat._id &&
        NONTERMINAL_RUN_STATUSES.has(candidate.status)
      ) activeRun = candidate;
    }
    const queued = activeRun !== null;
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      ownerId: schedule.ownerId,
      botId: bot._id,
      chatId: chat._id,
      origin: "schedule",
      role: "user",
      content: schedule.researchPrompt,
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    const occurrenceId = await ctx.db.insert("scheduleOccurrences", {
      ownerId: schedule.ownerId,
      scheduleId: schedule._id,
      scheduledFor: args.scheduledFor,
      occurrenceKey: key,
      status: "claimed",
      claimedAt: now,
    });
    const runId = await ctx.db.insert("researchRuns", {
      ownerId: schedule.ownerId,
      botId: bot._id,
      chatId: chat._id,
      triggerMessageId: messageId,
      triggerKind: "schedule",
      scheduleId: schedule._id,
      scheduleOccurrenceId: occurrenceId,
      model: DEFAULT_MODEL,
      reasoningEffort: DEFAULT_EFFORT,
      globalInstructionVersionId,
      botInstructionVersionId,
      researchProtocolVersion: 1,
      workerGeneration: 0,
      cancelRequested: false,
      status: queued ? "queued" : "accepted",
      currentStage: mapRunStatusToUiStage(queued ? "queued" : "accepted"),
      createdAt: now,
      updatedAt: now,
    });
    const assistantMessageId = await ctx.db.insert("messages", {
      ownerId: schedule.ownerId,
      botId: bot._id,
      chatId: chat._id,
      runId,
      role: "assistant",
      origin: "schedule",
      content: "",
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("messages", messageId, { runId });
    await ctx.db.patch("researchRuns", runId, { assistantMessageId });
    await ctx.db.patch("scheduleOccurrences", occurrenceId, {
      status: "run_created",
      runId,
    });
    await ctx.db.patch("researchSchedules", schedule._id, {
      lastRunAt: args.scheduledFor,
      convexScheduledFunctionId: undefined,
      updatedAt: now,
    });
    if (!queued) {
      await ctx.db.patch("chats", chat._id, {
        activeRunId: runId,
        lastMessageAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, driveRun, { runId, generation: 1 });
      await ctx.scheduler.runAfter(WATCHDOG_MS, driveRun, { runId, generation: 2 });
    }
    await scheduleNext(ctx, schedule, args.scheduledFor);
    return { ok: true, runId, queued };
  },
});
