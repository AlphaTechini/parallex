import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import { emailSendKey } from "./lib/normalize";
import { getAuthenticatedUserId, requireOwnedRun } from "./lib/authHelpers";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

const retryEmailAction = makeFunctionReference<"action">("workers/emailSender:retryEmail");

type ActiveInbox = Omit<Doc<"agentMailInboxes">, "providerInboxId" | "confirmedAddress"> & {
  providerInboxId: string;
  confirmedAddress: string;
};

const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "canceled"]);
type DeliveryStatus = "accepted" | "delivered" | "failed";

export function canApplyDeliveryStatus(
  current: Doc<"emailMessages">["status"],
  next: DeliveryStatus,
): boolean {
  if (current === "delivered" || current === "failed") {
    return current === next;
  }
  return current === "pending" || current === "sending" || current === "accepted";
}

function emailKind(
  message: Doc<"emailMessages">,
): "report" | "thread_reply" {
  if (message.idempotencyKey.startsWith("email-reply:")) {
    return "thread_reply";
  }
  if (message.idempotencyKey.startsWith("email:") && message.reportId !== undefined) {
    return "report";
  }
  throw new Error("EMAIL_CONTEXT_INVALID");
}

type EmailGraph = {
  call: Doc<"toolCalls">;
  run: Doc<"researchRuns">;
  chat: Doc<"chats">;
  bot: Doc<"bots">;
  inbox: ActiveInbox;
  report: Doc<"reports">;
};

async function nextRunEventSequence(ctx: MutationCtx, runId: Id<"researchRuns">): Promise<number> {
  const last = await ctx.db
    .query("runEvents")
    .withIndex("by_run_sequence", (q) => q.eq("runId", runId))
    .order("desc")
    .first();
  return (last?.sequence ?? 0) + 1;
}

async function emailEvent(
  ctx: MutationCtx,
  run: Doc<"researchRuns">,
  status: "started" | "updated" | "completed" | "failed",
  safeDetail?: string,
) {
  await ctx.db.insert("runEvents", {
    ownerId: run.ownerId,
    runId: run._id,
    sequence: await nextRunEventSequence(ctx, run._id),
    kind: "email_send",
    label: "Research email",
    status,
    safeDetail: safeDetail?.slice(0, 2_000),
    createdAt: Date.now(),
  });
}

async function loadEmailGraph(
  ctx: MutationCtx,
  toolCallId: Id<"toolCalls">,
  reportId?: string,
): Promise<EmailGraph> {
  const call = await ctx.db.get("toolCalls", toolCallId);
  if (call === null || call.functionName !== "send_research_email") throw new Error("TOOL_CALL_INVALID");
  const run = await ctx.db.get("researchRuns", call.runId);
  const chat = run === null ? null : await ctx.db.get("chats", run.chatId);
  const bot = run === null ? null : await ctx.db.get("bots", run.botId);
  let report: Doc<"reports"> | null = null;
  if (reportId !== undefined && reportId !== null) {
    const normalizedReportId = ctx.db.normalizeId("reports", reportId);
    report = normalizedReportId === null
      ? null
      : await ctx.db.get("reports", normalizedReportId);
    if (
      report !== null &&
      (report.ownerId !== run?.ownerId || report.chatId !== run?.chatId)
    ) {
      report = null;
    }
  } else if (run !== null) {
    report = await ctx.db.query("reports").withIndex("by_run", (q) => q.eq("runId", run._id)).first();
    if (
      report !== null &&
      (report.ownerId !== run.ownerId || report.chatId !== run.chatId)
    ) {
      report = null;
    }
  }
  const inbox = bot === null
    ? null
    : await ctx.db.query("agentMailInboxes").withIndex("by_bot", (q) => q.eq("botId", bot._id)).unique();
  if (
    run === null ||
    chat === null ||
    bot === null ||
    inbox === null ||
    report === null ||
    call.ownerId !== run.ownerId ||
    chat.ownerId !== run.ownerId ||
    bot.ownerId !== run.ownerId ||
    inbox.ownerId !== run.ownerId ||
    report.ownerId !== run.ownerId ||
    run.botId !== bot._id ||
    run.chatId !== chat._id ||
    chat.botId !== bot._id ||
    inbox.botId !== bot._id ||
    chat.status !== "active" ||
    bot.status !== "active" ||
    inbox.status !== "active" ||
    TERMINAL_RUN_STATUSES.has(run.status) ||
    chat.activeRunId !== run._id ||
    inbox.providerInboxId === undefined ||
    inbox.confirmedAddress === undefined ||
    (report.status !== "ready" && report.status !== "partial")
  ) {
    throw new Error("EMAIL_CONTEXT_INVALID");
  }
  return {
    call,
    run,
    chat,
    bot,
    inbox: inbox as ActiveInbox,
    report,
  };
}

export const beginOutboundSend = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    subject: v.string(),
    bodySummary: v.string(),
    reportId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const graph = await loadEmailGraph(ctx, args.toolCallId, args.reportId);
    if (graph.call.status !== "running" || graph.run.cancelRequested) throw new Error("RUN_NOT_LIVE");
    const key = emailSendKey(graph.run._id, graph.report._id);
    const existing = await ctx.db
      .query("emailMessages")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", key))
      .unique();
    if (existing !== null) {
      if (existing.ownerId !== graph.run.ownerId || existing.runId !== graph.run._id) {
        throw new Error("EMAIL_IDEMPOTENCY_CONFLICT");
      }
      if (existing.status === "accepted" || existing.status === "delivered") {
        return { state: "accepted" as const, emailMessage: existing };
      }
      if (existing.status !== "sending") {
        await ctx.db.patch("emailMessages", existing._id, {
          status: "sending",
          failureCode: undefined,
          lastAttemptAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      return await outboundContext(ctx, graph, { ...existing, status: "sending" });
    }
    const subject = args.subject.replace(/\u0000/g, "").trim().slice(0, 300);
    const bodySummary = args.bodySummary.replace(/\u0000/g, "").trim().slice(0, 10_000);
    if (!subject || !bodySummary) throw new Error("INVALID_EMAIL_INPUT");
    const now = Date.now();
    const emailMessageId = await ctx.db.insert("emailMessages", {
      ownerId: graph.run.ownerId,
      botId: graph.bot._id,
      chatId: graph.chat._id,
      runId: graph.run._id,
      direction: "outbound",
      idempotencyKey: key,
      fromAddress: graph.inbox.confirmedAddress,
      toAddresses: [graph.bot.recipientEmail],
      subject,
      plainTextBody: bodySummary,
      reportId: graph.report._id,
      status: "sending",
      lastAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const emailMessage = await ctx.db.get("emailMessages", emailMessageId);
    if (emailMessage === null) throw new Error("EMAIL_NOT_FOUND");
    await emailEvent(ctx, graph.run, "started");
    return await outboundContext(ctx, graph, emailMessage);
  },
});

async function outboundContext(
  ctx: MutationCtx,
  graph: EmailGraph,
  emailMessage: Doc<"emailMessages">,
) {
  const artifacts = await ctx.db
    .query("reportArtifacts")
    .withIndex("by_report_format", (q) => q.eq("reportId", graph.report._id))
    .collect();
  return {
    state: "sending" as const,
    emailMessage,
    inboxId: graph.inbox.providerInboxId!,
    fromAddress: graph.inbox.confirmedAddress!,
    toAddress: graph.bot.recipientEmail,
    report: graph.report,
    artifacts: artifacts.filter((artifact) => artifact.deletedAt === undefined),
  };
}

export const markOutboundAccepted = internalMutation({
  args: {
    emailMessageId: v.id("emailMessages"),
    providerMessageId: v.string(),
    providerThreadId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get("emailMessages", args.emailMessageId);
    if (message === null || message.direction !== "outbound") throw new Error("EMAIL_NOT_FOUND");
    const bot = await ctx.db.get("bots", message.botId);
    const inbox = bot === null
      ? null
      : await ctx.db.query("agentMailInboxes").withIndex("by_bot", (q) => q.eq("botId", bot._id)).unique();
    const run = message.runId === undefined ? null : await ctx.db.get("researchRuns", message.runId);
    if (
      bot === null ||
      inbox === null ||
      run === null ||
      bot.ownerId !== message.ownerId ||
      inbox.ownerId !== message.ownerId ||
      run.ownerId !== message.ownerId ||
      inbox.status !== "active"
    ) throw new Error("EMAIL_OWNERSHIP_INVALID");
    const existingThread = await ctx.db
      .query("emailThreads")
      .withIndex("by_inbox_provider_thread", (q) =>
        q.eq("agentMailInboxId", inbox._id).eq("providerThreadId", args.providerThreadId),
      )
      .unique();
    if (
      existingThread !== null &&
      (existingThread.ownerId !== message.ownerId ||
        existingThread.botId !== message.botId ||
        existingThread.chatId !== message.chatId ||
        existingThread.agentMailInboxId !== inbox._id)
    ) {
      throw new Error("EMAIL_THREAD_OWNERSHIP_INVALID");
    }
    if (!canApplyDeliveryStatus(message.status, "accepted")) {
      return { ok: true, threadId: existingThread?._id };
    }
    const threadId =
      existingThread?._id ??
      (await ctx.db.insert("emailThreads", {
        ownerId: message.ownerId,
        botId: message.botId,
        chatId: message.chatId,
        agentMailInboxId: inbox._id,
        providerThreadId: args.providerThreadId,
        authorizedSenderEmail: bot.recipientEmail,
        status: "active",
        lastMessageAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }));
    await ctx.db.patch("emailMessages", message._id, {
      providerMessageId: args.providerMessageId,
      providerThreadId: args.providerThreadId,
      threadId,
      status: "accepted",
      updatedAt: Date.now(),
    });
    await ctx.db.patch("emailThreads", threadId, {
      lastMessageAt: Date.now(),
      updatedAt: Date.now(),
    });
    await emailEvent(ctx, run, "completed", "AgentMail accepted the research email.");
    return { ok: true, threadId };
  },
});

export const markOutboundFailed = internalMutation({
  args: { emailMessageId: v.id("emailMessages"), errorCode: v.string() },
  handler: async (ctx, args) => {
    const message = await ctx.db.get("emailMessages", args.emailMessageId);
    if (message === null || message.direction !== "outbound") throw new Error("EMAIL_NOT_FOUND");
    const run = message.runId === undefined ? null : await ctx.db.get("researchRuns", message.runId);
    if (run === null || run.ownerId !== message.ownerId) throw new Error("EMAIL_OWNERSHIP_INVALID");
    const safeCode = args.errorCode.replace(/[^a-z0-9_]/gi, "").slice(0, 60) || "provider_error";
    if (!canApplyDeliveryStatus(message.status, "failed")) {
      return { ok: true };
    }
    await ctx.db.patch("emailMessages", message._id, {
      status: "failed",
      failureCode: safeCode,
      lastAttemptAt: Date.now(),
      updatedAt: Date.now(),
    });
    await emailEvent(
      ctx,
      run,
      "failed",
      `AgentMail could not accept the research email (code: ${safeCode}).`,
    );
    return { ok: true };
  },
});

export const getOutboundSendContext = internalQuery({
  args: { emailMessageId: v.id("emailMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get("emailMessages", args.emailMessageId);
    if (message === null || message.direction !== "outbound") throw new Error("EMAIL_NOT_FOUND");
    const bot = await ctx.db.get("bots", message.botId);
    const inbox = bot === null
      ? null
      : await ctx.db.query("agentMailInboxes").withIndex("by_bot", (q) => q.eq("botId", bot._id)).unique();
    const report = message.reportId === undefined ? null : await ctx.db.get("reports", message.reportId);
    const run = message.runId === undefined ? null : await ctx.db.get("researchRuns", message.runId);
    if (
      bot === null ||
      inbox === null ||
      report === null ||
      run === null ||
      message.ownerId !== bot.ownerId ||
      inbox.ownerId !== message.ownerId ||
      report.ownerId !== message.ownerId ||
      report.runId !== run._id ||
      report.botId !== bot._id ||
      report.chatId !== message.chatId ||
      (report.status !== "ready" && report.status !== "partial") ||
      inbox.status !== "active" ||
      inbox.providerInboxId === undefined ||
      inbox.confirmedAddress === undefined
    ) throw new Error("EMAIL_CONTEXT_INVALID");
    const artifacts = await ctx.db
      .query("reportArtifacts")
      .withIndex("by_report_format", (q) => q.eq("reportId", report._id))
      .collect();
    return {
      message,
      bot,
      inbox,
      report,
      artifacts: artifacts.filter((artifact) => artifact.deletedAt === undefined),
    };
  },
});

export const getEmailRetryKind = internalQuery({
  args: { emailMessageId: v.id("emailMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get("emailMessages", args.emailMessageId);
    if (message === null || message.direction !== "outbound") {
      throw new Error("EMAIL_NOT_FOUND");
    }
    return {
      kind: emailKind(message),
      status: message.status,
      runId: message.runId ?? null,
    };
  },
});

export const retryFailedEmail = mutation({
  args: { emailMessageId: v.id("emailMessages") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const message = await ctx.db.get("emailMessages", args.emailMessageId);
    if (message === null || message.ownerId !== ownerId || message.direction !== "outbound") {
      throw new Error("NOT_FOUND");
    }
    if (message.status !== "failed") throw new Error("EMAIL_NOT_RETRYABLE");
    emailKind(message);
    await ctx.db.patch("emailMessages", message._id, {
      status: "sending",
      failureCode: undefined,
      lastAttemptAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, retryEmailAction, { emailMessageId: message._id });
    return { ok: true };
  },
});

export const getEmailForRun = query({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    await requireOwnedRun(ctx, ownerId, args.runId);
    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .order("desc")
      .collect();
    const message = messages.find(
      (candidate) => candidate.ownerId === ownerId && candidate.direction === "outbound",
    );
    if (message === undefined) return null;
    return {
      _id: message._id,
      status: message.status,
      subject: message.subject,
      providerMessageId: message.providerMessageId ?? null,
      failureCode: message.failureCode ?? null,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  },
});

export const updateDeliveryStatus = internalMutation({
  args: {
    providerMessageId: v.string(),
    status: v.union(v.literal("accepted"), v.literal("delivered"), v.literal("failed")),
    providerTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("emailMessages")
      .withIndex("by_provider_message", (q) => q.eq("providerMessageId", args.providerMessageId))
      .unique();
    if (message === null || message.direction !== "outbound") return { ok: true, updated: false };
    const bot = await ctx.db.get("bots", message.botId);
    const inbox = bot === null
      ? null
      : await ctx.db.query("agentMailInboxes").withIndex("by_bot", (q) => q.eq("botId", bot._id)).unique();
    if (bot === null || inbox === null || bot.ownerId !== message.ownerId || inbox.ownerId !== message.ownerId) {
      return { ok: true, updated: false };
    }
    if (!canApplyDeliveryStatus(message.status, args.status)) {
      return { ok: true, updated: false };
    }
    const statusChanged = message.status !== args.status;
    if (!statusChanged && args.providerTimestamp === undefined) {
      return { ok: true, updated: false };
    }
    const updatedAt = Date.now();
    if (args.providerTimestamp === undefined) {
      await ctx.db.patch("emailMessages", message._id, {
        status: args.status,
        updatedAt,
      });
    } else {
      await ctx.db.patch("emailMessages", message._id, {
        status: args.status,
        providerTimestamp: args.providerTimestamp,
        updatedAt,
      });
    }
    if (message.runId !== undefined) {
      const run = await ctx.db.get("researchRuns", message.runId);
      if (run !== null && run.ownerId === message.ownerId) {
        await emailEvent(
          ctx,
          run,
          args.status === "failed" ? "failed" : "updated",
          args.status === "delivered" ? "AgentMail reported delivery." : undefined,
        );
      }
    }
    return { ok: true, updated: statusChanged || args.providerTimestamp !== undefined };
  },
});

export const getEmailReplyContext = internalQuery({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null || run.triggerKind !== "email") return null;
    const trigger = await ctx.db.get("messages", run.triggerMessageId);
    const assistant = run.assistantMessageId === undefined
      ? null
      : await ctx.db.get("messages", run.assistantMessageId);
    if (
      trigger === null ||
      assistant === null ||
      trigger.emailMessageId === undefined ||
      trigger.ownerId !== run.ownerId ||
      assistant.ownerId !== run.ownerId ||
      trigger.runId !== run._id ||
      assistant.runId !== run._id
    ) return null;
    const inbound = await ctx.db.get("emailMessages", trigger.emailMessageId);
    if (inbound === null || inbound.direction !== "inbound" || inbound.threadId === undefined) return null;
    const thread = await ctx.db.get("emailThreads", inbound.threadId);
    const bot = await ctx.db.get("bots", run.botId);
    const inbox = bot === null
      ? null
      : await ctx.db.query("agentMailInboxes").withIndex("by_bot", (q) => q.eq("botId", bot._id)).unique();
    if (
      thread === null ||
      bot === null ||
      inbox === null ||
      thread.ownerId !== run.ownerId ||
      thread.chatId !== run.chatId ||
      thread.botId !== run.botId ||
      inbound.ownerId !== run.ownerId ||
      bot.ownerId !== run.ownerId ||
      inbox.ownerId !== run.ownerId ||
      inbox.status !== "active" ||
      inbox.providerInboxId === undefined ||
      inbound.providerMessageId === undefined ||
      thread.providerThreadId !== inbound.providerThreadId
    ) return null;
    const report = await ctx.db
      .query("reports")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .first();
    const artifacts = report === null
      ? []
      : await ctx.db.query("reportArtifacts").withIndex("by_report_format", (q) => q.eq("reportId", report._id)).collect();
    return {
      run,
      inbound,
      thread,
      bot,
      inbox,
      assistant,
      report: report !== null && (report.status === "ready" || report.status === "partial") ? report : null,
      artifacts: artifacts.filter((artifact) => artifact.deletedAt === undefined),
    };
  },
});

export const beginEmailReply = internalMutation({
  args: { runId: v.id("researchRuns"), body: v.string(), subject: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null || run.triggerKind !== "email" || run.status !== "completed") {
      throw new Error("EMAIL_REPLY_NOT_AVAILABLE");
    }
    const trigger = await ctx.db.get("messages", run.triggerMessageId);
    if (trigger === null || trigger.emailMessageId === undefined) throw new Error("EMAIL_REPLY_NOT_AVAILABLE");
    const inbound = await ctx.db.get("emailMessages", trigger.emailMessageId);
    if (inbound === null || inbound.direction !== "inbound" || inbound.threadId === undefined) {
      throw new Error("EMAIL_REPLY_NOT_AVAILABLE");
    }
    const thread = await ctx.db.get("emailThreads", inbound.threadId);
    const bot = await ctx.db.get("bots", run.botId);
    const inbox = bot === null
      ? null
      : await ctx.db.query("agentMailInboxes").withIndex("by_bot", (q) => q.eq("botId", bot._id)).unique();
    if (
      thread === null ||
      bot === null ||
      inbox === null ||
      thread.ownerId !== run.ownerId ||
      thread.chatId !== run.chatId ||
      thread.botId !== run.botId ||
      bot.ownerId !== run.ownerId ||
      inbox.ownerId !== run.ownerId ||
      inbox.status !== "active" ||
      inbox.providerInboxId === undefined ||
      inbox.confirmedAddress === undefined ||
      inbound.providerMessageId === undefined
    ) throw new Error("EMAIL_REPLY_CONTEXT_INVALID");
    const idempotencyKey = `email-reply:${run._id}`;
    const existing = await ctx.db
      .query("emailMessages")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    if (existing !== null) {
      if (existing.ownerId !== run.ownerId || existing.runId !== run._id) throw new Error("EMAIL_IDEMPOTENCY_CONFLICT");
      return {
        state: existing.status === "accepted" || existing.status === "delivered" ? "accepted" as const : "sending" as const,
        message: existing,
        inbox: inbox as ActiveInbox,
        bot,
        inbound,
        thread,
      };
    }
    const report = await ctx.db.query("reports").withIndex("by_run", (q) => q.eq("runId", run._id)).first();
    const now = Date.now();
    const messageId = await ctx.db.insert("emailMessages", {
      ownerId: run.ownerId,
      botId: bot._id,
      chatId: run.chatId,
      runId: run._id,
      threadId: thread._id,
      direction: "outbound",
      providerThreadId: thread.providerThreadId,
      idempotencyKey,
      fromAddress: inbox.confirmedAddress,
      toAddresses: [inbound.fromAddress],
      subject: args.subject.slice(0, 300),
      plainTextBody: args.body.slice(0, 100_000),
      reportId: report?.status === "ready" || report?.status === "partial" ? report._id : undefined,
      status: "sending",
      createdAt: now,
      updatedAt: now,
    });
    const message = await ctx.db.get("emailMessages", messageId);
    if (message === null) throw new Error("EMAIL_NOT_FOUND");
    return { state: "sending" as const, message, inbox: inbox as ActiveInbox, bot, inbound, thread };
  },
});

export const markEmailReplyAccepted = internalMutation({
  args: {
    emailMessageId: v.id("emailMessages"),
    providerMessageId: v.string(),
    providerThreadId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get("emailMessages", args.emailMessageId);
    if (message === null || message.direction !== "outbound") throw new Error("EMAIL_NOT_FOUND");
    const run = message.runId === undefined ? null : await ctx.db.get("researchRuns", message.runId);
    if (run === null || run.ownerId !== message.ownerId) throw new Error("EMAIL_OWNERSHIP_INVALID");
    if (!canApplyDeliveryStatus(message.status, "accepted")) {
      return { ok: true };
    }
    await ctx.db.patch("emailMessages", message._id, {
      providerMessageId: args.providerMessageId,
      providerThreadId: args.providerThreadId,
      status: "accepted",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
