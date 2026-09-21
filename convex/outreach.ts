import { makeFunctionReference } from "convex/server";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getAuthenticatedUserId } from "./lib/authHelpers";
import { isValidEmail, normalizeEmail, sha256Hex } from "./lib/normalize";
import { v } from "convex/values";

const sendApprovedDraft = makeFunctionReference<
  "action",
  { draftId: import("./_generated/dataModel").Id<"outreachDrafts"> }
>("workers/outreachSender:sendApprovedDraft");

export const prepareDraftForTool = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    recipientEmail: v.string(),
    merchantName: v.string(),
    productLabel: v.string(),
    subject: v.string(),
    body: v.string(),
    constraints: v.string(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get("toolCalls", args.toolCallId);
    if (call === null || call.functionName !== "prepare_outreach_draft") {
      throw new Error("TOOL_CALL_INVALID");
    }
    const run = await ctx.db.get("researchRuns", call.runId);
    const chat = run === null ? null : await ctx.db.get("chats", run.chatId);
    const bot = run === null ? null : await ctx.db.get("bots", run.botId);
    const inbox =
      bot === null
        ? null
        : bot.emailInboxId === undefined
          ? await ctx.db
              .query("agentMailInboxes")
              .withIndex("by_bot", (q) => q.eq("botId", bot._id))
              .unique()
          : await ctx.db.get("agentMailInboxes", bot.emailInboxId);
    if (
      run === null ||
      chat === null ||
      bot === null ||
      inbox === null ||
      call.ownerId !== run.ownerId ||
      chat.ownerId !== run.ownerId ||
      bot.ownerId !== run.ownerId ||
      inbox.ownerId !== run.ownerId ||
      run.chatId !== chat._id ||
      run.botId !== bot._id ||
      chat.botId !== bot._id ||
      chat.activeRunId !== run._id ||
      chat.status !== "active" ||
      bot.status !== "active" ||
      inbox.status !== "active" ||
      call.status !== "running" ||
      run.cancelRequested
    ) {
      throw new Error("OUTREACH_CONTEXT_INVALID");
    }
    const recipientEmail = normalizeEmail(args.recipientEmail);
    const merchantName = args.merchantName.replace(/\u0000/g, "").trim().slice(0, 200);
    const productLabel = args.productLabel.replace(/\u0000/g, "").trim().slice(0, 300);
    const subject = args.subject.replace(/\u0000/g, "").trim().slice(0, 300);
    const body = args.body.replace(/\u0000/g, "").trim().slice(0, 20_000);
    const constraints = args.constraints.replace(/\u0000/g, "").trim().slice(0, 5_000);
    if (
      !isValidEmail(recipientEmail) ||
      !merchantName ||
      !productLabel ||
      !subject ||
      !body ||
      !constraints
    ) {
      throw new Error("INVALID_OUTREACH_DRAFT");
    }
    const idempotencyKey = `outreach-draft:${run._id}:${await sha256Hex(
      `${recipientEmail}\n${subject}\n${body}`,
    )}`;
    const existing = await ctx.db
      .query("outreachDrafts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
      .unique();
    if (existing !== null) {
      if (existing.ownerId !== run.ownerId || existing.runId !== run._id) {
        throw new Error("OUTREACH_IDEMPOTENCY_CONFLICT");
      }
      return { draftId: existing._id, status: existing.status };
    }
    const now = Date.now();
    const draftId = await ctx.db.insert("outreachDrafts", {
      ownerId: run.ownerId,
      botId: bot._id,
      chatId: chat._id,
      runId: run._id,
      agentMailInboxId: inbox._id,
      recipientEmail,
      merchantName,
      productLabel,
      subject,
      body,
      constraints,
      idempotencyKey,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    return { draftId, status: "draft" as const };
  },
});

export const listDraftsForRun = query({
  args: { runId: v.id("researchRuns") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null || run.ownerId !== ownerId) throw new Error("NOT_FOUND");
    const drafts = await ctx.db
      .query("outreachDrafts")
      .withIndex("by_run_created", (q) => q.eq("runId", run._id))
      .take(20);
    return drafts
      .filter((draft) => draft.ownerId === ownerId)
      .map((draft) => ({
        _id: draft._id,
        recipientEmail: draft.recipientEmail,
        merchantName: draft.merchantName,
        productLabel: draft.productLabel,
        subject: draft.subject,
        body: draft.body,
        constraints: draft.constraints,
        status: draft.status,
        failureCode: draft.failureCode ?? null,
      }));
  },
});

export const approveDraft = mutation({
  args: { draftId: v.id("outreachDrafts") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const draft = await ctx.db.get("outreachDrafts", args.draftId);
    if (draft === null || draft.ownerId !== ownerId) throw new Error("NOT_FOUND");
    if (draft.status === "sent" || draft.status === "sending") {
      return { ok: true, status: draft.status };
    }
    if (draft.status !== "draft" && draft.status !== "failed") {
      throw new Error("OUTREACH_NOT_APPROVABLE");
    }
    const [bot, chat, inbox] = await Promise.all([
      ctx.db.get("bots", draft.botId),
      ctx.db.get("chats", draft.chatId),
      ctx.db.get("agentMailInboxes", draft.agentMailInboxId),
    ]);
    if (
      bot === null ||
      chat === null ||
      inbox === null ||
      bot.ownerId !== ownerId ||
      chat.ownerId !== ownerId ||
      inbox.ownerId !== ownerId ||
      bot.status !== "active" ||
      chat.status !== "active" ||
      inbox.status !== "active" ||
      inbox.confirmedAddress === undefined ||
      (bot.emailInboxId !== inbox._id && inbox.botId !== bot._id)
    ) {
      throw new Error("OUTREACH_CONTEXT_INVALID");
    }
    const now = Date.now();
    let emailMessageId = draft.emailMessageId;
    if (emailMessageId === undefined) {
      emailMessageId = await ctx.db.insert("emailMessages", {
        ownerId,
        botId: bot._id,
        chatId: chat._id,
        runId: draft.runId,
        direction: "outbound",
        idempotencyKey: `email-outreach:${draft._id}`,
        fromAddress: inbox.confirmedAddress,
        toAddresses: [draft.recipientEmail],
        subject: draft.subject,
        plainTextBody: draft.body,
        status: "sending",
        lastAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("emailMessages", emailMessageId, {
        status: "sending",
        failureCode: undefined,
        lastAttemptAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch("outreachDrafts", draft._id, {
      emailMessageId,
      status: "sending",
      approvedAt: draft.approvedAt ?? now,
      failureCode: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, sendApprovedDraft, { draftId: draft._id });
    return { ok: true, status: "sending" as const };
  },
});

export const getApprovedDraftContext = internalQuery({
  args: { draftId: v.id("outreachDrafts") },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get("outreachDrafts", args.draftId);
    if (draft === null || draft.emailMessageId === undefined) {
      throw new Error("OUTREACH_NOT_FOUND");
    }
    const [bot, chat, inbox, message] = await Promise.all([
      ctx.db.get("bots", draft.botId),
      ctx.db.get("chats", draft.chatId),
      ctx.db.get("agentMailInboxes", draft.agentMailInboxId),
      ctx.db.get("emailMessages", draft.emailMessageId),
    ]);
    if (
      bot === null ||
      chat === null ||
      inbox === null ||
      message === null ||
      draft.status !== "sending" ||
      bot.ownerId !== draft.ownerId ||
      chat.ownerId !== draft.ownerId ||
      inbox.ownerId !== draft.ownerId ||
      message.ownerId !== draft.ownerId ||
      inbox.status !== "active" ||
      inbox.providerInboxId === undefined ||
      inbox.confirmedAddress === undefined ||
      message.status !== "sending"
    ) {
      throw new Error("OUTREACH_CONTEXT_INVALID");
    }
    return { draft, bot, chat, inbox, message };
  },
});

export const markDraftSent = internalMutation({
  args: {
    draftId: v.id("outreachDrafts"),
    providerMessageId: v.string(),
    providerThreadId: v.string(),
  },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get("outreachDrafts", args.draftId);
    if (draft === null || draft.emailMessageId === undefined) {
      throw new Error("OUTREACH_NOT_FOUND");
    }
    const message = await ctx.db.get("emailMessages", draft.emailMessageId);
    if (message === null || message.ownerId !== draft.ownerId) {
      throw new Error("OUTREACH_CONTEXT_INVALID");
    }
    const existingThread = await ctx.db
      .query("emailThreads")
      .withIndex("by_inbox_provider_thread", (q) =>
        q
          .eq("agentMailInboxId", draft.agentMailInboxId)
          .eq("providerThreadId", args.providerThreadId),
      )
      .unique();
    if (
      existingThread !== null &&
      (existingThread.ownerId !== draft.ownerId ||
        existingThread.botId !== draft.botId ||
        existingThread.chatId !== draft.chatId)
    ) {
      throw new Error("EMAIL_THREAD_OWNERSHIP_INVALID");
    }
    const now = Date.now();
    const threadId =
      existingThread?._id ??
      (await ctx.db.insert("emailThreads", {
        ownerId: draft.ownerId,
        botId: draft.botId,
        chatId: draft.chatId,
        agentMailInboxId: draft.agentMailInboxId,
        providerThreadId: args.providerThreadId,
        authorizedSenderEmail: draft.recipientEmail,
        outreachApproved: true,
        outreachConstraints: draft.constraints,
        status: "active",
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      }));
    await ctx.db.patch("emailMessages", message._id, {
      threadId,
      providerMessageId: args.providerMessageId,
      providerThreadId: args.providerThreadId,
      status: "accepted",
      updatedAt: now,
    });
    await ctx.db.patch("outreachDrafts", draft._id, {
      status: "sent",
      providerMessageId: args.providerMessageId,
      providerThreadId: args.providerThreadId,
      sentAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const markDraftFailed = internalMutation({
  args: { draftId: v.id("outreachDrafts"), failureCode: v.string() },
  handler: async (ctx, args) => {
    const draft = await ctx.db.get("outreachDrafts", args.draftId);
    if (draft === null) throw new Error("OUTREACH_NOT_FOUND");
    const now = Date.now();
    await ctx.db.patch("outreachDrafts", draft._id, {
      status: "failed",
      failureCode: args.failureCode.replace(/[^a-z0-9_]/gi, "").slice(0, 60),
      updatedAt: now,
    });
    if (draft.emailMessageId !== undefined) {
      await ctx.db.patch("emailMessages", draft.emailMessageId, {
        status: "failed",
        failureCode: args.failureCode.replace(/[^a-z0-9_]/gi, "").slice(0, 60),
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});
