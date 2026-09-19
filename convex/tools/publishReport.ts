"use node";

import { makeFunctionReference } from "convex/server";
import { sha256Hex } from "../lib/normalize";
import { renderReportPdf } from "../../reportRenderer";
import type { ExecutorResult, ToolExecutionContext } from "./types";
import { sanitizeReportMarkdown } from "../reports";
import type { Doc, Id } from "../_generated/dataModel";

type BeginPublishResult = {
  report: Doc<"reports">;
  artifacts: Array<{
    format: "markdown" | "pdf";
    fileName: string;
    sizeBytes: number;
  }>;
  allowedUrls: string[];
};

const beginPublish = makeFunctionReference<
  "mutation",
  { toolCallId: ToolExecutionContext["toolCallId"]; title: string; summary: string },
  BeginPublishResult
>("reports:beginPublish");
const storeMarkdown = makeFunctionReference<"mutation">("reports:storeMarkdownArtifact");
const storePdf = makeFunctionReference<"mutation">("reports:storePdfArtifact");
const markPartial = makeFunctionReference<"mutation">("reports:markPartial");
const markFailed = makeFunctionReference<"mutation">("reports:markFailed");
const markSourcesUsed = makeFunctionReference<"mutation">("sources:markSourcesUsed");
const assertLive = makeFunctionReference<"mutation">("firecrawlJobs:assertToolCallLive");

function fileStem(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "research-report";
}

function artifactSummary(artifacts: Array<{ format: "markdown" | "pdf"; fileName: string; sizeBytes: number }>) {
  return artifacts.map((artifact) => ({
    format: artifact.format,
    fileName: artifact.fileName,
    sizeBytes: artifact.sizeBytes,
  }));
}

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const owned = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(owned).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  let reportId: string | undefined;
  try {
    const started = await context.ctx.runMutation(beginPublish, {
      toolCallId: context.toolCallId,
      title: context.args.title as string,
      summary: context.args.summary as string,
    });
    reportId = started.report._id as string;
    if (started.report.status === "ready" || started.report.status === "partial") {
      return {
        kind: "immediate",
        outputJson: JSON.stringify({
          ok: true,
          reportId,
          status: started.report.status,
          artifacts: artifactSummary(started.artifacts),
        }),
      };
    }

    const allowedUrls = new Set(started.allowedUrls);
    const markdown = sanitizeReportMarkdown(
      context.args.markdownContent as string,
      allowedUrls,
    ).slice(0, 500_000);
    if (!markdown.trim()) throw new Error("EMPTY_REPORT");

    await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
    const markdownBytes = new TextEncoder().encode(markdown);
    const markdownStorageId = await context.ctx.storage.store(
      new Blob([markdownBytes], { type: "text/markdown" }),
    );
    const markdownHash = await sha256Hex(markdown);
    const stem = fileStem(context.args.title as string);
    const markdownResult = await context.ctx.runMutation(storeMarkdown, {
      toolCallId: context.toolCallId,
      reportId: reportId as Id<"reports">,
      storageId: markdownStorageId,
      fileName: `${stem}.md`,
      sizeBytes: markdownBytes.byteLength,
      contentHash: markdownHash,
    });
    if (markdownResult.previousStorageId !== undefined && markdownResult.previousStorageId !== markdownStorageId) {
      await context.ctx.storage.delete(markdownResult.previousStorageId);
    }

    const usedUrls = started.allowedUrls.filter((url) => markdown.includes(url));
    if (usedUrls.length > 0) {
      await context.ctx.runMutation(markSourcesUsed, {
        runId: context.run._id,
        canonicalUrls: usedUrls,
      });
    }

    let pdfSize = 0;
    let pdfFileName: string | undefined;
    try {
      await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
      const pdfBytes = await renderReportPdf({
        title: context.args.title as string,
        summary: context.args.summary as string,
        markdown,
      });
      pdfSize = pdfBytes.byteLength;
      pdfFileName = `${stem}.pdf`;
      const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfBuffer).set(pdfBytes);
      const pdfStorageId = await context.ctx.storage.store(
        new Blob([pdfBuffer], { type: "application/pdf" }),
      );
      const pdfHash = await sha256BytesHex(pdfBytes);
      const pdfResult = await context.ctx.runMutation(storePdf, {
        toolCallId: context.toolCallId,
        reportId: reportId as Id<"reports">,
        storageId: pdfStorageId,
        fileName: pdfFileName,
        sizeBytes: pdfBytes.byteLength,
        contentHash: pdfHash,
      });
      if (pdfResult.previousStorageId !== undefined && pdfResult.previousStorageId !== pdfStorageId) {
        await context.ctx.storage.delete(pdfResult.previousStorageId);
      }
      return {
        kind: "immediate",
        outputJson: JSON.stringify({
          ok: true,
          reportId,
          status: "ready",
          artifacts: [
            { format: "markdown", fileName: `${stem}.md`, sizeBytes: markdownBytes.byteLength },
            { format: "pdf", fileName: pdfFileName, sizeBytes: pdfSize },
          ],
        }),
      };
    } catch {
      await context.ctx.runMutation(markPartial, {
        toolCallId: context.toolCallId,
        reportId: reportId as Id<"reports">,
      });
      return {
        kind: "immediate",
        outputJson: JSON.stringify({
          ok: true,
          reportId,
          status: "partial",
          artifacts: [{ format: "markdown", fileName: `${stem}.md`, sizeBytes: markdownBytes.byteLength }],
          warning: "The Markdown report is ready, but PDF rendering was not available.",
        }),
      };
    }
  } catch {
    if (reportId !== undefined) {
      try {
        await context.ctx.runMutation(markFailed, {
          toolCallId: context.toolCallId,
          reportId: reportId as Id<"reports">,
        });
      } catch {
        return {
          kind: "failed",
          code: "report_failed",
          retryable: true,
          safeMessage: "The research report could not be stored safely.",
        };
      }
    }
    return {
      kind: "failed",
      code: "report_failed",
      retryable: false,
      safeMessage: "The research report could not be stored safely.",
    };
  }
}
