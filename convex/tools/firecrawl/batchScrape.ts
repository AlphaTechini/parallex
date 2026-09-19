"use node";

import { assertPublicUrl, getFirecrawlClient, toProviderFormats } from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import { startAsyncJob, providerErrorResult } from "./shared";

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const urls = context.args.urls as string[];
    const checked = await Promise.all(urls.map((url) => assertPublicUrl(url)));
    const started = await getFirecrawlClient().startBatchScrape(
      checked.map((entry) => entry.url.toString()),
      {
        options: {
          formats: toProviderFormats(context.args.formats),
          onlyMainContent: context.args.onlyMainContent as boolean | null ?? undefined,
          maxAge: context.args.maxAgeMs as number | null ?? undefined,
        },
        idempotencyKey: `parallex-${context.toolCallId}`,
      },
    );
    return await startAsyncJob(context, "firecrawl_batch_scrape", started.id);
  } catch (error) {
    return providerErrorResult(error);
  }
}
