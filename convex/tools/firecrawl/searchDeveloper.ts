"use node";

import { getFirecrawlClient } from "../../lib/firecrawlClient";
import type { SourceInput } from "../../sources";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  normalizeSearchEntry,
  persistAndBuildImmediateResult,
  providerErrorResult,
} from "./shared";

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const result = await getFirecrawlClient().search(context.args.query as string, {
      categories: ["developer"],
      limit: Number(context.args.limit ?? 10),
    });
    const entries = [
      ...(result.developer ?? []),
      ...(result.web ?? []).filter((entry) => (entry as { category?: string }).category === "developer"),
    ].slice(0, 20);
    const sourceType: SourceInput["sourceType"] = "developer";
    const sources = entries
      .map((entry) => normalizeSearchEntry(entry, sourceType, "firecrawl_search_developer"))
      .filter((source): source is NonNullable<typeof source> => source !== undefined);
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_search_developer",
      { results: entries },
      sources,
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
