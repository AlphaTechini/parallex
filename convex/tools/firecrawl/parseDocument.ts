"use node";

import { assertPublicUrl, getFirecrawlClient } from "../../lib/firecrawlClient";
import type { SourceInput } from "../../sources";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  asProviderDocument,
  assertDocumentTargetStatus,
  documentEvidence,
  documentSource,
  persistAndBuildImmediateResult,
  providerErrorResult,
  sourceTypeForUrl,
  textValue,
} from "./shared";
import { makeFunctionReference } from "convex/server";

const markParsing = makeFunctionReference<"mutation">(
  "firecrawlJobs:markAttachmentParsing",
);
const markParsed = makeFunctionReference<"mutation">(
  "firecrawlJobs:markAttachmentParsed",
);
const markFailed = makeFunctionReference<"mutation">(
  "firecrawlJobs:markAttachmentFailed",
);

function pageEvidence(document: Record<string, unknown>): string | undefined {
  const pages = document.pages;
  if (!Array.isArray(pages)) return undefined;
  const parts = pages.slice(0, 100).flatMap((page) => {
    if (typeof page !== "object" || page === null) return [];
    const record = page as Record<string, unknown>;
    const pageNumber = typeof record.pageNumber === "number" ? record.pageNumber : undefined;
    const markdown = textValue(record.markdown, 1_500);
    return markdown ? [`[Page ${pageNumber ?? "?"}]\n${markdown}`] : [];
  });
  return parts.length > 0 ? parts.join("\n\n").slice(0, 6_000) : undefined;
}

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  const attachmentId = context.args.attachmentId;
  let attachment: (typeof context.attachments)[number] | undefined;
  try {
    const url = context.args.url as string | null;
    if (typeof url === "string") {
      const checked = await assertPublicUrl(url);
      const document = await getFirecrawlClient().scrape(checked.url.toString(), {
        formats: [
          "markdown",
          ...(context.args.perPage === true || context.args.includeLayout === true
            ? [{ type: "json", prompt: "Preserve page attribution when available." }]
            : []),
        ] as never,
        parsers:
          context.args.ocr === true
            ? [{ type: "pdf", mode: "ocr" }]
            : context.args.perPage === true || context.args.includeLayout === true
              ? [{ type: "pdf", mode: "auto" }]
              : undefined,
      });
      const providerDocument = asProviderDocument(document);
      assertDocumentTargetStatus(providerDocument);
      const source = documentSource(
        providerDocument,
        checked.url.toString(),
        sourceTypeForUrl(checked.url.toString()),
        "firecrawl_parse_document",
      );
      const result = await persistAndBuildImmediateResult(
        context,
        "firecrawl_parse_document",
        {
          document: providerDocument,
          pageAttribution: pageEvidence(providerDocument as Record<string, unknown>),
        },
        source === undefined ? [] : [source],
      );
      return result;
    }

    if (typeof attachmentId !== "string") throw new Error("ATTACHMENT_NOT_AVAILABLE");
    attachment = context.attachments.find((candidate) => candidate.id === attachmentId);
    if (attachment === undefined) throw new Error("ATTACHMENT_NOT_AVAILABLE");
    await context.ctx.runMutation(markParsing, {
      toolCallId: context.toolCallId,
      attachmentId: attachment.id,
    });
    const blob = await context.ctx.storage.get(attachment.storageId);
    if (blob === null) throw new Error("ATTACHMENT_STORAGE_MISSING");
    const bytes = Buffer.from(await blob.arrayBuffer());
    const document = await getFirecrawlClient().parse(
      {
        data: bytes,
        filename: attachment.fileName,
        contentType: attachment.mimeType,
      },
      {
        formats: ["markdown"],
        parsers:
          context.args.ocr === true
            ? ([{ type: "pdf", mode: "ocr", pages: context.args.perPage === true, blocks: context.args.includeLayout === true }] as never)
            : context.args.perPage === true || context.args.includeLayout === true
              ? ([{ type: "pdf", mode: "auto", pages: true, blocks: context.args.includeLayout === true }] as never)
              : undefined,
      },
    );
    const providerDocument = asProviderDocument(document);
    assertDocumentTargetStatus(providerDocument);
    const attachmentUrl = `attachment://${attachment.id}/${encodeURIComponent(attachment.fileName)}`;
    const evidence = pageEvidence(providerDocument as Record<string, unknown>) ?? documentEvidence(providerDocument);
    const source: SourceInput = {
      canonicalUrl: attachmentUrl,
      title: attachment.fileName,
      description: `User-provided ${attachment.mimeType}`,
      sourceType: attachment.mimeType === "application/pdf" ? "pdf" : "document",
      excerpt: evidence,
      citationLabel: attachment.fileName,
    };
    const result = await persistAndBuildImmediateResult(
      context,
      "firecrawl_parse_document",
      {
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        document: providerDocument,
        pageAttribution: evidence,
      },
      [source],
    );
    await context.ctx.runMutation(markParsed, {
      toolCallId: context.toolCallId,
      attachmentId: attachment.id,
      firecrawlDocumentId: textValue(providerDocument.metadata?.scrapeId, 500),
    });
    return result;
  } catch (error) {
    if (attachment !== undefined) {
      try {
        await context.ctx.runMutation(markFailed, {
          toolCallId: context.toolCallId,
          attachmentId: attachment.id,
        });
      } catch {
        // Preserve the provider failure without exposing an internal update error.
      }
    }
    return providerErrorResult(error);
  }
}
