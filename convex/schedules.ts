import { makeFunctionReference } from "convex/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { getAuthenticatedUserId, requireOwnedBot, requireOwnedSchedule } from "./lib/authHelpers";
import { nextOccurrence } from "./lib/recurrence";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const occurrenceWorker = makeFunctionReference<
  "mutation",
  { scheduleId: Id<"researchSchedules">; scheduledFor: number },
  unknown
>("scheduleOccurrenceWorker:run");

async function cancelScheduledFunction(ctx: MutationCtx, id: Id<"_scheduled_functions"> | undefined) {
  if (id === undefined) return;
  try {
    await ctx.scheduler.cancel(id);
  } catch {
    return;
  }
}

export const listSchedules = query({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    await requireOwnedBot(ctx, ownerId, args.botId);
    const schedules = await ctx.db
      .query("researchSchedules")
      .withIndex("by_bot_status_next", (q) => q.eq("botId", args.botId))
      .collect();
    return schedules
      .filter((schedule) => schedule.ownerId === ownerId && schedule.status !== "deleted")
      .sort((left, right) => (left.nextRunAt ?? 0) - (right.nextRunAt ?? 0))
      .map((schedule) => ({
        _id: schedule._id,
        name: schedule.name,
        researchPrompt: schedule.researchPrompt,
        scheduleKind: schedule.scheduleKind,
        timezone: schedule.timezone,
        nextRunAt: schedule.status === "active" ? schedule.nextRunAt : null,
        status: schedule.status,
      }));
  },
});

export const listSchedulesForTool = query({
  args: { toolCallId: v.id("toolCalls") },
  handler: async (ctx, args) => {
    const call = await ctx.db.get("toolCalls", args.toolCallId);
    if (
      call === null ||
      call.functionName !== "list_research_schedules"
    ) {
      throw new Error("TOOL_CALL_INVALID");
    }
    const run = await ctx.db.get("researchRuns", call.runId);
    const bot = run === null ? null : await ctx.db.get("bots", run.botId);
    if (
      run === null ||
      bot === null ||
      call.ownerId !== run.ownerId ||
      bot.ownerId !== run.ownerId ||
      run.botId !== bot._id ||
      bot.status !== "active"
    ) {
      throw new Error("SCHEDULE_CONTEXT_INVALID");
    }
    const schedules = await ctx.db
      .query("researchSchedules")
      .withIndex("by_bot_status_next", (q) => q.eq("botId", bot._id))
      .take(100);
    return {
      schedules: schedules
        .filter(
          (schedule) =>
            schedule.ownerId === run.ownerId && schedule.status !== "deleted",
        )
        .map((schedule) => ({
          scheduleId: schedule._id,
          name: schedule.name,
          researchPrompt: schedule.researchPrompt,
          semanticReason: schedule.semanticReason,
          scheduleKind: schedule.scheduleKind,
          timezone: schedule.timezone,
          recurrence: schedule.recurrence ?? null,
          nextRunAt: schedule.status === "active" ? schedule.nextRunAt : null,
          status: schedule.status,
        })),
    };
  },
});

export const pauseSchedule = mutation({
  args: { scheduleId: v.id("researchSchedules") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const schedule = await requireOwnedSchedule(ctx, ownerId, args.scheduleId);
    if (schedule.status !== "active") return { ok: true };
    await cancelScheduledFunction(ctx, schedule.convexScheduledFunctionId);
    await ctx.db.patch("researchSchedules", schedule._id, {
      status: "paused",
      convexScheduledFunctionId: undefined,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const resumeSchedule = mutation({
  args: { scheduleId: v.id("researchSchedules") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const schedule = await requireOwnedSchedule(ctx, ownerId, args.scheduleId);
    if (schedule.status !== "paused") return { ok: true };
    const now = Date.now();
    let nextRunAt = schedule.nextRunAt;
    if (schedule.scheduleKind === "one_time") {
      if (nextRunAt <= now) throw new Error("SCHEDULE_EXPIRED");
    } else {
      if (schedule.recurrence === undefined) throw new Error("INVALID_RECURRENCE");
      nextRunAt = nextOccurrence(schedule.recurrence, schedule.timezone, Math.max(now, nextRunAt));
    }
    const scheduledFunctionId = await ctx.scheduler.runAt(nextRunAt, occurrenceWorker, {
      scheduleId: schedule._id,
      scheduledFor: nextRunAt,
    });
    await ctx.db.patch("researchSchedules", schedule._id, {
      status: "active",
      nextRunAt,
      convexScheduledFunctionId: scheduledFunctionId,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const deleteSchedule = mutation({
  args: { scheduleId: v.id("researchSchedules") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const schedule = await requireOwnedSchedule(ctx, ownerId, args.scheduleId);
    if (schedule.status === "deleted") return { ok: true };
    await cancelScheduledFunction(ctx, schedule.convexScheduledFunctionId);
    const now = Date.now();
    await ctx.db.patch("researchSchedules", schedule._id, {
      status: "deleted",
      convexScheduledFunctionId: undefined,
      deletedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});
