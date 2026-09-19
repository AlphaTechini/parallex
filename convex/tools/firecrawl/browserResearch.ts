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
    const checked = await assertPublicUrl(context.args.startUrl as string);
    const goal = normalizeGoal(context.args.goal as string);
    await assertPublicUrlsInText(goal);
    await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
    const client = getFirecrawlClient();
    const initial = await client.scrape(checked.url.toString(), { formats: ["markdown"] });
    scrapeId = textValue(asProviderDocument(initial).metadata?.scrapeId, 500);
    if (!scrapeId) throw new Error("FIRECRAWL_BROWSER_SESSION_MISSING");
    await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
    const response = await client.interact(scrapeId, {
      prompt: `Perform a bounded public workflow with no more than ${Number(context.args.maxSteps)} actions. Do not authenticate, submit sensitive data, or access a private account. ${goal}`,
      timeout: Math.min(300, Math.max(10, Number(context.args.maxSteps) * 10)),
    });
    const interaction = asProviderDocument(response);
    const source = documentSource(
      asProviderDocument(initial),
      checked.url.toString(),
      "web",
      "firecrawl_browser_research",
    );
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_browser_research",
      {
        startUrl: checked.url.toString(),
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
