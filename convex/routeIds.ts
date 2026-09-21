import { query } from "./_generated/server";
import { getAuthenticatedUserId } from "./lib/authHelpers";
import { v } from "convex/values";

export const resolveBotId = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await getAuthenticatedUserId(ctx);
    return ctx.db.normalizeId("bots", args.id);
  },
});

export const resolveChatId = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await getAuthenticatedUserId(ctx);
    return ctx.db.normalizeId("chats", args.id);
  },
});
