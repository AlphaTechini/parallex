"use node";

import { getFirecrawlClient, assertPublicDomain, toSearchTimeRange } from "../../lib/firecrawlClient";
import type { SourceInput } from "../../sources";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  normalizeSearchEntry,
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
    const sourceRecords: Array<ReturnType<typeof normalizeSearchEntry>> = [];
    const resultGroups: Record<string, unknown[]> = {};
    for (const group of ["web", "news", "images"] as const) {
      const entries = Array.isArray(result[group]) ? result[group] : [];
      resultGroups[group] = entries.slice(0, 20);
      const sourceType: SourceInput["sourceType"] =
        group === "news" ? "news" : group === "images" ? "image" : "web";
      for (const entry of entries.slice(0, 20)) {
        sourceRecords.push(normalizeSearchEntry(entry, sourceType, "firecrawl_search_web"));
      }
    }
    const normalized = sourceRecords.filter((source): source is NonNullable<typeof source> => source !== undefined);
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_search_web",
      { results: resultGroups },
      normalized,
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
