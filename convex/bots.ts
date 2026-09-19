import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import {
  getAuthenticatedUserId,
  requireOwnedBot,
} from "./lib/authHelpers";
import { isValidEmail, normalizeEmail, usernameFromBotName } from "./lib/normalize";
import { v } from "convex/values";

const DEFAULT_AVATAR_COLORS = 7;

export type BotAvatar =
  | { kind: "default"; colorIndex: number }
  | { kind: "upload"; url: string | null };

export type BotSummary = {
  _id: Doc<"bots">["_id"];
  name: string;
  mission: string;
  emailCapability: Doc<"bots">["emailCapability"];
  emailAddress: string | null;
  avatar: BotAvatar;
  creationOrdinal: number;
  createdAt: number;
};

async function toBotSummary(
  ctx: QueryCtx,
  bot: Doc<"bots">,
): Promise<BotSummary> {
  const inbox = await ctx.db
    .query("agentMailInboxes")
    .withIndex("by_owner_bot", (q) =>
      q.eq("ownerId", bot.ownerId).eq("botId", bot._id),
    )
    .unique();

  let avatar: BotAvatar;
  if (bot.avatarKind === "default") {
    if (bot.avatarColorIndex === undefined) {
      throw new Error("NOT_FOUND");
    }
    avatar = { kind: "default", colorIndex: bot.avatarColorIndex };
  } else {
    if (bot.avatarStorageId === undefined) {
      throw new Error("NOT_FOUND");
    }
    avatar = {
      kind: "upload",
      url: await ctx.storage.getUrl(bot.avatarStorageId),
    };
  }

  return {
    _id: bot._id,
    name: bot.name,
    mission: bot.mission,
    emailCapability: bot.emailCapability,
    emailAddress:
      inbox?.status === "active" ? inbox.confirmedAddress ?? null : null,
    avatar,
    creationOrdinal: bot.creationOrdinal,
    createdAt: bot.createdAt,
  };
}

export const listBots = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const bots = await ctx.db
      .query("bots")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "active"),
      )
      .collect();
    return await Promise.all(bots.map((bot) => toBotSummary(ctx, bot)));
  },
});

export const getBot = query({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const bot = await requireOwnedBot(ctx, ownerId, args.botId);
    const summary = await toBotSummary(ctx, bot);

    let botMemory: string | null = null;
    if (bot.currentInstructionVersionId !== undefined) {
      const version = await ctx.db.get(
        "instructionVersions",
        bot.currentInstructionVersionId,
      );
      if (
        version === null ||
        version.ownerId !== ownerId ||
        version.scope !== "bot" ||
        version.botId !== bot._id
      ) {
        throw new Error("NOT_FOUND");
      }
      botMemory = version.content;
    }

    return {
      ...summary,
      recipientEmail: bot.recipientEmail,
      botMemory,
      instructionVersion: bot.instructionVersion,
      status: bot.status,
    };
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const token = crypto.randomUUID();
    const uploadUrl = await ctx.storage.generateUploadUrl();
    await ctx.db.insert("avatarUploadClaims", {
      ownerId,
      token,
      createdAt: Date.now(),
    });
    return { uploadUrl, token };
  },
});

export const finalizeAvatarUpload = mutation({
  args: {
    token: v.string(),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const claim = await ctx.db
      .query("avatarUploadClaims")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (
      claim === null ||
      claim.ownerId !== ownerId ||
      claim.storageId !== undefined ||
      claim.consumedByBotId !== undefined
    ) {
      throw new Error("NOT_FOUND");
    }

    const metadata = await ctx.storage.getMetadata(args.storageId);
    if (
      metadata === null ||
      metadata.contentType === null ||
      !metadata.contentType.toLowerCase().startsWith("image/") ||
      metadata.size > 2 * 1024 * 1024
    ) {
      throw new Error("INVALID_AVATAR");
    }

    await ctx.db.patch("avatarUploadClaims", claim._id, {
      storageId: args.storageId,
    });
    return { ok: true };
  },
});

export const createBot = mutation({
  args: {
    name: v.string(),
    mission: v.string(),
    memory: v.optional(v.string()),
    recipientEmail: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const name = args.name.trim();
    const mission = args.mission.trim();
    const memory = args.memory?.trim() ?? "";
    const recipientEmail = normalizeEmail(args.recipientEmail);
    if (!name || !mission || !recipientEmail) {
      throw new Error("INVALID_BOT_INPUT");
    }
    if (mission.length > 500) {
      throw new Error("MISSION_TOO_LONG");
    }
    if (!isValidEmail(recipientEmail)) {
      throw new Error("INVALID_EMAIL");
    }

    const existingBots = await ctx.db
      .query("bots")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    const emailEnabledCount = existingBots.filter(
      (bot) =>
        bot.emailCapability === "provisioning" ||
        bot.emailCapability === "active",
    ).length;
    if (emailEnabledCount >= 3) {
      throw new Error("EMAIL_BOT_LIMIT");
    }

    const lastBot = await ctx.db
      .query("bots")
      .withIndex("by_owner_creation_ordinal", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .first();
    const creationOrdinal = (lastBot?.creationOrdinal ?? 0) + 1;
    const avatarColorIndex = (creationOrdinal - 1) % DEFAULT_AVATAR_COLORS;

    const identity = await ctx.auth.getUserIdentity();
    let profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    const now = Date.now();
    if (profile === null) {
      const profileId = await ctx.db.insert("userProfiles", {
        ownerId,
        accountEmail: normalizeEmail(identity?.email ?? ""),
        globalInstructionVersion: 0,
        nextAvatarColorIndex: 0,
        createdAt: now,
        updatedAt: now,
      });
      profile = await ctx.db.get("userProfiles", profileId);
      if (profile === null) {
        throw new Error("NOT_FOUND");
      }
    }

    let avatarClaimId: Doc<"avatarUploadClaims">["_id"] | undefined;
    if (args.avatarStorageId !== undefined) {
      const claim = await ctx.db
        .query("avatarUploadClaims")
        .withIndex("by_storage", (q) => q.eq("storageId", args.avatarStorageId))
        .unique();
      if (
        claim === null ||
        claim.ownerId !== ownerId ||
        claim.storageId !== args.avatarStorageId ||
        claim.consumedByBotId !== undefined
      ) {
        throw new Error("INVALID_AVATAR");
      }
      avatarClaimId = claim._id;
    }

    const botId = await ctx.db.insert("bots", {
      ownerId,
      name,
      mission,
      recipientEmail,
      instructionVersion: 0,
      avatarKind: args.avatarStorageId === undefined ? "default" : "upload",
      avatarColorIndex:
        args.avatarStorageId === undefined ? avatarColorIndex : undefined,
      avatarStorageId: args.avatarStorageId,
      emailCapability: "provisioning",
      status: "active",
      creationOrdinal,
      createdAt: now,
      updatedAt: now,
    });

    if (memory) {
      const versionId = await ctx.db.insert("instructionVersions", {
        ownerId,
        scope: "bot",
        botId,
        version: 1,
        content: memory,
        createdAt: now,
      });
      await ctx.db.patch("bots", botId, {
        currentInstructionVersionId: versionId,
        instructionVersion: 1,
      });
    }

    if (avatarClaimId !== undefined) {
      await ctx.db.patch("avatarUploadClaims", avatarClaimId, {
        consumedByBotId: botId,
      });
    }

    await ctx.db.patch("userProfiles", profile._id, {
      nextAvatarColorIndex:
        (profile.nextAvatarColorIndex + 1) % DEFAULT_AVATAR_COLORS,
      updatedAt: now,
    });

    const inboxId = await ctx.db.insert("agentMailInboxes", {
      ownerId,
      botId,
      desiredUsername: usernameFromBotName(name),
      provisioningIdempotencyKey: botId,
      status: "pending",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.workers.inboxProvisioner.provision, {
      inboxId,
    });
    return { botId };
  },
});

export const updateBotMemory = mutation({
  args: { botId: v.id("bots"), content: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const bot = await requireOwnedBot(ctx, ownerId, args.botId);
    const content = args.content.trim();
    const now = Date.now();
    if (bot.currentInstructionVersionId !== undefined) {
      const previous = await ctx.db.get(
        "instructionVersions",
        bot.currentInstructionVersionId,
      );
      if (
        previous === null ||
        previous.ownerId !== ownerId ||
        previous.scope !== "bot" ||
        previous.botId !== bot._id
      ) {
        throw new Error("NOT_FOUND");
      }
      await ctx.db.patch("instructionVersions", previous._id, {
        supersededAt: now,
      });
    }

    const version = bot.instructionVersion + 1;
    if (!content) {
      await ctx.db.patch("bots", bot._id, {
        currentInstructionVersionId: undefined,
        instructionVersion: version,
        updatedAt: now,
      });
      return { version };
    }

    const versionId = await ctx.db.insert("instructionVersions", {
      ownerId,
      scope: "bot",
      botId: bot._id,
      version,
      content,
      createdAt: now,
    });
    await ctx.db.patch("bots", bot._id, {
      currentInstructionVersionId: versionId,
      instructionVersion: version,
      updatedAt: now,
    });
    return { version };
  },
});

export const archiveBot = mutation({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const bot = await requireOwnedBot(ctx, ownerId, args.botId);
    if (bot.status === "archived") {
      return { ok: true };
    }
    const now = Date.now();
    await ctx.db.patch("bots", bot._id, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const retryEmailProvisioning = mutation({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const bot = await requireOwnedBot(ctx, ownerId, args.botId);
    const inbox = await ctx.db
      .query("agentMailInboxes")
      .withIndex("by_owner_bot", (q) =>
        q.eq("ownerId", ownerId).eq("botId", bot._id),
      )
      .unique();
    if (inbox === null || inbox.status !== "failed") {
      throw new Error("INVALID_PROVISIONING_STATE");
    }
    if (bot.status !== "active") {
      throw new Error("NOT_FOUND");
    }

    await ctx.db.patch("agentMailInboxes", inbox._id, {
      status: "pending",
      lastErrorCode: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch("bots", bot._id, {
      emailCapability: "provisioning",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.workers.inboxProvisioner.provision, {
      inboxId: inbox._id,
    });
    return { ok: true };
  },
});
