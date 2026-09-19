"use node";

import { assertPublicUrl, getFirecrawlClient } from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import { startAsyncJob, persistAndBuildImmediateResult, providerErrorResult, asProviderDocument, documentSource } from "./shared";

function parseSchema(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") throw new Error("INVALID_EXTRACTION_SCHEMA");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("INVALID_EXTRACTION_SCHEMA");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("INVALID_EXTRACTION_SCHEMA");
  }
  return parsed as Record<string, unknown>;
}

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const urls = context.args.urls as string[];
    const checked = await Promise.all(urls.map((url) => assertPublicUrl(url)));
    const schema = parseSchema(context.args.jsonSchemaJson);
    const prompt = context.args.extractionPrompt as string;
    if (checked.length > 1) {
      const started = await getFirecrawlClient().startBatchScrape(
        checked.map((entry) => entry.url.toString()),
        {
          options: {
            formats: [{ type: "json", prompt, schema }] as never,
          },
          idempotencyKey: `parallex-${context.toolCallId}`,
        },
      );
      return await startAsyncJob(context, "firecrawl_extract_structured", started.id);
    }
    const document = await getFirecrawlClient().scrape(checked[0].url.toString(), {
      formats: [{ type: "json", prompt, schema }] as never,
    });
    const providerDocument = asProviderDocument(document);
    const source = documentSource(
      providerDocument,
      checked[0].url.toString(),
      "web",
      "firecrawl_extract_structured",
    );
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_extract_structured",
      { rows: providerDocument.json ?? null, url: checked[0].url.toString() },
      source === undefined ? [] : [source],
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
