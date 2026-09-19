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
    const tag = context.args.tag as string | null;
    const document = await getFirecrawlClient().scrape(checked.url.toString(), {
      formats: [
        "markdown",
        {
          type: "changeTracking",
          modes: ["git-diff"],
          tag: tag ?? undefined,
        },
      ] as never,
    });
    const providerDocument = asProviderDocument(document);
    const source = documentSource(
      providerDocument,
      checked.url.toString(),
      "web",
      "firecrawl_compare_page_change",
    );
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_compare_page_change",
      {
        url: checked.url.toString(),
        changed: providerDocument.changeTracking ?? null,
        content: context.args.includeFullContent === true ? providerDocument.markdown ?? null : undefined,
      },
      source === undefined ? [] : [source],
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
