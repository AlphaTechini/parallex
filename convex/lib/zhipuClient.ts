import OpenAI from "openai";

const ZHIPU_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;

export function createZhipuClient(apiKey: string): OpenAI {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey) throw new Error("ZHIPU_KEY_EMPTY");

  const baseURL = process.env.ZHIPU_CODING_BASE_URL?.trim();
  if (!baseURL) throw new Error("ZHIPU_CODING_BASE_URL_MISSING");
  const parsed = new URL(baseURL);
  if (parsed.protocol !== "https:") {
    throw new Error("ZHIPU_CODING_BASE_URL_INVALID");
  }

  return new OpenAI({
    apiKey: normalizedKey,
    baseURL: parsed.toString().replace(/\/$/, ""),
    maxRetries: 0,
    timeout: ZHIPU_REQUEST_TIMEOUT_MS,
  });
}
