"use node";

import { assertPublicUrl, getFirecrawlClient } from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  normalizeSearchEntry,
  persistAndBuildImmediateResult,
  providerErrorResult,
} from "./shared";

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const checked = await assertPublicUrl(context.args.url as string);
    const map = await getFirecrawlClient().map(checked.url.toString(), {
      search: context.args.search as string | null ?? undefined,
      limit: Number(context.args.limit ?? 50),
      includeSubdomains: context.args.includeSubdomains as boolean | null ?? undefined,
    });
    const links = map.links.slice(0, 100);
    const sources = links
      .map((entry) => normalizeSearchEntry(entry, "web", "firecrawl_map_site"))
      .filter((source): source is NonNullable<typeof source> => source !== undefined);
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_map_site",
      { rootUrl: checked.url.toString(), links },
      sources,
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
