"use node";

import { getFirecrawlClient } from "../../lib/firecrawlClient";
import type { SourceInput } from "../../sources";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  normalizeSearchEntries,
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
    const normalized = normalizeSearchEntries(
      entries,
      sourceType,
      "firecrawl_search_developer",
    );
    if (entries.length > 0 && normalized.sources.length === 0 && normalized.rejectedCount > 0) {
      throw new Error("FIRECRAWL_TARGET_STATUS_INVALID");
    }
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_search_developer",
      { results: normalized.entries, rejectedDocuments: normalized.rejectedCount },
      normalized.sources,
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
