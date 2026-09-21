import { makeFunctionReference } from "convex/server";
import { internalMutation } from "../_generated/server";
import { normalizeRecurrence, isValidTimeZone } from "../lib/recurrence";
import { v } from "convex/values";
import type { ExecutorResult, ToolExecutionContext } from "./types";
import type { Id } from "../_generated/dataModel";
import { providerForRun } from "../lib/models";

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);

type ScheduleRecurrence = {
  frequency: "hourly" | "daily" | "weekly" | "monthly";
  interval: number;
  hour?: number;
  minute?: number;
  weekday?: number;
  dayOfMonth?: number;
};

function normalizeToolRecurrence(value: unknown): ScheduleRecurrence | undefined {
  if (value === null) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("INVALID_RECURRENCE");
  }
  const raw = value as Record<string, unknown>;
  const frequency = raw.frequency;
  const interval = raw.interval;
  if (
    (frequency !== "hourly" &&
      frequency !== "daily" &&
      frequency !== "weekly" &&
      frequency !== "monthly") ||
    typeof interval !== "number"
  ) {
    throw new Error("INVALID_RECURRENCE");
  }
  const optionalNumber = (key: string): number | undefined =>
    typeof raw[key] === "number" ? raw[key] : undefined;
  return {
    frequency,
    interval,
    hour: optionalNumber("hour"),
    minute: optionalNumber("minute"),
    weekday: optionalNumber("weekday"),
    dayOfMonth: optionalNumber("dayOfMonth"),
  };
}

const recurrenceValidator = v.optional(
  v.object({
    frequency: v.union(
      v.literal("hourly"),
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    interval: v.number(),
    hour: v.optional(v.number()),
    minute: v.optional(v.number()),
    weekday: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
  }),
);

const occurrenceWorker = makeFunctionReference<
  "mutation",
  { scheduleId: Id<"researchSchedules">; scheduledFor: number },
  unknown
>("scheduleOccurrenceWorker:run");

export const createScheduleMutation = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    name: v.string(),
    researchPrompt: v.string(),
    semanticReason: v.string(),
    scheduleKind: v.union(v.literal("one_time"), v.literal("recurring")),
    timezone: v.string(),
    nextRunAt: v.number(),
    recurrence: recurrenceValidator,
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get("toolCalls", args.toolCallId);
    if (call === null || call.functionName !== "create_research_schedule") throw new Error("TOOL_CALL_INVALID");
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
      run.chatId !== chat._id ||
      run.botId !== bot._id ||
      chat.botId !== bot._id ||
      chat.status !== "active" ||
      bot.status !== "active" ||
      call.status !== "running" ||
      run.cancelRequested ||
      TERMINAL_RUN_STATUSES.has(run.status) ||
      chat.activeRunId !== run._id
    ) throw new Error("SCHEDULE_CONTEXT_INVALID");
    const name = args.name.replace(/\u0000/g, "").trim().slice(0, 200);
    const researchPrompt = args.researchPrompt.replace(/\u0000/g, "").trim().slice(0, 10_000);
    const semanticReason = args.semanticReason.replace(/\u0000/g, "").trim().slice(0, 1_000);
    if (!name || !researchPrompt || !semanticReason) throw new Error("INVALID_SCHEDULE_INPUT");
    if (!isValidTimeZone(args.timezone)) throw new Error("INVALID_TIMEZONE");
    if (!Number.isInteger(args.nextRunAt) || args.nextRunAt <= Date.now()) throw new Error("SCHEDULE_MUST_BE_FUTURE");
    if (args.scheduleKind === "recurring" && args.recurrence === undefined) throw new Error("INVALID_RECURRENCE");
    if (args.scheduleKind === "one_time" && args.recurrence !== undefined) throw new Error("INVALID_RECURRENCE");

    const normalizedRecurrence = args.recurrence === undefined
      ? undefined
      : normalizeRecurrence(
          {
            frequency: args.recurrence.frequency,
            interval: args.recurrence.interval,
            hour: args.recurrence.hour ?? null,
            minute: args.recurrence.minute ?? null,
            weekday: args.recurrence.weekday ?? null,
            dayOfMonth: args.recurrence.dayOfMonth ?? null,
          },
          args.timezone,
          args.nextRunAt,
        );

    const existingSchedules = await ctx.db
      .query("researchSchedules")
      .withIndex("by_bot_status_next", (q) => q.eq("botId", bot._id))
      .take(100);
    const same = existingSchedules.find(
      (schedule) =>
        schedule.ownerId === run.ownerId &&
        schedule.status !== "deleted" &&
        (schedule.semanticReason === semanticReason ||
          (schedule.name === name &&
            schedule.researchPrompt === researchPrompt &&
            schedule.scheduleKind === args.scheduleKind &&
            schedule.timezone === args.timezone &&
            JSON.stringify(schedule.recurrence ?? null) ===
              JSON.stringify(normalizedRecurrence ?? null))),
    );
    if (same !== undefined) {
      return { scheduleId: same._id, nextRunAt: same.nextRunAt, status: same.status };
    }

    const now = Date.now();
    const scheduleId = await ctx.db.insert("researchSchedules", {
      ownerId: run.ownerId,
      botId: bot._id,
      chatId: chat._id,
      createdByRunId: run._id,
      provider: providerForRun(run),
      model: run.model,
      reasoningEffort: run.reasoningEffort,
      name,
      researchPrompt,
      semanticReason,
      scheduleKind: args.scheduleKind,
      timezone: args.timezone,
      recurrence: normalizedRecurrence,
      nextRunAt: args.nextRunAt,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const convexScheduledFunctionId = await ctx.scheduler.runAt(args.nextRunAt, occurrenceWorker, {
      scheduleId,
      scheduledFor: args.nextRunAt,
    });
    await ctx.db.patch("researchSchedules", scheduleId, {
      convexScheduledFunctionId,
      updatedAt: Date.now(),
    });
    return { scheduleId, nextRunAt: args.nextRunAt, status: "active" as const };
  },
});

const createSchedule = makeFunctionReference<
  "mutation",
  {
    toolCallId: ToolExecutionContext["toolCallId"];
    name: string;
    researchPrompt: string;
    semanticReason: string;
    scheduleKind: "one_time" | "recurring";
    timezone: string;
    nextRunAt: number;
    recurrence?: {
      frequency: "hourly" | "daily" | "weekly" | "monthly";
      interval: number;
      hour?: number;
      minute?: number;
      weekday?: number;
      dayOfMonth?: number;
    };
  },
  { scheduleId: Id<"researchSchedules">; nextRunAt: number; status: string }
>("tools/createResearchSchedule:createScheduleMutation");

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  const recurrence = normalizeToolRecurrence(context.args.recurrence);
  const result = await context.ctx.runMutation(createSchedule, {
    toolCallId: context.toolCallId,
    name: context.args.name as string,
    researchPrompt: context.args.researchPrompt as string,
    semanticReason: context.args.semanticReason as string,
    scheduleKind: context.args.scheduleKind as "one_time" | "recurring",
    timezone: context.args.timezone as string,
    nextRunAt: context.args.nextRunAt as number,
    recurrence,
  });
  return {
    kind: "immediate",
    outputJson: JSON.stringify({ ok: true, ...result }),
  };
}
