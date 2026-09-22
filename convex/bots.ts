import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  getAuthenticatedUserId,
  requireOwnedBot,
} from "./lib/authHelpers";
import { isValidEmail, normalizeEmail, usernameFromBotName } from "./lib/normalize";
import { compileTemplateMemory } from "./lib/templateFramework";
import { specificationFromDocument } from "./templateDrafts";
import { v } from "convex/values";

const DEFAULT_AVATAR_COLORS = 7;

// Failed provisioning never created a provider inbox, so it does not
// consume one of the three address slots.
const ADDRESS_LIMIT_STATUSES = new Set(["active", "pending", "creating"]);

async function cancelScheduledFunction(
  ctx: MutationCtx,
  id: Doc<"researchSchedules">["convexScheduledFunctionId"],
) {
  if (id === undefined) return;
  try {
    await ctx.scheduler.cancel(id);
  } catch {
    return;
  }
}

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
  const inbox =
    bot.emailInboxId === undefined
      ? await ctx.db
          .query("agentMailInboxes")
          .withIndex("by_owner_bot", (q) =>
            q.eq("ownerId", bot.ownerId).eq("botId", bot._id),
          )
          .unique()
      : await ctx.db.get("agentMailInboxes", bot.emailInboxId);
  if (inbox !== null && inbox.ownerId !== bot.ownerId) {
    throw new Error("NOT_FOUND");
  }

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
    emailCapability:
      inbox?.status === "active"
        ? "active"
        : inbox?.status === "failed"
          ? "failed"
          : bot.emailCapability === "disabled"
            ? "disabled"
            : "provisioning",
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

export const listEmailIdentities = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const inboxes = await ctx.db
      .query("agentMailInboxes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(20);
    return inboxes
      .filter((inbox) => ADDRESS_LIMIT_STATUSES.has(inbox.status))
      .map((inbox) => ({
        _id: inbox._id,
        address: inbox.confirmedAddress ?? null,
        desiredUsername: inbox.desiredUsername,
        status: inbox.status,
      }));
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

    const existingStorageOwnership = await ctx.db
      .query("storageOwnership")
      .withIndex("by_storage", (q) => q.eq("storageId", args.storageId))
      .unique();
    if (existingStorageOwnership !== null) {
      throw new Error("STORAGE_ALREADY_CLAIMED");
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

    await ctx.db.insert("storageOwnership", {
      ownerId,
      storageId: args.storageId,
      purpose: "avatar",
      createdAt: Date.now(),
    });
    await ctx.db.patch("avatarUploadClaims", claim._id, {
      storageId: args.storageId,
    });
    return { ok: true };
  },
});

export const createBot = mutation({
  args: {
    name: v.optional(v.string()),
    mission: v.optional(v.string()),
    memory: v.optional(v.string()),
    recipientEmail: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
    emailInboxId: v.optional(v.id("agentMailInboxes")),
    desiredEmailUsername: v.optional(v.string()),
    templateDraftId: v.optional(v.id("templateDrafts")),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);

    let sourceDraft: Doc<"templateDrafts"> | null = null;
    if (args.templateDraftId !== undefined) {
      if (args.memory !== undefined) {
        throw new Error("TEMPLATE_DRAFT_MEMORY_OVERRIDE");
      }
      sourceDraft = await ctx.db.get("templateDrafts", args.templateDraftId);
      if (
        sourceDraft === null ||
        sourceDraft.ownerId !== ownerId ||
        sourceDraft.status === "archived"
      ) {
        throw new Error("NOT_FOUND");
      }
    }

    const name = (
      sourceDraft !== null ? sourceDraft.name : args.name ?? ""
    ).trim();
    const mission = (
      sourceDraft !== null ? sourceDraft.mission : args.mission ?? ""
    ).trim();
    const memory =
      sourceDraft !== null
        ? compileTemplateMemory(
            specificationFromDocument(sourceDraft),
            (args.timezone ?? "UTC").trim().slice(0, 100) || "UTC",
          )
        : args.memory?.trim() ?? "";
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

    if (
      args.emailInboxId !== undefined &&
      args.desiredEmailUsername !== undefined
    ) {
      throw new Error("INVALID_EMAIL_IDENTITY_SELECTION");
    }
    let selectedInbox =
      args.emailInboxId === undefined
        ? null
        : await ctx.db.get("agentMailInboxes", args.emailInboxId);
    if (
      selectedInbox !== null &&
      (selectedInbox.ownerId !== ownerId || selectedInbox.status !== "active")
    ) {
      throw new Error("INVALID_EMAIL_IDENTITY_SELECTION");
    }
    if (args.emailInboxId !== undefined && selectedInbox === null) {
      throw new Error("INVALID_EMAIL_IDENTITY_SELECTION");
    }
    const inboxes = await ctx.db
      .query("agentMailInboxes")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(20);
    if (
      selectedInbox === null &&
      args.emailInboxId === undefined &&
      args.desiredEmailUsername === undefined
    ) {
      selectedInbox =
        inboxes.find((inbox) => inbox.status === "active") ??
        inboxes.find((inbox) =>
          ["pending", "creating"].includes(inbox.status),
        ) ??
        null;
    }
    if (selectedInbox === null) {
      const provisionedCount = inboxes.filter((inbox) =>
        ADDRESS_LIMIT_STATUSES.has(inbox.status),
      ).length;
      if (provisionedCount >= 3) {
        throw new Error("EMAIL_ADDRESS_LIMIT");
      }
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
      emailInboxId: selectedInbox?._id,
      instructionVersion: 0,
      avatarKind: args.avatarStorageId === undefined ? "default" : "upload",
      avatarColorIndex:
        args.avatarStorageId === undefined ? avatarColorIndex : undefined,
      avatarStorageId: args.avatarStorageId,
      emailCapability:
        selectedInbox?.status === "active" ? "active" : "provisioning",
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

    if (sourceDraft !== null) {
      await ctx.db.patch("templateDrafts", sourceDraft._id, {
        status: "published",
        deploymentCount: sourceDraft.deploymentCount + 1,
        lastDeployedBotId: botId,
        publishedAt: sourceDraft.publishedAt ?? now,
        updatedAt: now,
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

    if (selectedInbox === null) {
      const desiredUsername = usernameFromBotName(
        args.desiredEmailUsername ?? name,
      );
      const inboxId = await ctx.db.insert("agentMailInboxes", {
        ownerId,
        botId,
        desiredUsername,
        provisioningIdempotencyKey: botId,
        status: "pending",
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch("bots", botId, { emailInboxId: inboxId });
      await ctx.scheduler.runAfter(
        0,
        internal.workers.inboxProvisioner.provision,
        { inboxId },
      );
    }
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
    const now = Date.now();

    const activeSchedules = await ctx.db
      .query("researchSchedules")
      .withIndex("by_bot_status_next", (q) =>
        q.eq("botId", bot._id).eq("status", "active"),
      )
      .collect();
    for (const schedule of activeSchedules) {
      await cancelScheduledFunction(ctx, schedule.convexScheduledFunctionId);
      await ctx.db.patch("researchSchedules", schedule._id, {
        status: "paused",
        convexScheduledFunctionId: undefined,
        updatedAt: now,
      });
    }

    if (bot.status !== "archived") {
      await ctx.db.patch("bots", bot._id, {
        status: "archived",
        archivedAt: now,
        updatedAt: now,
      });
    }
    return { ok: true };
  },
});

export const retryEmailProvisioning = mutation({
  args: { botId: v.id("bots") },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const bot = await requireOwnedBot(ctx, ownerId, args.botId);
    const inbox =
      bot.emailInboxId === undefined
        ? await ctx.db
            .query("agentMailInboxes")
            .withIndex("by_owner_bot", (q) =>
              q.eq("ownerId", ownerId).eq("botId", bot._id),
            )
            .unique()
        : await ctx.db.get("agentMailInboxes", bot.emailInboxId);
    if (inbox === null || inbox.status !== "failed") {
      throw new Error("INVALID_PROVISIONING_STATE");
    }
    if (inbox.ownerId !== ownerId || inbox.botId !== bot._id) {
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
