import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const loadById = internalMutation({
  args: { inboxId: v.id("agentMailInboxes") },
  handler: async (ctx, args) => {
    const inbox = await ctx.db.get("agentMailInboxes", args.inboxId);
    if (inbox === null) {
      throw new Error("NOT_FOUND");
    }
    const bot = await ctx.db.get("bots", inbox.botId);
    if (bot === null || bot.ownerId !== inbox.ownerId) {
      throw new Error("NOT_FOUND");
    }
    return { inbox, bot };
  },
});

export const markCreating = internalMutation({
  args: { inboxId: v.id("agentMailInboxes") },
  handler: async (ctx, args) => {
    const inbox = await ctx.db.get("agentMailInboxes", args.inboxId);
    if (inbox === null || inbox.status === "deleted") {
      throw new Error("NOT_FOUND");
    }
    const bot = await ctx.db.get("bots", inbox.botId);
    if (bot === null || bot.ownerId !== inbox.ownerId) {
      throw new Error("NOT_FOUND");
    }
    await ctx.db.patch("agentMailInboxes", inbox._id, {
      status: "creating",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const markActive = internalMutation({
  args: {
    inboxId: v.id("agentMailInboxes"),
    providerInboxId: v.string(),
    confirmedAddress: v.string(),
    providerDomainId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inbox = await ctx.db.get("agentMailInboxes", args.inboxId);
    if (inbox === null || inbox.status === "deleted") {
      throw new Error("NOT_FOUND");
    }
    const bot = await ctx.db.get("bots", inbox.botId);
    if (
      bot === null ||
      bot.ownerId !== inbox.ownerId ||
      bot.status !== "active"
    ) {
      throw new Error("NOT_FOUND");
    }

    await ctx.db.patch("agentMailInboxes", inbox._id, {
      providerInboxId: args.providerInboxId,
      confirmedAddress: args.confirmedAddress,
      providerDomainId: args.providerDomainId,
      status: "active",
      lastErrorCode: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch("bots", bot._id, {
      emailCapability: "active",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const markFailed = internalMutation({
  args: {
    inboxId: v.id("agentMailInboxes"),
    errorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const inbox = await ctx.db.get("agentMailInboxes", args.inboxId);
    if (inbox === null || inbox.status === "deleted") {
      throw new Error("NOT_FOUND");
    }
    const bot = await ctx.db.get("bots", inbox.botId);
    if (bot === null || bot.ownerId !== inbox.ownerId) {
      throw new Error("NOT_FOUND");
    }

    const now = Date.now();
    await ctx.db.patch("agentMailInboxes", inbox._id, {
      status: "failed",
      attemptCount: inbox.attemptCount + 1,
      lastErrorCode: args.errorCode,
      updatedAt: now,
    });
    await ctx.db.patch("bots", bot._id, {
      emailCapability: "failed",
      updatedAt: now,
    });
    return { ok: true };
  },
});
