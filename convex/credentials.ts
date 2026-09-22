import { mutation, query } from "./_generated/server";
import { getAuthenticatedUserId } from "./lib/authHelpers";
import { encryptString } from "./lib/crypto";
import { v } from "convex/values";

export const getOpenAICredentialStatus = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const credential = await ctx.db
      .query("openaiCredentials")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();

    return {
      configured: credential?.status === "active",
      status: credential?.status ?? "missing",
      displayHint:
        credential === null || credential.status === "deleted"
          ? null
          : credential.displayHint,
      lastValidatedAt: credential?.lastValidatedAt ?? null,
    };
  },
});

export const upsertOpenAICredential = mutation({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const apiKey = args.apiKey.trim();
    if (!apiKey) {
      throw new Error("INVALID_OPENAI_KEY");
    }

    const encrypted = await encryptString(apiKey);
    const now = Date.now();
    const displayHint = apiKey.slice(-4);
    const existing = await ctx.db
      .query("openaiCredentials")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();

    if (existing === null) {
      await ctx.db.insert("openaiCredentials", {
        ownerId,
        ciphertext: encrypted.ciphertextB64,
        initializationVector: encrypted.ivB64,
        keyVersion: 1,
        displayHint,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("openaiCredentials", existing._id, {
        ciphertext: encrypted.ciphertextB64,
        initializationVector: encrypted.ivB64,
        authenticationTag: undefined,
        keyVersion: 1,
        displayHint,
        status: "active",
        lastValidatedAt: undefined,
        lastErrorCode: undefined,
        updatedAt: now,
        deletedAt: undefined,
      });
    }

    return { displayHint };
  },
});

export const deleteOpenAICredential = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const credential = await ctx.db
      .query("openaiCredentials")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (credential === null) {
      return { ok: true };
    }

    const now = Date.now();
    await ctx.db.patch("openaiCredentials", credential._id, {
      ciphertext: "",
      initializationVector: "",
      authenticationTag: undefined,
      status: "deleted",
      updatedAt: now,
      deletedAt: now,
    });
    return { ok: true };
  },
});

export const getProviderCredentialStatuses = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const openai = await ctx.db
      .query("openaiCredentials")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    return {
      openai: openai?.status === "active",
    };
  },
});
