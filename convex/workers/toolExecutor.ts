"use node";

import { makeFunctionReference } from "convex/server";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { sanitizeErrorCode } from "../lib/normalize";
import { isToolFunctionName } from "../tools/definitions";
import { executeRegisteredTool } from "../tools/registry";
import type { ExecutorResult, ToolExecutionContext } from "../tools/types";
import { v } from "convex/values";

type ToolContextResult = {
  toolCall: Doc<"toolCalls">;
  run: Doc<"researchRuns">;
  chat: Doc<"chats">;
  bot: Doc<"bots">;
  args: Record<string, unknown>;
  attachments: ToolExecutionContext["attachments"];
};

const getContext = makeFunctionReference<
  "mutation",
  { toolCallId: Id<"toolCalls"> },
  ToolContextResult
>("firecrawlJobs:getToolExecutionContext");

function failure(error: unknown): ExecutorResult {
  const code = sanitizeErrorCode(error);
  const raw =
    typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const safeMessage =
    /RUN_NOT_LIVE|RUN_CANCELLED|TOOL_CALL_NOT_RUNNING/.test(raw)
      ? "The research run is no longer active."
      : /ATTACHMENT/.test(raw)
        ? "The attached document is no longer available for this research run."
        : "The requested function could not be executed safely.";
  const safeCode =
    code !== "unknown_error"
      ? code
      : /RUN_NOT_LIVE|RUN_CANCELLED|TOOL_CALL_NOT_RUNNING/.test(raw)
        ? "run_not_live"
        : /ATTACHMENT/.test(raw)
          ? "attachment_unavailable"
          : "tool_execution_failed";
  return {
    kind: "failed",
    code: safeCode,
    retryable: false,
    safeMessage,
  };
}

export const executeToolCall = internalAction({
  args: { toolCallId: v.id("toolCalls") },
  handler: async (ctx: ActionCtx, args): Promise<ExecutorResult> => {
    try {
      const context = await ctx.runMutation(getContext, args);
      if (!isToolFunctionName(context.toolCall.functionName)) {
        return {
          kind: "failed",
          code: "unknown_tool",
          retryable: false,
          safeMessage: "The requested function is not available.",
        };
      }
      return await executeRegisteredTool(context.toolCall.functionName, {
        ctx,
        toolCallId: args.toolCallId,
        toolCall: context.toolCall,
        run: context.run,
        chat: context.chat,
        bot: context.bot,
        args: context.args,
        attachments: context.attachments,
      });
    } catch (error) {
      return failure(error);
    }
  },
});
