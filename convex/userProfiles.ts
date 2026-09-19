import { mutation, query } from "./_generated/server";
import { getAuthenticatedUserId } from "./lib/authHelpers";
import { normalizeEmail } from "./lib/normalize";
import { v } from "convex/values";

export const ensureProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (existing !== null) {
      return existing;
    }

    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    const profileId = await ctx.db.insert("userProfiles", {
      ownerId,
      accountEmail: normalizeEmail(identity?.email ?? ""),
      globalInstructionVersion: 0,
      nextAvatarColorIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const profile = await ctx.db.get("userProfiles", profileId);
    if (profile === null) {
      throw new Error("NOT_FOUND");
    }
    return profile;
  },
});

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (profile === null) {
      return null;
    }

    let globalMemory: string | null = null;
    if (profile.globalInstructionVersionId !== undefined) {
      const version = await ctx.db.get(
        "instructionVersions",
        profile.globalInstructionVersionId,
      );
      if (
        version === null ||
        version.ownerId !== ownerId ||
        version.scope !== "global" ||
        version.botId !== undefined
      ) {
        throw new Error("NOT_FOUND");
      }
      globalMemory = version.content;
    }

    return {
      accountEmail: profile.accountEmail,
      globalMemory,
      globalInstructionVersion: profile.globalInstructionVersion,
    };
  },
});

export const updateGlobalMemory = mutation({
  args: { content: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const now = Date.now();
    let profile = await ctx.db
      .query("userProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();

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

    const content = args.content.trim();
    const previousVersionId = profile.globalInstructionVersionId;
    if (previousVersionId !== undefined) {
      const previousVersion = await ctx.db.get(
        "instructionVersions",
        previousVersionId,
      );
      if (
        previousVersion === null ||
        previousVersion.ownerId !== ownerId ||
        previousVersion.scope !== "global" ||
        previousVersion.botId !== undefined
      ) {
        throw new Error("NOT_FOUND");
      }
    }

    if (previousVersionId !== undefined) {
      await ctx.db.patch("instructionVersions", previousVersionId, {
        supersededAt: now,
      });
    }

    if (!content) {
      await ctx.db.patch("userProfiles", profile._id, {
        globalInstructionVersionId: undefined,
        updatedAt: now,
      });
      return { version: profile.globalInstructionVersion };
    }

    const version = profile.globalInstructionVersion + 1;
    const versionId = await ctx.db.insert("instructionVersions", {
      ownerId,
      scope: "global",
      version,
      content,
      createdAt: now,
    });
    await ctx.db.patch("userProfiles", profile._id, {
      globalInstructionVersionId: versionId,
      globalInstructionVersion: version,
      updatedAt: now,
    });
    return { version };
  },
});
