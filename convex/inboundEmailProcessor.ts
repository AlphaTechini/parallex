import { internalMutation, type MutationCtx } from "./_generated/server";
import { providerForRun, type ProviderId } from "./lib/models";
import { getActiveProviderCredential } from "./lib/providerCredentials";
import { scheduleRunDrive } from "./lib/runScheduling";
import { mapRunStatusToUiStage } from "./lib/stageMap";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

const WATCHDOG_MS = 6 * 60 * 1000;
const DEFAULT_MODEL = "gpt-5.6-terra" as const;
const DEFAULT_EFFORT = "medium" as const;
const DEFAULT_ZHIPU_MODEL = "glm-5.3-flash" as const;
const DEFAULT_ZHIPU_EFFORT = "high" as const;
const NONTERMINAL_RUN_STATUSES = new Set([
  "accepted",
  "queued",
  "initializing_provider",
  "researching",
  "waiting_for_tool",
  "composing",
  "preparing_report",
  "sending_email",
]);

function normalizeSender(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

async function markWebhook(
  ctx: MutationCtx,
  eventId: Id<"webhookEvents">,
  fields: Partial<Doc<"webhookEvents">>,
) {
  await ctx.db.patch("webhookEvents", eventId, fields);
}

export const processInbound = internalMutation({
  args: {
    providerEventId: v.string(),
    eventType: v.string(),
    payloadHash: v.string(),
    providerInboxId: v.string(),
    providerMessageId: v.string(),
    providerThreadId: v.string(),
    fromAddress: v.string(),
    toAddresses: v.array(v.string()),
    subject: v.string(),
    extractedText: v.string(),
    providerTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_event", (q) =>
        q.eq("provider", "agentmail").eq("providerEventId", args.providerEventId),
      )
      .unique();
    if (duplicate !== null) {
      return { ok: true, duplicate: true, status: duplicate.status };
    }
    const now = Date.now();
    const webhookEventId = await ctx.db.insert("webhookEvents", {
      provider: "agentmail",
      providerEventId: args.providerEventId,
      eventType: args.eventType,
      signatureVerified: true,
      payloadHash: args.payloadHash,
      status: "processing",
      receivedAt: now,
    });

    if (args.eventType !== "message.received") {
      await markWebhook(ctx, webhookEventId, {
        status: "rejected",
        failureCode: "unsupported_event",
        processedAt: Date.now(),
      });
      return { ok: true, rejected: true };
    }
    const inbox = await ctx.db
      .query("agentMailInboxes")
      .withIndex("by_provider_inbox", (q) => q.eq("providerInboxId", args.providerInboxId))
      .unique();
    if (inbox === null || inbox.status !== "active") {
      await markWebhook(ctx, webhookEventId, {
        status: "rejected",
        failureCode: "inbox_not_active",
        processedAt: Date.now(),
      });
      return { ok: true, rejected: true };
    }
    const bot = await ctx.db.get("bots", inbox.botId);
    if (
      bot === null ||
      bot.ownerId !== inbox.ownerId ||
      bot.status !== "active" ||
      bot.emailCapability !== "active" ||
      inbox.confirmedAddress === undefined
    ) {
      await markWebhook(ctx, webhookEventId, {
        status: "rejected",
        failureCode: "sender_not_authorized",
        processedAt: Date.now(),
      });
      return { ok: true, rejected: true };
    }
    const content = args.extractedText.replace(/\u0000/g, "").trim().slice(0, 10_000);
    if (!content) {
      await markWebhook(ctx, webhookEventId, {
        status: "rejected",
        failureCode: "empty_message",
        processedAt: Date.now(),
      });
      return { ok: true, rejected: true };
    }
    const duplicateMessage = await ctx.db
      .query("emailMessages")
      .withIndex("by_provider_message", (q) => q.eq("providerMessageId", args.providerMessageId))
      .unique();
    if (duplicateMessage !== null) {
      await markWebhook(ctx, webhookEventId, {
        status: "processed",
        ownerId: duplicateMessage.ownerId,
        botId: duplicateMessage.botId,
        emailMessageId: duplicateMessage._id,
        processedAt: Date.now(),
      });
      return { ok: true, duplicate: true };
    }

    let chat: Doc<"chats"> | null = null;
    let thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_inbox_provider_thread", (q) =>
        q.eq("agentMailInboxId", inbox._id).eq("providerThreadId", args.providerThreadId),
      )
      .unique();
    if (thread !== null) {
      chat = await ctx.db.get("chats", thread.chatId);
      if (
        chat === null ||
        thread.ownerId !== inbox.ownerId ||
        thread.botId !== bot._id ||
        chat.ownerId !== inbox.ownerId ||
        chat.botId !== bot._id ||
        chat.status !== "active" ||
        normalizeSender(args.fromAddress) !== thread.authorizedSenderEmail
      ) {
        await markWebhook(ctx, webhookEventId, {
          status: "rejected",
          failureCode: "thread_mapping_invalid",
          processedAt: Date.now(),
        });
        return { ok: true, rejected: true };
      }
    } else {
      if (normalizeSender(args.fromAddress) !== bot.recipientEmail) {
        await markWebhook(ctx, webhookEventId, {
          status: "rejected",
          failureCode: "sender_not_authorized",
          processedAt: Date.now(),
        });
        return { ok: true, rejected: true };
      }
      const chatId = await ctx.db.insert("chats", {
        ownerId: inbox.ownerId,
        botId: bot._id,
        titleLocked: false,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      chat = await ctx.db.get("chats", chatId);
      if (chat === null) throw new Error("CHAT_NOT_FOUND");
      const threadId = await ctx.db.insert("emailThreads", {
        ownerId: inbox.ownerId,
        botId: bot._id,
        chatId,
        agentMailInboxId: inbox._id,
        providerThreadId: args.providerThreadId,
        authorizedSenderEmail: bot.recipientEmail,
        status: "active",
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      thread = await ctx.db.get("emailThreads", threadId);
      if (thread === null) throw new Error("EMAIL_THREAD_NOT_FOUND");
    }

    const latestRun = await ctx.db
      .query("researchRuns")
      .withIndex("by_chat_created", (q) => q.eq("chatId", chat!._id))
      .order("desc")
      .first();
    const ownedLatestRun = latestRun?.ownerId === inbox.ownerId ? latestRun : null;
    const [openaiCredential, zhipuCredential] = await Promise.all([
      getActiveProviderCredential(ctx, inbox.ownerId, "openai"),
      getActiveProviderCredential(ctx, inbox.ownerId, "zhipu"),
    ]);
    let provider: ProviderId =
      ownedLatestRun === null ? "openai" : providerForRun(ownedLatestRun);
    if (provider === "openai" && openaiCredential === null && zhipuCredential !== null) {
      provider = "zhipu";
    } else if (
      provider === "zhipu" &&
      zhipuCredential === null &&
      openaiCredential !== null
    ) {
      provider = "openai";
    }
    const preservesLatestProvider =
      ownedLatestRun !== null && provider === providerForRun(ownedLatestRun);
    const model =
      (preservesLatestProvider ? ownedLatestRun.model : undefined) ??
      (provider === "zhipu" ? DEFAULT_ZHIPU_MODEL : DEFAULT_MODEL);
    const reasoningEffort =
      (preservesLatestProvider ? ownedLatestRun.reasoningEffort : undefined) ??
      (provider === "zhipu" ? DEFAULT_ZHIPU_EFFORT : DEFAULT_EFFORT);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", inbox.ownerId))
      .unique();
    const globalInstructionVersionId = profile?.globalInstructionVersionId;
    const botInstructionVersionId = bot.currentInstructionVersionId;
    const queuedRun =
      chat.activeRunId === undefined
        ? null
        : await ctx.db.get("researchRuns", chat.activeRunId);
    const queued =
      queuedRun !== null &&
      queuedRun.ownerId === inbox.ownerId &&
      queuedRun.botId === bot._id &&
      queuedRun.chatId === chat._id &&
      NONTERMINAL_RUN_STATUSES.has(queuedRun.status);
    const emailMessageId = await ctx.db.insert("emailMessages", {
      ownerId: inbox.ownerId,
      botId: bot._id,
      chatId: chat._id,
      threadId: thread._id,
      direction: "inbound",
      providerMessageId: args.providerMessageId,
      providerThreadId: args.providerThreadId,
      idempotencyKey: `inbound:${args.providerMessageId}`,
      fromAddress: normalizeSender(args.fromAddress),
      toAddresses: args.toAddresses.length > 0 ? args.toAddresses.slice(0, 20) : [inbox.confirmedAddress],
      subject: args.subject.replace(/\u0000/g, "").trim().slice(0, 300),
      plainTextBody: content,
      status: "processed",
      providerTimestamp: args.providerTimestamp,
      createdAt: now,
      updatedAt: now,
    });
    const messageId = await ctx.db.insert("messages", {
      ownerId: inbox.ownerId,
      botId: bot._id,
      chatId: chat._id,
      role: "user",
      origin: "email",
      content,
      emailMessageId,
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    const runId = await ctx.db.insert("researchRuns", {
      ownerId: inbox.ownerId,
      botId: bot._id,
      chatId: chat._id,
      triggerMessageId: messageId,
      triggerKind: "email",
      provider,
      model,
      reasoningEffort,
      globalInstructionVersionId,
      botInstructionVersionId,
      researchProtocolVersion: 1,
      workerGeneration: 0,
      cancelRequested: false,
      status: queued ? "queued" : "accepted",
      currentStage: mapRunStatusToUiStage(queued ? "queued" : "accepted"),
      createdAt: now,
      updatedAt: now,
    });
    const assistantMessageId = await ctx.db.insert("messages", {
      ownerId: inbox.ownerId,
      botId: bot._id,
      chatId: chat._id,
      runId,
      role: "assistant",
      origin: "email",
      content: "",
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("messages", messageId, { runId });
    await ctx.db.patch("researchRuns", runId, { assistantMessageId });
    await ctx.db.patch("emailMessages", emailMessageId, { runId });
    await ctx.db.patch("emailThreads", thread._id, { lastMessageAt: now, updatedAt: now });
    await markWebhook(ctx, webhookEventId, {
      status: "processed",
      ownerId: inbox.ownerId,
      botId: bot._id,
      runId,
      emailMessageId,
      processedAt: Date.now(),
    });
    if (!queued) {
      await ctx.db.patch("chats", chat._id, {
        activeRunId: runId,
        lastMessageAt: now,
        updatedAt: now,
      });
      const run = { _id: runId, provider, model };
      await scheduleRunDrive(ctx, run, 1, 0);
      await scheduleRunDrive(ctx, run, 2, WATCHDOG_MS);
    }
    return { ok: true, runId, queued };
  },
});
