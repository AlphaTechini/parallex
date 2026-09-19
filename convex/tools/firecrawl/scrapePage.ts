"use node";

import { assertPublicUrl, getFirecrawlClient, toProviderFormats } from "../../lib/firecrawlClient";
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
    const document = await getFirecrawlClient().scrape(checked.url.toString(), {
      formats: toProviderFormats(context.args.formats),
      onlyMainContent: context.args.onlyMainContent as boolean | null ?? undefined,
      maxAge: context.args.maxAgeMs as number | null ?? undefined,
    });
    const source = documentSource(
      asProviderDocument(document),
      checked.url.toString(),
      "pdf" === (document.metadata?.contentType as string | undefined)?.split(";", 1)[0]
        ? "pdf"
        : "web",
      "firecrawl_scrape_page",
    );
    const payload = {
      url: checked.url.toString(),
      document: asProviderDocument(document),
    };
    const sources = source === undefined ? [] : [source];
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_scrape_page",
      payload,
      sources,
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
