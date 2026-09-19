"use node";

import { assertPublicUrl, getFirecrawlClient, toProviderFormats } from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import { startAsyncJob, providerErrorResult } from "./shared";

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const checked = await assertPublicUrl(context.args.url as string);
    const started = await getFirecrawlClient().startCrawl(checked.url.toString(), {
      limit: Number(context.args.limit),
      maxDiscoveryDepth: Number(context.args.maxDepth),
      includePaths: context.args.includePaths as string[] | null ?? undefined,
      excludePaths: context.args.excludePaths as string[] | null ?? undefined,
      allowSubdomains: context.args.includeSubdomains as boolean | null ?? undefined,
      allowExternalLinks: context.args.allowExternalLinks as boolean | null ?? undefined,
      scrapeOptions: { formats: toProviderFormats(context.args.formats) },
    });
    return await startAsyncJob(context, "firecrawl_crawl_site", started.id);
  } catch (error) {
    return providerErrorResult(error);
  }
}
