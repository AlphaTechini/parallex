"use node";

import { assertPublicUrlsInText, getFirecrawlClient, normalizeGoal } from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import { startAsyncJob, providerErrorResult } from "./shared";

function parseOptionalSchema(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("INVALID_AGENT_SCHEMA");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("INVALID_AGENT_SCHEMA");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("INVALID_AGENT_SCHEMA");
  }
  return parsed as Record<string, unknown>;
}

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const goal = normalizeGoal(context.args.goal as string);
    await assertPublicUrlsInText(goal);
    const started = await getFirecrawlClient().startAgent({
      prompt: goal,
      schema: parseOptionalSchema(context.args.outputSchemaJson),
      maxCredits: context.args.maxCredits as number | null ?? undefined,
      strictConstrainToURLs: false,
    });
    return await startAsyncJob(context, "firecrawl_agent_gather", started.id);
  } catch (error) {
    return providerErrorResult(error);
  }
}
