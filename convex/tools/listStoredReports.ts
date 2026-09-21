"use node";

import { makeFunctionReference } from "convex/server";
import type { ExecutorResult, ToolExecutionContext } from "./types";

const listStoredReports = makeFunctionReference<
  "query",
  { toolCallId: ToolExecutionContext["toolCallId"] },
  {
    reports: Array<{
      reportId: string;
      title: string;
      summary: string;
      status: string;
      createdAt: number;
      runId: string;
      emailStatus: string | null;
      emailFailureCode: string | null;
      emailMessageId: string | null;
    }>;
  }
>("reports:listStoredReportsForTool");

export const execute = async (context: ToolExecutionContext): Promise<ExecutorResult> => {
  const result = await context.ctx.runQuery(listStoredReports, {
    toolCallId: context.toolCallId,
  });
  return {
    kind: "immediate",
    outputJson: JSON.stringify({ ok: true, ...result }),
  };
};
