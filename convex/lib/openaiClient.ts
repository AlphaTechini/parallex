import OpenAI from "openai";

const OPENAI_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;

export function openAIResponseCreationIdempotencyKey(intentId: string): string {
  return `parallex-response-${intentId}`;
}

export function createOpenAIClient(apiKey: string): OpenAI {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) {
    throw new Error("OPENAI_KEY_EMPTY");
  }

  return new OpenAI({
    apiKey: normalizedKey,
    maxRetries: 0,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
  });
}
