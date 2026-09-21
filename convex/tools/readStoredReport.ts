"use node";

import { makeFunctionReference } from "convex/server";
import type { ExecutorResult, ToolExecutionContext } from "./types";

const getStoredReport = makeFunctionReference<
  "query",
  {
    toolCallId: ToolExecutionContext["toolCallId"];
    reportId: string;
  },
  {
    reportId: string;
    title: string;
    summary: string;
    status: string;
    createdAt: number;
    runId: string;
    markdownStorageId: string | null;
    markdownBytes: number | null;
  }
>("reports:getStoredReportForTool");

const MAX_REPORT_CHARS = 80_000;

export const execute = async (context: ToolExecutionContext): Promise<ExecutorResult> => {
  const result = await context.ctx.runQuery(getStoredReport, {
    toolCallId: context.toolCallId,
    reportId: context.args.reportId as string,
  });
  let markdownContent: string | null = null;
  if (result.markdownStorageId !== null) {
    const blob = await context.ctx.storage.get(result.markdownStorageId);
    if (blob !== null) {
      const text = new TextDecoder().decode(await blob.arrayBuffer());
      markdownContent =
        text.length > MAX_REPORT_CHARS
          ? `${text.slice(0, MAX_REPORT_CHARS)}\n\n[Truncated]`
          : text;
    }
  }
  return {
    kind: "immediate",
    outputJson: JSON.stringify({
      ok: true,
      reportId: result.reportId,
      title: result.title,
      summary: result.summary,
      status: result.status,
      createdAt: result.createdAt,
      markdownContent,
    }),
  };
};
