"use node";

import type { Doc, Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import {
  createOpenAIClient,
  openAIResponseCreationIdempotencyKey,
} from "../lib/openaiClient";
import { decryptString } from "../lib/crypto";
import { sanitizeErrorCode } from "../lib/normalize";
import { providerForModel } from "../lib/models";
import { buildProviderInput } from "../lib/providerPrompt";
import { buildResearchInstructions } from "../prompts/researchProtocol";
import { getResearchToolDefinitions } from "../tools/definitions";
import {
  normalizeOpenAIStreamEvent,
  type NormalizedOpenAIEvent,
} from "./streamConsumer";
import type {
  ResponseCreateParamsStreaming,
  ResponseInput,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

const STREAM_SLICE_MS = 4 * 60 * 1000;
const WAITING_TOOL_DELAY_MS = 6 * 60 * 1000;
const POST_STREAM_SAFETY_MS = 15 * 1000;

type RunContext = {
  run: Doc<"researchRuns">;
  chat: Doc<"chats">;
  bot: Doc<"bots">;
  triggerMessage: Doc<"messages">;
  assistantMessage: Doc<"messages">;
  credential: { ciphertext: string; initializationVector: string };
  globalMemory?: string;
  botMemory?: string;
  responses: Doc<"openaiResponses">[];
  attachments: Array<{
    id: Id<"messageAttachments">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  priorReportSummary?: string;
  seedLocalHistory: boolean;
  localHistory: Array<{ role: "user" | "assistant"; content: string }>;
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

type StreamOutcome =
  | { state: "active"; responseId?: string }
  | { state: "completed"; responseId: string; finalText: string }
  | {
      state: "creation_failed";
      intentId: Id<"openaiResponses">;
      code: string;
      safeMessage: string;
    }
  | {
      state: "failed";
      responseId: string;
      code: string;
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
  RunContext
>("workers/runMutations:getRunContext");
const getAbortContext = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns"> },
  {
    responseId?: string;
    credential?: { ciphertext: string; initializationVector: string };
  }
>("workers/runMutations:getAbortContext");
const setRunConversation = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation: number;
    conversationId: string;
    replaceChatConversation?: boolean;
  },
  { conversationId: string }
>("workers/runMutations:setRunConversation");
const beginInitialResponse = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns">; generation: number },
  | { state: "created"; intentId: Id<"openaiResponses"> }
  | { state: "active"; response: Doc<"openaiResponses"> }
  | { state: "not_initial" }
>("workers/runMutations:beginInitialResponse");
const activateResponseIntent = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation: number;
    intentId: Id<"openaiResponses">;
    responseId: string;
  },
  { ok: boolean }
>("workers/runMutations:activateResponseIntent");
const checkpointResponseEvent = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation: number;
    responseId: string;
    sequenceNumber: number;
    kind: NormalizedOpenAIEvent["kind"];
    delta?: string;
    finalText?: string;
    failureCode?: string;
    failureMessage?: string;
    openaiItemId?: string;
    functionCalls?: Array<{
      callId: string;
      name: string;
      argumentsJson: string;
    }>;
  },
  { accepted: boolean; terminal: boolean }
>("workers/runMutations:checkpointResponseEvent");
const getToolBarrier = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns">; originResponseId: string },
  {
    hasCalls: boolean;
    allTerminal: boolean;
    toolOutputsSubmitted: boolean;
    calls: Doc<"toolCalls">[];
  }
>("workers/runMutations:getToolBarrier");
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
const prepareToolContinuation = makeFunctionReference<
  "mutation",
  {
    runId: Id<"researchRuns">;
    generation: number;
    originResponseId: string;
  },
  | {
      state: "created";
      intentId: Id<"openaiResponses">;
      outputs: Array<{
        type: "function_call_output";
        call_id: string;
        output: string;
      }>;
    }
  | {
      state: "already_submitted" | "active" | "waiting";
    }
>("workers/runMutations:prepareToolContinuation");
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
    openaiItemId?: string;
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
    intentId?: Id<"openaiResponses">;
  },
  { ok: boolean }
>("workers/runMutations:failRun");
const executeToolCall = makeFunctionReference<
  "action",
  { toolCallId: Id<"toolCalls"> },
  ToolExecutorResult
>("workers/toolExecutor:executeToolCall");

function openAIProviderInput(context: RunContext): string | ResponseInput {
  const currentInput = buildProviderInput(context);
  if (!context.seedLocalHistory) return currentInput;
  return [
    ...context.localHistory.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user", content: currentInput },
  ] as ResponseInput;
}

function checkpointArgs(
  runId: Id<"researchRuns">,
  generation: number,
  responseId: string,
  event: NormalizedOpenAIEvent,
) {
  const base = {
    runId,
    generation,
    responseId,
    sequenceNumber: event.sequenceNumber,
    kind: event.kind,
  };
  switch (event.kind) {
    case "assistant_delta":
    case "reasoning_summary_delta":
      return { ...base, delta: event.delta };
    case "tool_call":
      return { ...base, functionCalls: [event.functionCall] };
    case "completed":
      return {
        ...base,
        finalText: event.finalText,
        openaiItemId: event.assistantItemId,
        functionCalls: event.functionCalls,
      };
    case "failed":
      return {
        ...base,
        failureCode: event.code,
        failureMessage: event.safeMessage,
      };
    default:
      return base;
  }
}

function isAbortFromSlice(error: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "APIUserAbortError"
  );
}

function providerErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isDefinitiveResponseCreationFailure(error: unknown): boolean {
  const status = providerErrorStatus(error);
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 409 &&
    status !== 429
  );
}

function isRetryableResponseCreationFailure(error: unknown): boolean {
  const status = providerErrorStatus(error);
  if (status !== undefined) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  if (typeof error !== "object" || error === null) return false;
  const name =
    "name" in error && typeof (error as { name?: unknown }).name === "string"
      ? (error as { name: string }).name
      : "";
  const constructorName = error.constructor.name;
  return [name, constructorName].some((candidate) =>
    /^APIConnection(?:Timeout)?Error$/.test(candidate),
  );
}

async function decryptContextKey(context: RunContext): Promise<string> {
  return decryptString({
    ciphertextB64: context.credential.ciphertext,
    ivB64: context.credential.initializationVector,
  });
}

function availableStreamSlice(context: RunContext): number {
  const remainingLease =
    (context.run.leaseExpiresAt ?? 0) - Date.now() - POST_STREAM_SAFETY_MS;
  return Math.max(1_000, Math.min(STREAM_SLICE_MS, remainingLease));
}

function hasFullStreamSlice(context: RunContext): boolean {
  return availableStreamSlice(context) === STREAM_SLICE_MS;
}

async function consumeProviderStream(
  ctx: ActionCtx,
  args: { runId: Id<"researchRuns">; generation: number },
  stream: AsyncIterable<ResponseStreamEvent>,
  controller: AbortController,
  knownResponseId?: string,
  intentId?: Id<"openaiResponses">,
): Promise<StreamOutcome> {
  let responseId = knownResponseId;
  try {
    for await (const rawEvent of stream) {
      const event = normalizeOpenAIStreamEvent(rawEvent);
      if (event.kind === "response_created") {
        if (responseId !== undefined && responseId !== event.responseId) {
          throw new Error("OPENAI_RESPONSE_ID_CONFLICT");
        }
        responseId = event.responseId;
        if (intentId !== undefined) {
          await ctx.runMutation(activateResponseIntent, {
            ...args,
            intentId,
            responseId,
          });
          intentId = undefined;
        }
      }
      if (responseId === undefined) {
        throw new Error("OPENAI_RESPONSE_ID_MISSING");
      }
      await ctx.runMutation(
        checkpointResponseEvent,
        checkpointArgs(args.runId, args.generation, responseId, event),
      );
      if (event.kind === "completed") {
        return {
          state: "completed",
          responseId,
          finalText: event.finalText,
        };
      }
      if (event.kind === "failed") {
        return {
          state: "failed",
          responseId,
          code: event.code,
          safeMessage: event.safeMessage,
        };
      }
    }
    return { state: "active", responseId };
  } catch (error) {
    if (isAbortFromSlice(error, controller.signal)) {
      return { state: "active", responseId };
    }
    const internalMessage =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
    if (
      /\b(?:OPENAI_|RUN_|ASSISTANT_|INVALID_|RESPONSE_|ORIGIN_|TOOL_)/.test(
        internalMessage,
      )
    ) {
      throw error;
    }
    const code = sanitizeErrorCode(error);
    if (
      responseId !== undefined &&
      ["timeout", "rate_limited", "provider_error", "unknown_error"].includes(code)
    ) {
      return { state: "active", responseId };
    }
    throw error;
  }
}

async function createResponse(
  ctx: ActionCtx,
  args: { runId: Id<"researchRuns">; generation: number },
  intentId: Id<"openaiResponses">,
  input: string | ResponseInput,
): Promise<StreamOutcome> {
  const context = await ctx.runMutation(getRunContext, args);
  if (context.run.openaiConversationId === undefined) {
    throw new Error("OPENAI_CONVERSATION_MISSING");
  }
  const apiKey = await decryptContextKey(context);
  const client = createOpenAIClient(apiKey);
  const request: ResponseCreateParamsStreaming = {
    model: context.run.model,
    conversation: context.run.openaiConversationId,
    input,
    instructions: buildResearchInstructions({
      globalMemory: context.globalMemory,
      botMemory: context.botMemory,
    }),
    tools: getResearchToolDefinitions({
      includeChatTitle: !context.chat.titleLocked,
      includeResearchEmail: context.run.triggerKind !== "email",
    }),
    reasoning: {
      effort: context.run.reasoningEffort,
    },
    parallel_tool_calls: true,
    background: true,
    stream: true,
    store: true,
  };
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    availableStreamSlice(context),
  );
  try {
    const stream = await client.responses.create(
      request,
      {
        idempotencyKey: openAIResponseCreationIdempotencyKey(intentId),
        signal: controller.signal,
      },
    );
    const outcome = await consumeProviderStream(
      ctx,
      args,
      stream,
      controller,
      undefined,
      intentId,
    );
    return outcome;
  } catch (error) {
    if (isAbortFromSlice(error, controller.signal)) {
      return { state: "active" };
    }
    if (isDefinitiveResponseCreationFailure(error)) {
      const failure = safeWorkerFailure(error);
      return {
        state: "creation_failed",
        intentId,
        code: failure.code,
        safeMessage: failure.message,
      };
    }
    if (isRetryableResponseCreationFailure(error)) {
      return { state: "active" };
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function resumeResponse(
  ctx: ActionCtx,
  args: { runId: Id<"researchRuns">; generation: number },
  response: Doc<"openaiResponses">,
): Promise<StreamOutcome> {
  if (response.responseId === undefined) throw new Error("OPENAI_RESPONSE_ID_MISSING");
  const context = await ctx.runMutation(getRunContext, args);
  const apiKey = await decryptContextKey(context);
  const client = createOpenAIClient(apiKey);
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    availableStreamSlice(context),
  );
  try {
    const stream = await client.responses.retrieve(
      response.responseId,
      {
        stream: true,
        starting_after: response.lastSequenceNumber,
      },
      { signal: controller.signal },
    );
    return await consumeProviderStream(
      ctx,
      args,
      stream,
      controller,
      response.responseId,
    );
  } finally {
    clearTimeout(timer);
  }
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
  originResponseId: string,
): Promise<boolean> {
  for (let phase = 0; phase < 3; phase += 1) {
    const claim = await ctx.runMutation(claimToolPhase, {
      ...args,
      originResponseId,
    });
    if (claim.state === "terminal") return true;
    if (claim.state === "none") return false;
    if (claim.state === "waiting") return false;

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
  const barrier = await ctx.runMutation(getToolBarrier, {
    runId: args.runId,
    originResponseId,
  });
  return barrier.allTerminal;
}

async function failSafely(
  ctx: ActionCtx,
  args: { runId: Id<"researchRuns">; generation: number },
  code: string,
  safeMessage: string,
  intentId?: Id<"openaiResponses">,
) {
  await ctx.runMutation(failRun, {
    ...args,
    code,
    safeMessage,
    intentId,
  });
}

async function handleCompletedResponse(
  ctx: ActionCtx,
  args: { runId: Id<"researchRuns">; generation: number },
  responseId: string,
  finalText?: string,
) {
  const barrier = await ctx.runMutation(getToolBarrier, {
    runId: args.runId,
    originResponseId: responseId,
  });
  if (!barrier.hasCalls) {
    await ctx.runMutation(finalizeRun, { ...args, finalText });
    return;
  }
  if (!barrier.allTerminal) {
    const allTerminal = await executeToolPhases(ctx, args, responseId);
    await ctx.runMutation(yieldRun, {
      ...args,
      delayMs: allTerminal ? 0 : WAITING_TOOL_DELAY_MS,
    });
    return;
  }

  const context = await ctx.runMutation(getRunContext, args);
  if (!hasFullStreamSlice(context)) {
    await ctx.runMutation(yieldRun, { ...args, delayMs: 0 });
    return;
  }

  const continuation = await ctx.runMutation(prepareToolContinuation, {
    ...args,
    originResponseId: responseId,
  });
  if (continuation.state !== "created") {
    if (continuation.state === "waiting") {
      await ctx.runMutation(yieldRun, {
        ...args,
        delayMs: WAITING_TOOL_DELAY_MS,
      });
      return;
    }
    await ctx.runMutation(yieldRun, { ...args, delayMs: 0 });
    return;
  }
  const outcome = await createResponse(
    ctx,
    args,
    continuation.intentId,
    continuation.outputs as ResponseInput,
  );
  await handleStreamOutcome(ctx, args, outcome);
}

async function handleStreamOutcome(
  ctx: ActionCtx,
  args: { runId: Id<"researchRuns">; generation: number },
  outcome: StreamOutcome,
) {
  if (outcome.state === "active") {
    if (outcome.responseId === undefined) {
      await ctx.runMutation(yieldRun, { ...args, delayMs: 0 });
      return;
    }
    await ctx.runMutation(yieldRun, { ...args, delayMs: 0 });
    return;
  }
  if (outcome.state === "creation_failed") {
    await failSafely(
      ctx,
      args,
      outcome.code,
      outcome.safeMessage,
      outcome.intentId,
    );
    return;
  }
  if (outcome.state === "failed") {
    await failSafely(ctx, args, outcome.code, outcome.safeMessage);
    return;
  }
  await handleCompletedResponse(
    ctx,
    args,
    outcome.responseId,
    outcome.finalText,
  );
}

function safeWorkerFailure(error: unknown): { code: string; message: string } {
  const rawMessage =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  if (rawMessage.includes("RUN_LEASE_INVALID")) {
    return { code: "lease_invalid", message: "" };
  }
  if (/\b(?:OPENAI_|INVALID_)/.test(rawMessage)) {
    return {
      code: rawMessage.toLowerCase(),
      message: "The research run encountered an invalid provider state.",
    };
  }
  const code = sanitizeErrorCode(error);
  const validationDetail = safeOpenAIValidationDetail(error);
  const message =
    validationDetail ??
    (code === "unauthorized"
      ? "OpenAI rejected the configured credential."
      : code === "rate_limited"
        ? "OpenAI rate-limited the research run."
        : code === "timeout"
          ? "The provider request timed out before it could be resumed safely."
          : "The research run could not be completed safely.");
  return { code, message };
}

function safeOpenAIValidationDetail(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    param?: unknown;
    message?: unknown;
  };
  if (candidate.status !== 400 && candidate.status !== 422) return null;

  const providerCode = safeProviderField(candidate.code, 80);
  const param = safeProviderField(candidate.param, 120);
  const detail = safeProviderMessage(candidate.message);
  const fields = [
    `status ${candidate.status}`,
    providerCode ? `code ${providerCode}` : null,
    param ? `field ${param}` : null,
  ].filter((field): field is string => field !== null);
  return `OpenAI rejected this request (${fields.join(", ")}).${
    detail ? ` ${detail}` : ""
  }`;
}

function safeProviderField(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^a-zA-Z0-9_.\[\]-]/g, "").slice(0, limit);
  return normalized || null;
}

function safeProviderMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/\b(?:bearer\s+|sk-|sess-)[a-zA-Z0-9_-]+\b/gi, "[redacted]")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
  return normalized || null;
}

export const drive = internalAction({
  args: { runId: v.id("researchRuns"), generation: v.number() },
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(claimRun, args);
    if (!claim.claimed) return { ok: true, claimed: false };

    try {
      let context = await ctx.runMutation(getRunContext, args);
      if (providerForModel(context.run.model) !== "openai") {
        throw new Error("INVALID_OPENAI_RUN_PROVIDER");
      }
      if (context.run.openaiConversationId === undefined) {
        if (
          context.run.triggerKind !== "schedule" &&
          context.chat.openaiConversationId !== undefined &&
          !context.seedLocalHistory
        ) {
          await ctx.runMutation(setRunConversation, {
            ...args,
            conversationId: context.chat.openaiConversationId,
          });
        } else {
          context = await ctx.runMutation(getRunContext, args);
          const apiKey = await decryptContextKey(context);
          const client = createOpenAIClient(apiKey);
          const conversation = await client.conversations.create({
            metadata: { run_id: context.run._id },
          });
          await ctx.runMutation(setRunConversation, {
            ...args,
            conversationId: conversation.id,
            replaceChatConversation: context.seedLocalHistory,
          });
        }
      }

      context = await ctx.runMutation(getRunContext, args);
      const active = context.responses.find(
        (response) => response.status === "active",
      );
      if (active !== undefined) {
        const outcome = await resumeResponse(ctx, args, active);
        await handleStreamOutcome(ctx, args, outcome);
        return { ok: true, claimed: true };
      }

      const currentCompleted = context.responses.find(
        (response) =>
          response.status === "completed" &&
          response.responseId === context.run.openaiResponseId,
      );
      if (currentCompleted?.responseId !== undefined) {
        await handleCompletedResponse(
          ctx,
          args,
          currentCompleted.responseId,
        );
        return { ok: true, claimed: true };
      }

      if (!hasFullStreamSlice(context)) {
        await ctx.runMutation(yieldRun, { ...args, delayMs: 0 });
        return { ok: true, claimed: true };
      }

      const initial = await ctx.runMutation(beginInitialResponse, args);
      if (initial.state !== "created") {
        throw new Error(`INVALID_INITIAL_RESPONSE_STATE:${initial.state}`);
      }
      const outcome = await createResponse(
        ctx,
        args,
        initial.intentId,
        openAIProviderInput(context),
      );
      await handleStreamOutcome(ctx, args, outcome);
      return { ok: true, claimed: true };
    } catch (error) {
      const failure = safeWorkerFailure(error);
      if (failure.code === "lease_invalid") {
        return { ok: true, claimed: true };
      }
      await failSafely(ctx, args, failure.code, failure.message);
      return { ok: false, claimed: true };
    }
  },
});

export const abort = internalAction({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const context = await ctx.runMutation(getAbortContext, args);
    if (context.responseId === undefined || context.credential === undefined) {
      return { ok: true, canceledProviderResponse: false };
    }
    const apiKey = await decryptString({
      ciphertextB64: context.credential.ciphertext,
      ivB64: context.credential.initializationVector,
    });
    const client = createOpenAIClient(apiKey);
    try {
      await client.responses.cancel(context.responseId);
      return { ok: true, canceledProviderResponse: true };
    } catch (error) {
      if (sanitizeErrorCode(error) === "not_found") {
        return { ok: true, canceledProviderResponse: false };
      }
      return { ok: false, canceledProviderResponse: false };
    }
  },
});
