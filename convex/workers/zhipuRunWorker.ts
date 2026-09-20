"use node";

import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import { decryptString } from "../lib/crypto";
import { sanitizeErrorCode } from "../lib/normalize";
import { buildProviderInput } from "../lib/providerPrompt";
import { createZhipuClient } from "../lib/zhipuClient";
import { buildResearchInstructions } from "../prompts/researchProtocol";
import { getResearchToolDefinitions } from "../tools/definitions";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type OpenAI from "openai";

const WAITING_TOOL_DELAY_MS = 6 * 60 * 1000;
const RETRY_DELAY_MS = 5_000;

type ZhipuContext = {
  run: Doc<"researchRuns">;
  chat: Doc<"chats">;
  bot: Doc<"bots">;
  triggerMessage: Doc<"messages">;
  assistantMessage: Doc<"messages">;
  credential: { ciphertext: string; initializationVector: string };
  globalMemory?: string;
  botMemory?: string;
  attachments: Array<{
    id: Id<"messageAttachments">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  priorReportSummary?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  turns: Doc<"zhipuTurns">[];
  toolCalls: Doc<"toolCalls">[];
};

type ToolExecutorResult =
  | { kind?: "immediate"; outputJson: string }
  | { kind?: "async"; providerJobId: string; capability: string }
  | {
      kind?: "failed";
      code: string;
      retryable: boolean;
      safeMessage: string;
    };

const claimRun = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns">; generation: number },
  { claimed: boolean; reason: string }
>("workers/runMutations:claimRun");
const getRunContext = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns">; generation: number },
  ZhipuContext
>("workers/zhipuRunMutations:getRunContext");
const beginTurn = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns">; generation: number },
  { turnId: Id<"zhipuTurns">; sequence: number }
>("workers/zhipuRunMutations:beginTurn");
const completeTurn = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation: number;
    turnId: Id<"zhipuTurns">;
    providerCompletionId: string;
    assistantContent?: string;
    functionCalls: Array<{
      callId: string;
      name: string;
      argumentsJson: string;
    }>;
  },
  {
    originResponseId: string;
    assistantContent?: string;
    toolCallCount: number;
  }
>("workers/zhipuRunMutations:completeTurn");
const getTurnBarrier = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns">; turnId: Id<"zhipuTurns"> },
  {
    originResponseId: string;
    hasCalls: boolean;
    allTerminal: boolean;
    calls: Doc<"toolCalls">[];
  }
>("workers/zhipuRunMutations:getTurnBarrier");
const abandonTurn = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation: number;
    turnId: Id<"zhipuTurns">;
  },
  { ok: boolean }
>("workers/zhipuRunMutations:abandonTurn");
const claimToolPhase = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation: number;
    originResponseId: string;
  },
  {
    state: "none" | "terminal" | "waiting" | "claimed";
    toolCallIds: Id<"toolCalls">[];
  }
>("workers/runMutations:claimToolPhase");
const completeToolCall = makeFunctionReference<
  "mutation",
  {
    toolCallId: Id<"toolCalls">;
    status: "succeeded" | "failed";
    outputJson?: string;
    code?: string;
    retryable?: boolean;
    safeMessage?: string;
  },
  { ok: boolean; alreadyTerminal: boolean }
>("workers/runMutations:completeToolCall");
const executeToolCall = makeFunctionReference<
  "action",
  { toolCallId: Id<"toolCalls"> },
  ToolExecutorResult
>("workers/toolExecutor:executeToolCall");
const yieldRun = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns">; generation: number; delayMs?: number },
  { scheduled: boolean }
>("workers/runMutations:yieldRun");
const finalizeRun = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation: number;
    finalText?: string;
  },
  { ok: boolean }
>("workers/runMutations:finalizeRun");
const failRun = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation?: number;
    code: string;
    safeMessage: string;
  },
  { ok: boolean }
>("workers/runMutations:failRun");

function turnOrigin(turnId: Id<"zhipuTurns">): string {
  return `zhipu:${turnId}`;
}

function providerStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isRetryableProviderError(error: unknown): boolean {
  const status = providerStatus(error);
  if (status !== undefined) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  if (typeof error !== "object" || error === null) return false;
  const name =
    "name" in error && typeof (error as { name?: unknown }).name === "string"
      ? (error as { name: string }).name
      : error.constructor.name;
  return /^APIConnection(?:Timeout)?Error$/.test(name);
}

function safeFailure(error: unknown): { code: string; message: string } {
  const raw =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  if (raw.includes("RUN_LEASE_INVALID")) {
    return { code: "lease_invalid", message: "" };
  }
  if (/\b(?:ZHIPU_|INVALID_|EMPTY_|ASSISTANT_|TOOL_)/.test(raw)) {
    return {
      code: raw.toLowerCase(),
      message: "The research run encountered an invalid provider state.",
    };
  }
  const code = sanitizeErrorCode(error);
  const message =
    code === "unauthorized"
      ? "Zhipu rejected the configured credential."
      : code === "rate_limited"
        ? "Zhipu rate-limited the research run."
        : code === "timeout"
          ? "The Zhipu request timed out before it completed."
          : "The Zhipu research run could not be completed safely.";
  return { code, message };
}

function chatMessages(context: ZhipuContext) {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildResearchInstructions({
        globalMemory: context.globalMemory,
        botMemory: context.botMemory,
      }),
    },
    ...context.history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user", content: buildProviderInput(context) },
  ];

  for (const turn of context.turns) {
    if (turn.status !== "completed") continue;
    const origin = turnOrigin(turn._id);
    const calls = context.toolCalls
      .filter((call) => call.originResponseId === origin)
      .sort(
        (left, right) =>
          left.requestedAt - right.requestedAt ||
          left._creationTime - right._creationTime,
      );
    messages.push({
      role: "assistant",
      content: turn.assistantContent ?? null,
      tool_calls:
        calls.length === 0
          ? undefined
          : calls.map((call) => ({
              id: call.openaiCallId,
              type: "function" as const,
              function: {
                name: call.functionName,
                arguments: call.argumentsJson,
              },
            })),
    });
    for (const call of calls) {
      messages.push({
        role: "tool",
        tool_call_id: call.openaiCallId,
        content:
          call.resultJson ??
          JSON.stringify({
            ok: false,
            error: {
              code: "missing_tool_output",
              message: "The function ended without a usable output.",
              retryable: false,
            },
          }),
      });
    }
  }
  return messages;
}

function chatTools(context: ZhipuContext) {
  return getResearchToolDefinitions({
    includeChatTitle: !context.chat.titleLocked,
    includeResearchEmail: context.run.triggerKind !== "email",
  }).map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

async function recordExecutorResult(
  ctx: ActionCtx,
  toolCallId: Id<"toolCalls">,
  result: ToolExecutorResult,
) {
  if ("outputJson" in result && typeof result.outputJson === "string") {
    await ctx.runMutation(completeToolCall, {
      toolCallId,
      status: "succeeded",
      outputJson: result.outputJson,
    });
    return;
  }
  if (
    "providerJobId" in result &&
    typeof result.providerJobId === "string" &&
    "capability" in result &&
    typeof result.capability === "string"
  ) {
    return;
  }
  if (
    "code" in result &&
    typeof result.code === "string" &&
    "retryable" in result &&
    typeof result.retryable === "boolean" &&
    "safeMessage" in result &&
    typeof result.safeMessage === "string"
  ) {
    await ctx.runMutation(completeToolCall, {
      toolCallId,
      status: "failed",
      code: result.code,
      retryable: result.retryable,
      safeMessage: result.safeMessage,
    });
    return;
  }
  await ctx.runMutation(completeToolCall, {
    toolCallId,
    status: "failed",
    code: "invalid_executor_result",
    retryable: false,
    safeMessage: "The function executor returned an invalid result.",
  });
}

async function executeToolPhases(
  ctx: ActionCtx,
  args: { runId: Id<"researchRuns">; generation: number },
  turnId: Id<"zhipuTurns">,
): Promise<boolean> {
  const barrier = await ctx.runMutation(getTurnBarrier, {
    runId: args.runId,
    turnId,
  });
  if (!barrier.hasCalls || barrier.allTerminal) return barrier.allTerminal;

  for (let phase = 0; phase < 3; phase += 1) {
    const claim = await ctx.runMutation(claimToolPhase, {
      ...args,
      originResponseId: barrier.originResponseId,
    });
    if (claim.state === "terminal") return true;
    if (claim.state === "none" || claim.state === "waiting") return false;
    await Promise.all(
      claim.toolCallIds.map(async (toolCallId) => {
        try {
          const result = await ctx.runAction(executeToolCall, { toolCallId });
          await recordExecutorResult(ctx, toolCallId, result);
        } catch {
          await ctx.runMutation(completeToolCall, {
            toolCallId,
            status: "failed",
            code: "tool_executor_error",
            retryable: true,
            safeMessage: "The function executor could not complete the request.",
          });
        }
      }),
    );
  }
  return (
    await ctx.runMutation(getTurnBarrier, {
      runId: args.runId,
      turnId,
    })
  ).allTerminal;
}

async function continueAfterToolTurn(
  ctx: ActionCtx,
  args: { runId: Id<"researchRuns">; generation: number },
  turnId: Id<"zhipuTurns">,
) {
  const allTerminal = await executeToolPhases(ctx, args, turnId);
  await ctx.runMutation(yieldRun, {
    ...args,
    delayMs: allTerminal ? 0 : WAITING_TOOL_DELAY_MS,
  });
}

export const drive = internalAction({
  args: { runId: v.id("researchRuns"), generation: v.number() },
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(claimRun, args);
    if (!claim.claimed) return { ok: true, claimed: false };

    let turnId: Id<"zhipuTurns"> | undefined;
    try {
      const context = await ctx.runMutation(getRunContext, args);
      const latestTurn = [...context.turns].sort(
        (left, right) => right.sequence - left.sequence,
      )[0];
      if (latestTurn?.status === "completed") {
        const barrier = await ctx.runMutation(getTurnBarrier, {
          runId: args.runId,
          turnId: latestTurn._id,
        });
        if (!barrier.hasCalls) {
          await ctx.runMutation(finalizeRun, {
            ...args,
            finalText: latestTurn.assistantContent,
          });
          return { ok: true, claimed: true };
        }
        if (!barrier.allTerminal) {
          await continueAfterToolTurn(ctx, args, latestTurn._id);
          return { ok: true, claimed: true };
        }
      }

      const intent = await ctx.runMutation(beginTurn, args);
      turnId = intent.turnId;
      const apiKey = await decryptString({
        ciphertextB64: context.credential.ciphertext,
        ivB64: context.credential.initializationVector,
      });
      const client = createZhipuClient(apiKey);
      const request = {
        model: context.run.model,
        messages: chatMessages(context),
        tools: chatTools(context),
        tool_choice: "auto" as const,
        thinking: { type: "enabled", clear_thinking: true },
        reasoning_effort: context.run.reasoningEffort,
        stream: false as const,
      };
      const completion = await client.chat.completions.create(
        request as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      );
      const choice = completion.choices[0];
      const message = choice?.message;
      if (message === undefined || choice === undefined) {
        throw new Error("ZHIPU_COMPLETION_EMPTY");
      }
      const functionCalls = (message.tool_calls ?? [])
        .filter((call) => call.type === "function")
        .map((call) => ({
          callId: call.id,
          name: call.function.name,
          argumentsJson: call.function.arguments,
        }));
      const finishReason = choice.finish_reason as string | null;
      if (finishReason === "network_error") {
        await ctx.runMutation(yieldRun, { ...args, delayMs: RETRY_DELAY_MS });
        return { ok: true, claimed: true };
      }
      if (
        (finishReason !== "stop" && finishReason !== "tool_calls") ||
        (finishReason === "tool_calls" && functionCalls.length === 0)
      ) {
        throw new Error(
          `ZHIPU_FINISH_REASON_${finishReason ?? "missing"}`,
        );
      }
      const result = await ctx.runMutation(completeTurn, {
        ...args,
        turnId,
        providerCompletionId: completion.id,
        assistantContent:
          typeof message.content === "string" ? message.content : undefined,
        functionCalls,
      });
      if (result.toolCallCount === 0) {
        await ctx.runMutation(finalizeRun, {
          ...args,
          finalText: result.assistantContent,
        });
      } else {
        await continueAfterToolTurn(ctx, args, turnId);
      }
      return { ok: true, claimed: true };
    } catch (error) {
      const failure = safeFailure(error);
      if (failure.code === "lease_invalid") {
        return { ok: true, claimed: true };
      }
      if (isRetryableProviderError(error)) {
        await ctx.runMutation(yieldRun, { ...args, delayMs: RETRY_DELAY_MS });
        return { ok: true, claimed: true };
      }
      if (turnId !== undefined) {
        await ctx.runMutation(abandonTurn, { ...args, turnId });
      }
      await ctx.runMutation(failRun, {
        ...args,
        code: failure.code,
        safeMessage: failure.message,
      });
      return { ok: false, claimed: true };
    }
  },
});
