import { makeFunctionReference } from "convex/server";
import type { ExecutorResult, ToolExecutionContext } from "./types";

const listResearchSchedules = makeFunctionReference<
  "query",
  { toolCallId: ToolExecutionContext["toolCallId"] },
  {
    schedules: Array<{
      scheduleId: string;
      name: string;
      researchPrompt: string;
      semanticReason: string;
      scheduleKind: "one_time" | "recurring";
      timezone: string;
      recurrence: {
        frequency: "hourly" | "daily" | "weekly" | "monthly";
        interval: number;
        hour?: number;
        minute?: number;
        weekday?: number;
        dayOfMonth?: number;
      } | null;
      nextRunAt: number | null;
      status: "active" | "paused" | "completed";
    }>;
  }
>("schedules:listSchedulesForTool");

export async function execute(
  context: ToolExecutionContext,
): Promise<ExecutorResult> {
  const result = await context.ctx.runQuery(listResearchSchedules, {
    toolCallId: context.toolCallId,
  });
  return {
    kind: "immediate",
    outputJson: JSON.stringify({ ok: true, ...result }),
  };
}
