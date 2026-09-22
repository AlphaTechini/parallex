import { makeFunctionReference } from "convex/server";

import type { Id } from "../_generated/dataModel";
import type { TemplateSpecification } from "../lib/templateFramework";
import type { ExecutorResult, ToolExecutionContext } from "./types";

const prepareDraft = makeFunctionReference<
  "mutation",
  TemplateSpecification & {
    toolCallId: ToolExecutionContext["toolCallId"];
  },
  {
    draftId: Id<"templateDrafts">;
    status: string;
    reviewPath: string;
  }
>("templateDrafts:prepareDraftForTool");

export async function execute(
  context: ToolExecutionContext,
): Promise<ExecutorResult> {
  const raw = context.args as unknown as TemplateSpecification & {
    schedules: Array<
      Omit<TemplateSpecification["schedules"][number], "weekday" | "dayOfMonth"> & {
        weekday: number | null;
        dayOfMonth: number | null;
      }
    >;
  };
  const result = await context.ctx.runMutation(prepareDraft, {
    toolCallId: context.toolCallId,
    ...raw,
    schedules: raw.schedules.map(({ weekday, dayOfMonth, ...rest }) => ({
      ...rest,
      ...(weekday !== null && weekday !== undefined ? { weekday } : {}),
      ...(dayOfMonth !== null && dayOfMonth !== undefined
        ? { dayOfMonth }
        : {}),
    })),
  });
  return {
    kind: "immediate",
    outputJson: JSON.stringify({ ok: true, ...result }),
  };
}
