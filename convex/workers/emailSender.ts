"use node";

import { makeFunctionReference } from "convex/server";
import { internalAction, type ActionCtx } from "../_generated/server";
import {
  agentMailIdempotencyKey,
  getAgentMailClient,
} from "../lib/agentmailClient";
import { sanitizeErrorCode } from "../lib/normalize";
import type { ExecutorResult } from "../tools/types";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

type AttachmentCandidate = {
  format: "markdown" | "pdf";
  storageId: Id<"_storage">;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

type SendContext = {
  state: "sending" | "accepted";
  emailMessage: {
    _id: Id<"emailMessages">;
    idempotencyKey: string;
    subject: string;
    plainTextBody?: string;
  };
  inboxId: string;
  fromAddress: string;
  toAddress: string;
  artifacts: AttachmentCandidate[];
};

const beginOutbound = makeFunctionReference<
  "mutation",
  {
    toolCallId: Id<"toolCalls">;
    subject: string;
    bodySummary: string;
    reportId?: string;
  },
  SendContext | { state: "accepted"; emailMessage: SendContext["emailMessage"] }
>("emails:beginOutboundSend");
const beginDirect = makeFunctionReference<
  "mutation",
  { toolCallId: Id<"toolCalls">; subject: string; body: string },
  SendContext | { state: "accepted"; emailMessage: SendContext["emailMessage"] }
>("emails:beginDirectSend");
const getOutbound = makeFunctionReference<
  "query",
  { emailMessageId: Id<"emailMessages"> },
  {
    message: SendContext["emailMessage"] & { status: string };
    bot: { recipientEmail: string };
    inbox: { providerInboxId?: string; confirmedAddress?: string };
    artifacts: AttachmentCandidate[];
  }
>("emails:getOutboundSendContext");
const getRetryKind = makeFunctionReference<
  "query",
  { emailMessageId: Id<"emailMessages"> },
  {
    kind: "report" | "thread_reply" | "direct";
    status: string;
    runId: Id<"researchRuns"> | null;
  }
>("emails:getEmailRetryKind");
const markAccepted = makeFunctionReference<
  "mutation",
  { emailMessageId: Id<"emailMessages">; providerMessageId: string; providerThreadId: string },
  { ok: boolean }
>("emails:markOutboundAccepted");
const markFailed = makeFunctionReference<
  "mutation",
  { emailMessageId: Id<"emailMessages">; errorCode: string },
  { ok: boolean }
>("emails:markOutboundFailed");
const beginReply = makeFunctionReference<
  "mutation",
  { runId: Id<"researchRuns">; body: string; subject: string },
  {
    state: "sending" | "accepted";
    message: { _id: Id<"emailMessages">; idempotencyKey: string };
    inbox: { providerInboxId?: string; confirmedAddress?: string };
    inbound: { providerMessageId?: string; fromAddress: string };
  }
>("emails:beginEmailReply");
const replyContext = makeFunctionReference<
  "query",
  { runId: Id<"researchRuns"> },
  {
    run: { _id: Id<"researchRuns"> };
    inbound: { providerMessageId?: string; fromAddress: string; subject: string };
    inbox: { providerInboxId?: string };
    assistant: { content: string };
    artifacts: AttachmentCandidate[];
  } | null
>("emails:getEmailReplyContext");
const markReplyAccepted = makeFunctionReference<
  "mutation",
  { emailMessageId: Id<"emailMessages">; providerMessageId: string; providerThreadId: string },
  { ok: boolean }
>("emails:markEmailReplyAccepted");

const MAX_ATTACHMENT_BYTES = 3_500_000;

async function attachmentBytes(ctx: ActionCtx, artifacts: AttachmentCandidate[]) {
  const ordered = [
    artifacts.find((artifact) => artifact.format === "pdf"),
    artifacts.find((artifact) => artifact.format === "markdown"),
  ].filter((artifact): artifact is AttachmentCandidate => artifact !== undefined);
  for (const artifact of ordered) {
    if (artifact.sizeBytes > MAX_ATTACHMENT_BYTES) continue;
    const blob = await ctx.storage.get(artifact.storageId);
    if (blob === null) continue;
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) continue;
    return {
      filename: artifact.fileName,
      contentType: artifact.mimeType,
      content: bytes.toString("base64"),
    };
  }
  return undefined;
}

async function sendOutbound(
  ctx: ActionCtx,
  context: SendContext,
): Promise<ExecutorResult> {
  if (context.state === "accepted") {
    return {
      kind: "immediate",
      outputJson: JSON.stringify({ ok: true, emailMessageId: context.emailMessage._id, status: "accepted" }),
    };
  }
  try {
    const attachment = context.artifacts.length === 0
      ? undefined
      : await attachmentBytes(ctx, context.artifacts);
    const attachmentNote =
      context.artifacts.length === 0
        ? ""
        : attachment === undefined
          ? "\n\nThe stored report was not attached because it exceeded the provider attachment limit."
          : `\n\nThe ${attachment.filename.endsWith(".pdf") ? "PDF" : "Markdown"} report is attached.`;
    const body = `${context.emailMessage.plainTextBody ?? ""}${attachmentNote}`;
    const sent = await getAgentMailClient().inboxes.messages.send(
      context.inboxId,
      {
        to: context.toAddress,
        subject: context.emailMessage.subject,
        text: body,
        attachments: attachment === undefined ? undefined : [attachment],
      },
      { idempotencyKey: agentMailIdempotencyKey(context.emailMessage.idempotencyKey) },
    );
    await ctx.runMutation(markAccepted, {
      emailMessageId: context.emailMessage._id,
      providerMessageId: sent.messageId,
      providerThreadId: sent.threadId,
    });
    return {
      kind: "immediate",
      outputJson: JSON.stringify({ ok: true, emailMessageId: context.emailMessage._id, status: "accepted" }),
    };
  } catch (error) {
    try {
      await ctx.runMutation(markFailed, {
        emailMessageId: context.emailMessage._id,
        errorCode: sanitizeErrorCode(error),
      });
    } catch {
      return {
        kind: "failed",
        code: "email_state_failed",
        retryable: true,
        safeMessage: "The email provider state could not be saved safely.",
      };
    }
    const code = sanitizeErrorCode(error);
    return {
      kind: "failed",
      code,
      retryable: ["timeout", "rate_limited", "provider_error", "unknown_error"].includes(code),
      safeMessage: "AgentMail could not accept the research email.",
    };
  }
}

export const sendEmail = internalAction({
  args: {
    toolCallId: v.id("toolCalls"),
    subject: v.string(),
    bodySummary: v.string(),
    reportId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runMutation(beginOutbound, args);
    if (context.state === "accepted") {
      return {
        kind: "immediate" as const,
        outputJson: JSON.stringify({ ok: true, emailMessageId: context.emailMessage._id, status: "accepted" }),
      };
    }
    return await sendOutbound(ctx, context);
  },
});

async function sendReplyForRun(ctx: ActionCtx, runId: Id<"researchRuns">) {
  const context = await ctx.runQuery(replyContext, { runId });
  if (context === null || context.inbound.providerMessageId === undefined || context.inbox.providerInboxId === undefined) {
    return { ok: false, reason: "reply_context_unavailable" };
  }
  const body = context.assistant.content.trim();
  if (!body) return { ok: false, reason: "empty_assistant_message" };
  const subject = context.inbound.subject.toLowerCase().startsWith("re:")
    ? context.inbound.subject
    : `Re: ${context.inbound.subject}`;
  const began = await ctx.runMutation(beginReply, { runId, body, subject });
  if (began.state === "accepted") return { ok: true, status: "accepted" };
  if (began.inbox.providerInboxId === undefined) {
    return { ok: false, reason: "reply_inbox_unavailable" };
  }
  try {
    const attachment = await attachmentBytes(ctx, context.artifacts);
    const sent = await getAgentMailClient().inboxes.messages.reply(
      began.inbox.providerInboxId,
      context.inbound.providerMessageId,
      {
        text: body,
        attachments: attachment === undefined ? undefined : [attachment],
      },
      { idempotencyKey: agentMailIdempotencyKey(began.message.idempotencyKey) },
    );
    await ctx.runMutation(markReplyAccepted, {
      emailMessageId: began.message._id,
      providerMessageId: sent.messageId,
      providerThreadId: sent.threadId,
    });
    return { ok: true, status: "accepted" };
  } catch (error) {
    try {
      await ctx.runMutation(markFailed, {
        emailMessageId: began.message._id,
        errorCode: sanitizeErrorCode(error),
      });
    } catch {
      return { ok: false, reason: "reply_state_failed" };
    }
    return { ok: false, reason: "provider_rejected" };
  }
}

export const sendDirectEmail = internalAction({
  args: {
    toolCallId: v.id("toolCalls"),
    subject: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runMutation(beginDirect, args);
    if (context.state === "accepted") {
      return {
        kind: "immediate" as const,
        outputJson: JSON.stringify({ ok: true, emailMessageId: context.emailMessage._id, status: "accepted" }),
      };
    }
    return await sendOutbound(ctx, context);
  },
});

export const retryEmail = internalAction({
  args: { emailMessageId: v.id("emailMessages") },
  handler: async (ctx, args) => {
    const routing = await ctx.runQuery(getRetryKind, args);
    if (routing.status === "accepted" || routing.status === "delivered") {
      return { ok: true, status: routing.status };
    }
    if (routing.kind === "thread_reply") {
      if (routing.runId === null) return { ok: false, reason: "reply_context_unavailable" };
      return await sendReplyForRun(ctx, routing.runId);
    }
    const context = await ctx.runQuery(getOutbound, args);
    if (context.message.status === "accepted" || context.message.status === "delivered") {
      return { ok: true, status: context.message.status };
    }
    return await sendOutbound(ctx, {
      state: "sending",
      emailMessage: context.message,
      inboxId: context.inbox.providerInboxId!,
      fromAddress: context.inbox.confirmedAddress!,
      toAddress: context.bot.recipientEmail,
      artifacts: context.artifacts,
    });
  },
});

export const replyForEmailRun = internalAction({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    return await sendReplyForRun(ctx, args.runId);
  },
});
