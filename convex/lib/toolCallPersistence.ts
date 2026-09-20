import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { sha256Hex, toolKey } from "./normalize";
import {
  isToolFunctionName,
  validateToolArguments,
} from "../tools/definitions";

async function nextRunEventSequence(
  ctx: MutationCtx,
  runId: Doc<"researchRuns">["_id"],
): Promise<number> {
  const previous = await ctx.db
    .query("runEvents")
    .withIndex("by_run_sequence", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
  return (previous?.sequence ?? 0) + 1;
}

export async function insertRunEvent(
  ctx: MutationCtx,
  run: Doc<"researchRuns">,
  event: Omit<
    Doc<"runEvents">,
    "_id" | "_creationTime" | "ownerId" | "runId" | "sequence" | "createdAt"
  >,
) {
  await ctx.db.insert("runEvents", {
    ownerId: run.ownerId,
    runId: run._id,
    sequence: await nextRunEventSequence(ctx, run._id),
    ...event,
    createdAt: Date.now(),
  });
}

export async function insertFunctionCall(
  ctx: MutationCtx,
  run: Doc<"researchRuns">,
  originResponseId: string,
  call: { callId: string; name: string; argumentsJson: string },
) {
  if (!isToolFunctionName(call.name)) {
    throw new Error("OPENAI_UNKNOWN_TOOL");
  }
  const validation = validateToolArguments(call.name, call.argumentsJson);
  const argumentsJson = validation.ok
    ? validation.canonicalJson
    : call.argumentsJson.slice(0, 500_000);
  const argumentsHash = await sha256Hex(argumentsJson);
  const existing = await ctx.db
    .query("toolCalls")
    .withIndex("by_run_openai_call", (q) =>
      q.eq("runId", run._id).eq("openaiCallId", call.callId),
    )
    .unique();
  if (existing !== null) {
    if (
      existing.functionName !== call.name ||
      existing.argumentsHash !== argumentsHash ||
      existing.originResponseId !== originResponseId
    ) {
      throw new Error("OPENAI_TOOL_CALL_CONFLICT");
    }
    return existing._id;
  }
  const externalCall = await ctx.db
    .query("toolCalls")
    .withIndex("by_openai_call", (q) => q.eq("openaiCallId", call.callId))
    .unique();
  if (externalCall !== null) {
    throw new Error("OPENAI_TOOL_CALL_OWNERSHIP_CONFLICT");
  }

  const now = Date.now();
  const toolCallId = await ctx.db.insert("toolCalls", {
    ownerId: run.ownerId,
    runId: run._id,
    openaiCallId: call.callId,
    functionName: call.name,
    argumentsJson,
    argumentsHash,
    idempotencyKey: toolKey(run._id, call.callId),
    status: validation.ok ? "validated" : "failed",
    resultJson: validation.ok
      ? undefined
      : JSON.stringify({
          ok: false,
          error: {
            code: validation.code,
            message: validation.safeMessage,
            retryable: false,
          },
        }),
    failureCode: validation.ok ? undefined : validation.code,
    requestedAt: now,
    completedAt: validation.ok ? undefined : now,
    originResponseId,
  });
  if (call.name.startsWith("firecrawl_")) {
    await insertRunEvent(ctx, run, {
      kind: "firecrawl_query",
      label: "Querying with Firecrawl",
      status: validation.ok ? "started" : "failed",
      safeDetail: validation.ok ? undefined : validation.safeMessage,
      toolCallId,
    });
  } else if (call.name === "publish_report") {
    await insertRunEvent(ctx, run, {
      kind: "report_generation",
      label: "Preparing research report",
      status: validation.ok ? "started" : "failed",
      safeDetail: validation.ok ? undefined : validation.safeMessage,
      toolCallId,
    });
  } else if (call.name === "send_research_email") {
    await insertRunEvent(ctx, run, {
      kind: "email_send",
      label: "Preparing research email",
      status: validation.ok ? "started" : "failed",
      safeDetail: validation.ok ? undefined : validation.safeMessage,
      toolCallId,
    });
  }
  return toolCallId;
}
