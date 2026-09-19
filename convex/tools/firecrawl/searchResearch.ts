"use node";

import { getFirecrawlClient, assertPublicUrlShape } from "../../lib/firecrawlClient";
import { canonicalizeUrl } from "../../lib/normalize";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  asProviderDocument,
  documentSource,
  persistAndBuildImmediateResult,
  providerErrorResult,
  textValue,
} from "./shared";

function paperUrl(value: Record<string, unknown>): string | undefined {
  const primaryId = textValue(value.primaryId, 500);
  if (primaryId?.startsWith("http")) return primaryId;
  const ids = value.ids;
  if (typeof ids !== "object" || ids === null || Array.isArray(ids)) return undefined;
  const mapped = ids as Record<string, unknown>;
  for (const key of ["doi", "arxiv", "pmid", "pmcid"]) {
    const entry = Array.isArray(mapped[key]) ? mapped[key][0] : undefined;
    if (typeof entry !== "string" || !entry.trim()) continue;
    if (key === "doi") return `https://doi.org/${entry.trim()}`;
    if (key === "arxiv") return `https://arxiv.org/abs/${entry.trim()}`;
    if (key === "pmid") return `https://pubmed.ncbi.nlm.nih.gov/${entry.trim()}/`;
    return `https://www.ncbi.nlm.nih.gov/pmc/articles/${entry.trim()}/`;
  }
  return undefined;
}

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const client = getFirecrawlClient();
    const mode = context.args.mode as "academic" | "index" | "auto" | null;
    const limit = Number(context.args.limit ?? 10);
    if (mode === "academic") {
      const result = await client.search(context.args.query as string, {
        categories: ["research"],
        limit,
      });
      const sources = (result.web ?? [])
        .slice(0, 20)
        .map((entry) =>
          documentSource(
            asProviderDocument(entry),
            textValue(asProviderDocument(entry).url, 2_048),
            "research",
            "firecrawl_search_research",
          ),
        )
        .filter((source): source is NonNullable<typeof source> => source !== undefined);
      return await persistAndBuildImmediateResult(
        context,
        "firecrawl_search_research",
        { mode: "academic", results: (result.web ?? []).slice(0, 20) },
        sources,
      );
    }

    const result = await client.research.searchPapers(context.args.query as string, {
      k: limit,
      from: context.args.publishedAfter as string | null ?? undefined,
      to: context.args.publishedBefore as string | null ?? undefined,
    });
    const sources = result.results
      .slice(0, 20)
      .map((paper) => {
        const record = paper as unknown as Record<string, unknown>;
        const url = paperUrl(record);
        if (!url) return undefined;
        try {
          const canonicalUrl = canonicalizeUrl(assertPublicUrlShape(url).toString());
          return {
            canonicalUrl,
            title: textValue(record.title, 500),
            description: textValue(record.abstract, 1_000),
            sourceType: "research" as const,
            excerpt: textValue(record.abstract, 6_000),
            evidence: textValue(record.abstract, 6_000),
            citationLabel: textValue(record.title, 300),
            evidenceCompleteness: "incomplete" as const,
            retrievedAt: Date.now(),
          };
        } catch {
          return undefined;
        }
      })
      .filter((source): source is NonNullable<typeof source> => source !== undefined);
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_search_research",
      { mode: mode ?? "index", results: result.results.slice(0, 20) },
      sources,
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
