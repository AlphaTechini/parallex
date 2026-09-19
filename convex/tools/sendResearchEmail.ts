"use node";

import { makeFunctionReference } from "convex/server";
import type { ExecutorResult, ToolExecutionContext } from "./types";

const sendEmail = makeFunctionReference<
  "action",
  { toolCallId: ToolExecutionContext["toolCallId"]; subject: string; bodySummary: string },
  ExecutorResult
>("workers/emailSender:sendEmail");

export const execute = async (context: ToolExecutionContext): Promise<ExecutorResult> => {
  return await context.ctx.runAction(sendEmail, {
    toolCallId: context.toolCallId,
    subject: context.args.subject as string,
    bodySummary: context.args.bodySummary as string,
  });
};
