import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  getAuthenticatedUserId,
  requireOwnedBot,
  requireOwnedChat,
} from "./lib/authHelpers";
import { isValidEffort, isValidModel } from "./lib/models";
import { sha256Hex } from "./lib/normalize";
import { mapRunStatusToUiStage } from "./lib/stageMap";
import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

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

const driveRun = makeFunctionReference<"action">("workers/runWorker:drive");

export const listMessages = query({
  args: {
    chatId: v.id("chats"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    await requireOwnedChat(ctx, ownerId, args.chatId);
    const page = await ctx.db
      .query("messages")
      .withIndex("by_owner_chat_created", (q) =>
        q.eq("ownerId", ownerId).eq("chatId", args.chatId),
      )
      .order("asc")
      .paginate(args.paginationOpts);

    const messages = await Promise.all(
      page.page.map(async (message) => {
        const attachments = await ctx.db
          .query("messageAttachments")
          .withIndex("by_message", (q) => q.eq("messageId", message._id))
          .collect();
        return {
          _id: message._id,
          role: message.role,
          origin: message.origin,
          content: message.content,
          status: message.status,
          createdAt: message.createdAt,
          runId: message.runId ?? null,
          attachments: attachments
            .filter(
              (attachment) =>
                attachment.ownerId === ownerId &&
                attachment.chatId === args.chatId,
            )
            .map((attachment) => ({
              _id: attachment._id,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              status: attachment.status,
            })),
        };
      }),
    );

    return {
      page: messages,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const submitPrompt = mutation({
  args: {
    chatId: v.id("chats"),
    content: v.string(),
    model: v.string(),
    reasoningEffort: v.string(),
    clientSubmissionId: v.string(),
    attachmentIds: v.optional(v.array(v.id("messageAttachments"))),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const chat = await requireOwnedChat(ctx, ownerId, args.chatId);
    if (chat.status === "deleted") {
      throw new Error("CHAT_DELETED");
    }
    const bot = await requireOwnedBot(ctx, ownerId, chat.botId);
    if (bot.status !== "active") {
      throw new Error("BOT_ARCHIVED");
    }

    const credential = await ctx.db
      .query("openaiCredentials")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "active"),
      )
      .first();
    if (credential === null) {
      throw new Error("NO_OPENAI_KEY");
    }

    if (!isValidModel(args.model)) {
      throw new Error("INVALID_MODEL");
    }
    if (!isValidEffort(args.model, args.reasoningEffort)) {
      throw new Error("INVALID_REASONING_EFFORT");
    }

    const content = args.content.trim();
    const clientSubmissionId = args.clientSubmissionId.trim();
    if (!content) {
      throw new Error("EMPTY_PROMPT");
    }
    if (!clientSubmissionId) {
      throw new Error("INVALID_SUBMISSION");
    }

    const attachmentIds = args.attachmentIds ?? [];
    if (new Set(attachmentIds).size !== attachmentIds.length) {
      throw new Error("DUPLICATE_ATTACHMENT");
    }
    const attachments: Array<Doc<"messageAttachments">> = [];
    for (const attachmentId of attachmentIds) {
      const attachment = await ctx.db.get("messageAttachments", attachmentId);
      if (attachment === null || attachment.ownerId !== ownerId) {
        throw new Error("ATTACHMENT_NOT_AVAILABLE");
      }
      attachments.push(attachment);
    }

    const requestHash = await sha256Hex(
      JSON.stringify({
        chatId: chat._id,
        content,
        model: args.model,
        reasoningEffort: args.reasoningEffort,
        attachments: attachments.map((attachment) => ({
          id: attachment._id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        })),
      }),
    );
    const existingMessage = await ctx.db
      .query("messages")
      .withIndex("by_owner_submission", (q) =>
        q.eq("ownerId", ownerId).eq("clientSubmissionId", clientSubmissionId),
      )
      .first();
    if (existingMessage !== null) {
      if (
        existingMessage.requestHash === requestHash &&
        existingMessage.runId !== undefined
      ) {
        return {
          messageId: existingMessage._id,
          runId: existingMessage.runId,
        };
      }
      throw new Error("SUBMISSION_CONFLICT");
    }

    for (const attachment of attachments) {
      if (
        attachment.status !== "uploaded" ||
        attachment.chatId !== undefined ||
        attachment.messageId !== undefined ||
        attachment.runId !== undefined
      ) {
        throw new Error("ATTACHMENT_NOT_AVAILABLE");
      }
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    const globalInstructionVersionId = profile?.globalInstructionVersionId;
    if (globalInstructionVersionId !== undefined) {
      const globalVersion = await ctx.db.get(
        "instructionVersions",
        globalInstructionVersionId,
      );
      if (
        globalVersion === null ||
        globalVersion.ownerId !== ownerId ||
        globalVersion.scope !== "global" ||
        globalVersion.botId !== undefined
      ) {
        throw new Error("NOT_FOUND");
      }
    }

    const botInstructionVersionId = bot.currentInstructionVersionId;
    if (botInstructionVersionId !== undefined) {
      const botVersion = await ctx.db.get(
        "instructionVersions",
        botInstructionVersionId,
      );
      if (
        botVersion === null ||
        botVersion.ownerId !== ownerId ||
        botVersion.scope !== "bot" ||
        botVersion.botId !== bot._id
      ) {
        throw new Error("NOT_FOUND");
      }
    }

    let queued = false;
    if (chat.activeRunId !== undefined) {
      const activeRun = await ctx.db.get("researchRuns", chat.activeRunId);
      if (
        activeRun !== null &&
        activeRun.ownerId === ownerId &&
        activeRun.botId === bot._id &&
        activeRun.chatId === chat._id &&
        NONTERMINAL_RUN_STATUSES.has(activeRun.status)
      ) {
        queued = true;
      } else {
        await ctx.db.patch("chats", chat._id, { activeRunId: undefined });
      }
    }

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      ownerId,
      botId: bot._id,
      chatId: chat._id,
      role: "user",
      origin: "web",
      content,
      clientSubmissionId,
      requestHash,
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    const runStatus = queued ? "queued" : "accepted";
    const runId = await ctx.db.insert("researchRuns", {
      ownerId,
      botId: bot._id,
      chatId: chat._id,
      triggerMessageId: messageId,
      triggerKind: "web",
      model: args.model,
      reasoningEffort: args.reasoningEffort,
      globalInstructionVersionId,
      botInstructionVersionId,
      researchProtocolVersion: 1,
      workerGeneration: 0,
      cancelRequested: false,
      status: runStatus,
      currentStage: mapRunStatusToUiStage(runStatus),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("messages", messageId, { runId });

    const assistantMessageId = await ctx.db.insert("messages", {
      ownerId,
      botId: bot._id,
      chatId: chat._id,
      runId,
      role: "assistant",
      origin: "web",
      content: "",
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("researchRuns", runId, { assistantMessageId });

    for (const attachment of attachments) {
      await ctx.db.patch("messageAttachments", attachment._id, {
        chatId: chat._id,
        messageId,
        runId,
        status: "bound",
        updatedAt: now,
      });
    }

    await ctx.db.patch("chats", chat._id, {
      activeRunId: queued ? chat.activeRunId : runId,
      lastMessageAt: now,
      updatedAt: now,
    });

    if (!queued) {
      await ctx.scheduler.runAfter(0, driveRun, { runId, generation: 1 });
      await ctx.scheduler.runAfter(6 * 60 * 1000, driveRun, {
        runId,
        generation: 2,
      });
    }

    return { messageId, runId };
  },
});
