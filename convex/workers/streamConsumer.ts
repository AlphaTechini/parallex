import type {
  Response,
  ResponseFunctionToolCall,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

export type NormalizedFunctionCall = {
  callId: string;
  name: string;
  argumentsJson: string;
};

export type NormalizedOpenAIEvent =
  | { kind: "response_created"; sequenceNumber: number; responseId: string }
  | { kind: "assistant_delta"; sequenceNumber: number; delta: string }
  | { kind: "reasoning_summary_delta"; sequenceNumber: number; delta: string }
  | {
      kind: "tool_call";
      sequenceNumber: number;
      functionCall: NormalizedFunctionCall;
    }
  | {
      kind: "completed";
      sequenceNumber: number;
      finalText: string;
      assistantItemId?: string;
      functionCalls: NormalizedFunctionCall[];
    }
  | {
      kind: "failed";
      sequenceNumber: number;
      code: string;
      safeMessage: string;
    }
  | { kind: "checkpoint"; sequenceNumber: number };

function normalizeFunctionCall(
  item: ResponseFunctionToolCall,
): NormalizedFunctionCall {
  return {
    callId: item.call_id,
    name: item.name,
    argumentsJson: item.arguments,
  };
}

function functionCallsFromResponse(response: Response): NormalizedFunctionCall[] {
  return response.output
    .filter((item): item is ResponseFunctionToolCall => item.type === "function_call")
    .map(normalizeFunctionCall);
}

function safeProviderFailure(response: Response): {
  code: string;
  safeMessage: string;
} {
  if (response.error !== null) {
    return {
      code: response.error.code || "openai_response_failed",
      safeMessage: "OpenAI could not complete this research response.",
    };
  }
  if (response.incomplete_details !== null) {
    return {
      code: "openai_response_incomplete",
      safeMessage: "OpenAI ended the research response before it completed.",
    };
  }
  return {
    code: "openai_response_failed",
    safeMessage: "OpenAI could not complete this research response.",
  };
}

export function normalizeOpenAIStreamEvent(
  event: ResponseStreamEvent,
): NormalizedOpenAIEvent {
  switch (event.type) {
    case "response.created":
      return {
        kind: "response_created",
        sequenceNumber: event.sequence_number,
        responseId: event.response.id,
      };
    case "response.output_text.delta":
      return {
        kind: "assistant_delta",
        sequenceNumber: event.sequence_number,
        delta: event.delta,
      };
    case "response.reasoning_summary_text.delta":
      return {
        kind: "reasoning_summary_delta",
        sequenceNumber: event.sequence_number,
        delta: event.delta,
      };
    case "response.output_item.done":
      if (event.item.type === "function_call") {
        return {
          kind: "tool_call",
          sequenceNumber: event.sequence_number,
          functionCall: normalizeFunctionCall(event.item),
        };
      }
      return { kind: "checkpoint", sequenceNumber: event.sequence_number };
    case "response.completed": {
      const messages = event.response.output.filter(
        (item) => item.type === "message",
      );
      let finalMessage = messages[messages.length - 1];
      for (const message of messages) {
        if (message.phase === "final_answer") finalMessage = message;
      }
      return {
        kind: "completed",
        sequenceNumber: event.sequence_number,
        finalText: event.response.output_text,
        assistantItemId: finalMessage?.id,
        functionCalls: functionCallsFromResponse(event.response),
      };
    }
    case "response.failed": {
      const failure = safeProviderFailure(event.response);
      return {
        kind: "failed",
        sequenceNumber: event.sequence_number,
        ...failure,
      };
    }
    case "response.incomplete": {
      const failure = safeProviderFailure(event.response);
      return {
        kind: "failed",
        sequenceNumber: event.sequence_number,
        ...failure,
      };
    }
    case "error":
      return {
        kind: "failed",
        sequenceNumber: event.sequence_number,
        code: event.code || "openai_stream_error",
        safeMessage: "The OpenAI response stream reported an error.",
      };
    default:
      return { kind: "checkpoint", sequenceNumber: event.sequence_number };
  }
}
