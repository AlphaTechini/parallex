import { mutation, query } from "./_generated/server";
import {
  getAuthenticatedUserId,
  requireOwnedBot,
  requireOwnedChat,
} from "./lib/authHelpers";
import { paginationOptsValidator } from "convex/server";
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

export const listChats = query({
  args: {
    botId: v.id("bots"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    await requireOwnedBot(ctx, ownerId, args.botId);
    const page = await ctx.db
      .query("chats")
      .withIndex("by_owner_bot_updated", (q) =>
        q.eq("ownerId", ownerId).eq("botId", args.botId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const chats = await Promise.all(
      page.page.map(async (chat) => {
        let activeRunStatus: string | null = null;
        if (chat.activeRunId !== undefined) {
          const run = await ctx.db.get("researchRuns", chat.activeRunId);
          if (
            run !== null &&
            run.ownerId === ownerId &&
            run.botId === chat.botId &&
            run.chatId === chat._id
          ) {
            activeRunStatus = run.status;
          }
        }
        return {
          _id: chat._id,
          title: chat.title ?? null,
          lastMessageAt: chat.lastMessageAt ?? null,
          activeRunStatus,
        };
      }),
    );

    return {
      page: chats,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const createChat = mutation({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const bot = await requireOwnedBot(ctx, ownerId, args.botId);
    if (bot.status !== "active") {
      throw new Error("NOT_FOUND");
    }

    const now = Date.now();
    const chatId = await ctx.db.insert("chats", {
      ownerId,
      botId: bot._id,
      titleLocked: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    return { chatId };
  },
});

export const getChat = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const chat = await requireOwnedChat(ctx, ownerId, args.chatId);
    return {
      _id: chat._id,
      botId: chat.botId,
      title: chat.title ?? null,
      titleLocked: chat.titleLocked,
      activeRunId: chat.activeRunId ?? null,
      createdAt: chat.createdAt,
    };
  },
});

export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const chat = await requireOwnedChat(ctx, ownerId, args.chatId);
    if (chat.activeRunId !== undefined) {
      const run = await ctx.db.get("researchRuns", chat.activeRunId);
      if (
        run !== null &&
        run.ownerId === ownerId &&
        run.botId === chat.botId &&
        run.chatId === chat._id &&
        NONTERMINAL_RUN_STATUSES.has(run.status)
      ) {
        throw new Error("RUN_ACTIVE");
      }
    }

    await ctx.db.patch("chats", chat._id, {
      status: "deleted",
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
