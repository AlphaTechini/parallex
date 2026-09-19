"use node";

import { assertPublicUrl, getFirecrawlClient } from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  asProviderDocument,
  documentSource,
  persistAndBuildImmediateResult,
  providerErrorResult,
} from "./shared";

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const checked = await assertPublicUrl(context.args.url as string);
    const mode = context.args.mode as "question" | "highlights";
    const format = mode === "question"
      ? { type: "question", question: context.args.question as string }
      : { type: "highlights", query: context.args.question as string };
    const document = await getFirecrawlClient().scrape(checked.url.toString(), {
      formats: [format] as never,
    });
    const providerDocument = asProviderDocument(document);
    const source = documentSource(
      providerDocument,
      checked.url.toString(),
      "web",
      "firecrawl_query_page",
    );
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_query_page",
      { answer: providerDocument.answer ?? providerDocument.highlights ?? null },
      source === undefined ? [] : [source],
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
