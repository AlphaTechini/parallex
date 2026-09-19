import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
} from "./_generated/server";
import { canonicalizeUrl, sha256Hex } from "./lib/normalize";
import { getAuthenticatedUserId, requireOwnedReport, requireOwnedRun } from "./lib/authHelpers";
import { v } from "convex/values";

const reportFormatValidator = v.union(v.literal("markdown"), v.literal("pdf"));
const MAX_TITLE = 300;
const MAX_SUMMARY = 5_000;
const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);

type ReportGraph = {
  call: Doc<"toolCalls">;
  run: Doc<"researchRuns">;
  chat: Doc<"chats">;
  bot: Doc<"bots">;
};

async function reportGraph(
  ctx: MutationCtx,
  toolCallId: Id<"toolCalls">,
): Promise<ReportGraph> {
  const call = await ctx.db.get("toolCalls", toolCallId);
  if (call === null || call.functionName !== "publish_report") throw new Error("TOOL_CALL_INVALID");
  const run = await ctx.db.get("researchRuns", call.runId);
  const chat = run === null ? null : await ctx.db.get("chats", run.chatId);
  const bot = run === null ? null : await ctx.db.get("bots", run.botId);
  if (
    run === null ||
    chat === null ||
    bot === null ||
    call.ownerId !== run.ownerId ||
    chat.ownerId !== run.ownerId ||
    bot.ownerId !== run.ownerId ||
    run.chatId !== chat._id ||
    run.botId !== bot._id ||
    chat.botId !== bot._id ||
    chat.status !== "active" ||
    bot.status !== "active" ||
    run.cancelRequested ||
    TERMINAL_RUN_STATUSES.has(run.status) ||
    chat.activeRunId !== run._id ||
    call.status !== "running"
  ) {
    throw new Error("REPORT_CONTEXT_INVALID");
  }
  return { call, run, chat, bot };
}

function bounded(value: string, max: number): string {
  return value.replace(/\u0000/g, "").trim().slice(0, max);
}

export function sanitizeReportMarkdown(markdown: string, allowedUrls: Set<string>): string {
  const withoutHtml = markdown.replace(/<\/?[a-z][^>]*>/gi, "");
  const sanitizedLinks = withoutHtml.replace(
    /\[([^\]]{0,500})\]\(\s*([^\s)]+)(?:\s+[^)]*)?\s*\)/g,
    (_match, label: string, rawUrl: string) => {
      let normalized: string | undefined;
      try {
        normalized = rawUrl.startsWith("attachment://")
          ? rawUrl
          : canonicalizeUrl(rawUrl);
      } catch {
        normalized = undefined;
      }
      return normalized !== undefined && allowedUrls.has(normalized)
        ? `[${label}](${normalized})`
        : label;
    },
  );
  return sanitizedLinks.replace(/https?:\/\/[^\s<>\])}]+/gi, (rawUrl) => {
    try {
      const normalized = canonicalizeUrl(rawUrl.replace(/[),.;]+$/, ""));
      return allowedUrls.has(normalized) ? normalized : "";
    } catch {
      return "";
    }
  });
}

async function loadSources(ctx: MutationCtx, runId: Id<"researchRuns">) {
  const sources = await ctx.db
    .query("researchSources")
    .withIndex("by_run_retrieved", (q) => q.eq("runId", runId))
    .collect();
  return sources;
}

export const beginPublish = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    title: v.string(),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const graph = await reportGraph(ctx, args.toolCallId);
    const title = bounded(args.title, MAX_TITLE);
    const summary = bounded(args.summary, MAX_SUMMARY);
    if (!title || !summary) throw new Error("INVALID_REPORT_INPUT");
    const existing = await ctx.db
      .query("reports")
      .withIndex("by_run", (q) => q.eq("runId", graph.run._id))
      .first();
    const now = Date.now();
    const reportId =
      existing?._id ??
      (await ctx.db.insert("reports", {
        ownerId: graph.run.ownerId,
        botId: graph.bot._id,
        chatId: graph.chat._id,
        runId: graph.run._id,
        title,
        summary,
        status: "drafting",
        citationStyle: "professional_inline",
        layoutVersion: 1,
        createdAt: now,
        updatedAt: now,
      }));
    if (existing !== null) {
      if (
        existing.ownerId !== graph.run.ownerId ||
        existing.botId !== graph.bot._id ||
        existing.chatId !== graph.chat._id
      ) {
        throw new Error("REPORT_OWNERSHIP_INVALID");
      }
      if (existing.status !== "ready" && existing.status !== "partial") {
        await ctx.db.patch("reports", existing._id, {
          title,
          summary,
          status: "drafting",
          updatedAt: now,
        });
      }
    }
    const report = await ctx.db.get("reports", reportId);
    if (report === null) throw new Error("REPORT_NOT_FOUND");
    const artifacts = await ctx.db
      .query("reportArtifacts")
      .withIndex("by_report_format", (q) => q.eq("reportId", reportId))
      .collect();
    const sources = await loadSources(ctx, graph.run._id);
    return {
      report,
      artifacts: artifacts.filter((artifact) => artifact.deletedAt === undefined),
      allowedUrls: sources.map((source) => source.canonicalUrl),
    };
  },
});

async function storeArtifact(
  ctx: MutationCtx,
  args: {
    toolCallId: Id<"toolCalls">;
    reportId: Id<"reports">;
    format: "markdown" | "pdf";
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    contentHash: string;
  },
) {
  const graph = await reportGraph(ctx, args.toolCallId);
  const report = await ctx.db.get("reports", args.reportId);
  if (
    report === null ||
    report.ownerId !== graph.run.ownerId ||
    report.runId !== graph.run._id ||
    report.chatId !== graph.chat._id ||
    report.botId !== graph.bot._id
  ) {
    throw new Error("REPORT_OWNERSHIP_INVALID");
  }
  if (args.sizeBytes < 1 || args.sizeBytes > 8_000_000) throw new Error("REPORT_ARTIFACT_TOO_LARGE");
  const previous = await ctx.db
    .query("reportArtifacts")
    .withIndex("by_report_format", (q) => q.eq("reportId", args.reportId).eq("format", args.format))
    .first();
  const artifactFields = {
    ownerId: graph.run.ownerId,
    reportId: args.reportId,
    runId: graph.run._id,
    format: args.format,
    storageId: args.storageId,
    fileName: args.fileName.slice(0, 180),
    mimeType: args.mimeType,
    sizeBytes: args.sizeBytes,
    contentHash: args.contentHash,
    accessClass: "private_report" as const,
    createdAt: Date.now(),
    deletedAt: undefined,
  };
  if (previous === null) {
    await ctx.db.insert("reportArtifacts", artifactFields);
  } else {
    if (previous.ownerId !== graph.run.ownerId || previous.runId !== graph.run._id) {
      throw new Error("REPORT_ARTIFACT_OWNERSHIP_INVALID");
    }
    await ctx.db.patch("reportArtifacts", previous._id, artifactFields);
  }
  return { previousStorageId: previous?.storageId };
}

export const storeMarkdownArtifact = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    reportId: v.id("reports"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    sizeBytes: v.number(),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await storeArtifact(ctx, { ...args, format: "markdown", mimeType: "text/markdown" });
    await ctx.db.patch("reports", args.reportId, { status: "rendering", updatedAt: Date.now() });
    return result;
  },
});

export const storePdfArtifact = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    reportId: v.id("reports"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    sizeBytes: v.number(),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    const result = await storeArtifact(ctx, { ...args, format: "pdf", mimeType: "application/pdf" });
    await ctx.db.patch("reports", args.reportId, {
      status: "ready",
      readyAt: Date.now(),
      updatedAt: Date.now(),
    });
    return result;
  },
});

export const markPartial = internalMutation({
  args: { toolCallId: v.id("toolCalls"), reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const graph = await reportGraph(ctx, args.toolCallId);
    const report = await ctx.db.get("reports", args.reportId);
    if (report === null || report.ownerId !== graph.run.ownerId || report.runId !== graph.run._id) {
      throw new Error("REPORT_OWNERSHIP_INVALID");
    }
    await ctx.db.patch("reports", report._id, {
      status: "partial",
      readyAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const markFailed = internalMutation({
  args: { toolCallId: v.id("toolCalls"), reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const graph = await reportGraph(ctx, args.toolCallId);
    const report = await ctx.db.get("reports", args.reportId);
    if (report === null || report.ownerId !== graph.run.ownerId || report.runId !== graph.run._id) {
      throw new Error("REPORT_OWNERSHIP_INVALID");
    }
    await ctx.db.patch("reports", report._id, { status: "failed", updatedAt: Date.now() });
    return { ok: true };
  },
});

export const getReportDeliveryContext = internalQuery({
  args: { reportId: v.id("reports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get("reports", args.reportId);
    if (report === null) throw new Error("REPORT_NOT_FOUND");
    const bot = await ctx.db.get("bots", report.botId);
    const chat = await ctx.db.get("chats", report.chatId);
    const run = await ctx.db.get("researchRuns", report.runId);
    if (
      bot === null ||
      chat === null ||
      run === null ||
      report.ownerId !== bot.ownerId ||
      report.ownerId !== chat.ownerId ||
      report.ownerId !== run.ownerId ||
      run.botId !== bot._id ||
      run.chatId !== chat._id
    ) {
      throw new Error("REPORT_OWNERSHIP_INVALID");
    }
    const artifacts = await ctx.db
      .query("reportArtifacts")
      .withIndex("by_report_format", (q) => q.eq("reportId", report._id))
      .collect();
    return {
      report,
      bot,
      chat,
      run,
      artifacts: artifacts.filter((artifact) => artifact.deletedAt === undefined),
    };
  },
});

export const getReportForRun = query({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    await requireOwnedRun(ctx, ownerId, args.runId);
    const report = await ctx.db
      .query("reports")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .first();
    if (report === null || report.ownerId !== ownerId) return null;
    const artifacts = await ctx.db
      .query("reportArtifacts")
      .withIndex("by_report_format", (q) => q.eq("reportId", report._id))
      .collect();
    return {
      _id: report._id,
      title: report.title,
      summary: report.summary,
      status: report.status,
      layoutVersion: report.layoutVersion,
      createdAt: report.createdAt,
      readyAt: report.readyAt ?? null,
      artifacts: artifacts
        .filter((artifact) => artifact.ownerId === ownerId && artifact.deletedAt === undefined)
        .map((artifact) => ({
          format: artifact.format,
          fileName: artifact.fileName,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.sizeBytes,
        })),
    };
  },
});

export const getReportDownloadUrl = query({
  args: { reportId: v.id("reports"), format: reportFormatValidator },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const report = await requireOwnedReport(ctx, ownerId, args.reportId);
    const artifact = await ctx.db
      .query("reportArtifacts")
      .withIndex("by_report_format", (q) => q.eq("reportId", report._id).eq("format", args.format))
      .first();
    if (
      artifact === null ||
      artifact.ownerId !== ownerId ||
      artifact.deletedAt !== undefined ||
      artifact.accessClass !== "private_report"
    ) {
      return null;
    }
    const url = await ctx.storage.getUrl(artifact.storageId);
    if (url === null) return null;
    return { url, fileName: artifact.fileName, mimeType: artifact.mimeType };
  },
});

export async function reportContentHash(value: Uint8Array): Promise<string> {
  return sha256Hex(new TextDecoder().decode(value));
}
