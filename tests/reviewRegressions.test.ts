import { describe, expect, it } from "vitest";

import { validJobDocuments } from "../convex/firecrawlJobPoller";
import {
  hasFetchedDocumentEvidence,
  normalizeSearchEntries,
} from "../convex/tools/firecrawl/shared";
import { canRepeatTableHeader } from "../reportRenderer";

describe("integration review regressions", () => {
  it("does not repeat a table header that leaves no room for a body row", () => {
    expect(canRepeatTableHeader(2)).toBe(true);
    expect(canRepeatTableHeader(100)).toBe(false);
  });

  it("preserves original indexes when failed batch documents are removed", () => {
    const result = validJobDocuments([
      { statusCode: 500, markdown: "failed" },
      { statusCode: 200, markdown: "first valid document" },
      { statusCode: 404, markdown: "missing" },
      { statusCode: 200, markdown: "second valid document" },
    ]);

    expect(result.rejectedCount).toBe(2);
    expect(result.documents.map((entry) => entry.originalIndex)).toEqual([1, 3]);
  });

  it("requires substantive fetched content before search evidence is complete", () => {
    expect(hasFetchedDocumentEvidence({ markdown: "", html: "  ", json: {} })).toBe(false);
    expect(hasFetchedDocumentEvidence({ markdown: "Fetched primary-source evidence" })).toBe(true);
    expect(hasFetchedDocumentEvidence({ json: { finding: "Structured evidence" } })).toBe(true);
  });

  it("keeps successful search entries when another target returns an error", () => {
    const result = normalizeSearchEntries(
      [
        { url: "https://failed.example", statusCode: 500, markdown: "failed" },
        { url: "https://valid.example", statusCode: 200, markdown: "valid evidence" },
      ],
      "web",
      "firecrawl_search_web",
    );

    expect(result.rejectedCount).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.canonicalUrl).toBe("https://valid.example/");
  });
});
