import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { ExecutorResult, ToolExecutionContext } from "./types";

const prepareDraft = makeFunctionReference<
  "mutation",
  {
    toolCallId: ToolExecutionContext["toolCallId"];
    recipientEmail: string;
    merchantName: string;
    productLabel: string;
    subject: string;
    body: string;
    constraints: string;
  },
  { draftId: Id<"outreachDrafts">; status: string }
>("outreach:prepareDraftForTool");

export async function execute(
  context: ToolExecutionContext,
): Promise<ExecutorResult> {
  const result = await context.ctx.runMutation(prepareDraft, {
    toolCallId: context.toolCallId,
    recipientEmail: context.args.recipientEmail as string,
    merchantName: context.args.merchantName as string,
    productLabel: context.args.productLabel as string,
    subject: context.args.subject as string,
    body: context.args.body as string,
    constraints: context.args.constraints as string,
  });
  return {
    kind: "immediate",
    outputJson: JSON.stringify({ ok: true, ...result }),
  };
}
