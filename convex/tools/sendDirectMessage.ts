"use node";

import { makeFunctionReference } from "convex/server";
import type { ExecutorResult, ToolExecutionContext } from "./types";

const sendDirectEmail = makeFunctionReference<
  "action",
  {
    toolCallId: ToolExecutionContext["toolCallId"];
    subject: string;
    body: string;
  },
  ExecutorResult
>("workers/emailSender:sendDirectEmail");

export const execute = async (context: ToolExecutionContext): Promise<ExecutorResult> => {
  return await context.ctx.runAction(sendDirectEmail, {
    toolCallId: context.toolCallId,
    subject: context.args.subject as string,
    body: context.args.body as string,
  });
};
