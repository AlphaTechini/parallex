"use node";

import { getFirecrawlClient, assertPublicDomain, toSearchTimeRange } from "../../lib/firecrawlClient";
import type { SourceInput } from "../../sources";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  normalizeSearchEntries,
  persistAndBuildImmediateResult,
  providerErrorResult,
  textValue,
} from "./shared";

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  const query = String(context.args.query).trim();
  const sources = context.args.sources as string[] | null;
  const includeDomains = context.args.includeDomains as string[] | null;
  const excludeDomains = context.args.excludeDomains as string[] | null;
  try {
    for (const domain of includeDomains ?? []) assertPublicDomain(domain);
    for (const domain of excludeDomains ?? []) assertPublicDomain(domain);
    const client = getFirecrawlClient();
    const request: Record<string, unknown> = {
      sources: sources ?? ["web"],
      limit: context.args.limit ?? 10,
      includeDomains: includeDomains ?? undefined,
      excludeDomains: excludeDomains ?? undefined,
      location: textValue(context.args.location, 200),
      country: context.args.country ?? undefined,
      tbs: toSearchTimeRange(context.args.timeRange as string | null),
    };
    if (context.args.scrapeResults === true) {
      request.scrapeOptions = { formats: ["markdown"], onlyMainContent: true };
    }
    const result = await client.search(query, request as never);
    const sourceRecords: SourceInput[] = [];
    const resultGroups: Record<string, unknown[]> = {};
    let rejectedCount = 0;
    let candidateCount = 0;
    for (const group of ["web", "news", "images"] as const) {
      const entries = Array.isArray(result[group]) ? result[group] : [];
      const candidates = entries.slice(0, 20);
      candidateCount += candidates.length;
      const sourceType: SourceInput["sourceType"] =
        group === "news" ? "news" : group === "images" ? "image" : "web";
      const normalized = normalizeSearchEntries(candidates, sourceType, "firecrawl_search_web");
      resultGroups[group] = normalized.entries;
      sourceRecords.push(...normalized.sources);
      rejectedCount += normalized.rejectedCount;
    }
    if (candidateCount > 0 && sourceRecords.length === 0 && rejectedCount > 0) {
      throw new Error("FIRECRAWL_TARGET_STATUS_INVALID");
    }
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_search_web",
      { results: resultGroups, rejectedDocuments: rejectedCount },
      sourceRecords,
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
