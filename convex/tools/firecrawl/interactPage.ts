"use node";

import { makeFunctionReference } from "convex/server";

import {
  assertPublicUrl,
  assertPublicUrlsInText,
  getFirecrawlClient,
  normalizeGoal,
} from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  asProviderDocument,
  documentSource,
  persistAndBuildImmediateResult,
  providerErrorResult,
  textValue,
} from "./shared";

const assertLive = makeFunctionReference<"mutation">("firecrawlJobs:assertToolCallLive");

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  let scrapeId: string | undefined;
  try {
    const checked = await assertPublicUrl(context.args.url as string);
    const goal = normalizeGoal(context.args.goal as string);
    await assertPublicUrlsInText(goal);
    await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
    const client = getFirecrawlClient();
    const initial = await client.scrape(checked.url.toString(), { formats: ["markdown"] });
    scrapeId = textValue(asProviderDocument(initial).metadata?.scrapeId, 500);
    if (!scrapeId) throw new Error("FIRECRAWL_INTERACTION_SESSION_MISSING");
    await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
    const response = await client.interact(scrapeId, {
      prompt: `Perform no more than ${Number(context.args.maxSteps)} public, non-sensitive actions. ${goal}`,
      timeout: Math.min(300, Math.max(10, Number(context.args.maxSteps) * 10)),
    });
    const interaction = asProviderDocument(response);
    const source = documentSource(
      asProviderDocument(initial),
      checked.url.toString(),
      "web",
      "firecrawl_interact_page",
    );
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_interact_page",
      {
        url: checked.url.toString(),
        output: textValue(interaction.output ?? interaction.result ?? interaction.stdout, 12_000),
      },
      source === undefined ? [] : [source],
    );
  } catch (error) {
    return providerErrorResult(error);
  } finally {
    if (scrapeId !== undefined) {
      try {
        await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
        await getFirecrawlClient().stopInteraction(scrapeId);
      } catch {
        // Session cleanup is best effort after the ownership guard.
      }
    }
  }
}
