"use node";

import { assertPublicUrl, getFirecrawlClient } from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  asProviderDocument,
  documentSource,
  persistAndBuildImmediateResult,
  providerErrorResult,
  textValue,
} from "./shared";

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  try {
    const checked = await assertPublicUrl(context.args.url as string);
    const mediaType = context.args.mediaType as "audio" | "video";
    const document = await getFirecrawlClient().scrape(checked.url.toString(), {
      formats: [mediaType, "markdown"] as never,
    });
    const providerDocument = asProviderDocument(document);
    const source = documentSource(
      providerDocument,
      checked.url.toString(),
      mediaType === "video" ? "video" : "other",
      "firecrawl_extract_media",
    );
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_extract_media",
      {
        url: checked.url.toString(),
        mediaType,
        mediaUrl: textValue(providerDocument[mediaType], 2_048),
        pageText: textValue(providerDocument.markdown, 6_000),
      },
      source === undefined ? [] : [source],
    );
  } catch (error) {
    return providerErrorResult(error);
  }
}
