import { describe, expect, it, vi } from "vitest";

import { api } from "../convex/_generated/api";
import {
  asUser,
  identities,
  makeTest,
  readRows,
  seedStorage,
  seedUser,
  seedWorld,
} from "./helpers";

async function disableEmailProvisioning(t: ReturnType<typeof makeTest>, botId: string) {
  await t.run(async (ctx) => {
    await ctx.db.patch("bots", botId as never, { emailCapability: "disabled" });
  });
}

describe("avatar and research upload validation", () => {
  it("consumes uploaded-avatar ordinals and follows the seven-color sequence", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const owner = await seedUser(t, identities.ownerA, "Owner A");
      const asOwner = asUser(t, owner);
      const createdBotIds: string[] = [];

      const first = await asOwner.mutation(api.bots.createBot, {
        name: "Bot 1",
        mission: "Mission 1",
        recipientEmail: owner.email,
      });
      createdBotIds.push(first.botId);
      await disableEmailProvisioning(t, first.botId);

      const upload = await asOwner.mutation(api.bots.generateAvatarUploadUrl, {});
      const uploadStorageId = await seedStorage(t, "image/png", 128);
      await t.run(async (ctx) => {
        const claim = await ctx.db
          .query("avatarUploadClaims")
          .withIndex("by_token", (q) => q.eq("token", upload.token))
          .unique();
        await ctx.db.patch("avatarUploadClaims", claim!._id, {
          storageId: uploadStorageId,
        });
      });
      const second = await asOwner.mutation(api.bots.createBot, {
        name: "Bot 2",
        mission: "Mission 2",
        recipientEmail: owner.email,
        avatarStorageId: uploadStorageId,
      });
      createdBotIds.push(second.botId);
      await disableEmailProvisioning(t, second.botId);

      for (let ordinal = 3; ordinal <= 8; ordinal += 1) {
        const created = await asOwner.mutation(api.bots.createBot, {
          name: `Bot ${ordinal}`,
          mission: `Mission ${ordinal}`,
          recipientEmail: owner.email,
        });
        createdBotIds.push(created.botId);
        await disableEmailProvisioning(t, created.botId);
      }

      const bots = (await readRows(t, "bots"))
        .filter((bot) => bot.ownerId === owner.userId)
        .sort((left, right) => left.creationOrdinal - right.creationOrdinal);
      expect(bots.map((bot) => bot._id)).toEqual(createdBotIds);
      expect(bots.map((bot) => bot.creationOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(bots.map((bot) => bot.avatarColorIndex)).toEqual([
        0,
        undefined,
        2,
        3,
        4,
        5,
        6,
        0,
      ]);
      expect(bots[1].avatarStorageId).toBe(uploadStorageId);
      expect(bots[1]).not.toHaveProperty("avatarUrl");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps concurrent bot creation ordinals and palette positions distinct", async () => {
    vi.useFakeTimers();
    try {
      const t = makeTest();
      const owner = await seedUser(t, identities.ownerA, "Owner A");
      const asOwner = asUser(t, owner);
      const created = await Promise.all([
        asOwner.mutation(api.bots.createBot, {
          name: "Concurrent One",
          mission: "First",
          recipientEmail: owner.email,
        }),
        asOwner.mutation(api.bots.createBot, {
          name: "Concurrent Two",
          mission: "Second",
          recipientEmail: owner.email,
        }),
      ]);
      for (const bot of created) await disableEmailProvisioning(t, bot.botId);

      const bots = (await readRows(t, "bots"))
        .filter((bot) => bot.ownerId === owner.userId)
        .sort((left, right) => left.creationOrdinal - right.creationOrdinal);
      expect(bots.map((bot) => bot.creationOrdinal)).toEqual([1, 2]);
      expect(bots.map((bot) => bot.avatarColorIndex)).toEqual([0, 1]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not allow avatar upload claims to cross tenants or be reused", async () => {
    const t = makeTest();
    const ownerA = await seedUser(t, identities.ownerA, "Owner A");
    const ownerB = await seedUser(t, identities.ownerB, "Owner B");
    const asA = asUser(t, ownerA);
    const asB = asUser(t, ownerB);
    const upload = await asA.mutation(api.bots.generateAvatarUploadUrl, {});
    const storageId = await seedStorage(t, "image/png", 256);

    await expect(
      asB.mutation(api.bots.finalizeAvatarUpload, {
        token: upload.token,
        storageId,
      }),
    ).rejects.toThrow("NOT_FOUND");
    await t.run(async (ctx) => {
      const claim = await ctx.db
        .query("avatarUploadClaims")
        .withIndex("by_token", (q) => q.eq("token", upload.token))
        .unique();
      await ctx.db.patch("avatarUploadClaims", claim!._id, {
        storageId,
      });
    });
    vi.useFakeTimers();
    try {
      const firstBot = await asA.mutation(api.bots.createBot, {
        name: "Owned Avatar Bot",
        mission: "Own the upload",
        recipientEmail: ownerA.email,
        avatarStorageId: storageId,
      });
      await disableEmailProvisioning(t, firstBot.botId);
      await expect(
        asA.mutation(api.bots.createBot, {
          name: "Reused Avatar Bot",
          mission: "Reuse the upload",
          recipientEmail: ownerA.email,
          avatarStorageId: storageId,
        }),
      ).rejects.toThrow("INVALID_AVATAR");
    } finally {
      vi.useRealTimers();
    }
    await expect(
      asB.mutation(api.bots.createBot, {
        name: "Foreign Avatar Bot",
        mission: "Should not claim the upload",
        recipientEmail: ownerB.email,
        avatarStorageId: storageId,
      }),
    ).rejects.toThrow("INVALID_AVATAR");
  });

  it.skip("rejects non-image and oversized avatar files", () => {
    // convex-test 0.0.59 does not implement the storageGetMetadata syscall used by this validator.
  });

  it("rejects unsupported research attachment names before storage metadata is read", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const asOwner = asUser(t, owner);
    const invalidTypeClaim = await asOwner.mutation(
      api.attachments.generateResearchUploadUrl,
      {},
    );
    const invalidTypeStorageId = await seedStorage(t, "application/octet-stream", 100);
    await expect(
      asOwner.mutation(api.attachments.finalizeResearchUpload, {
        token: invalidTypeClaim.token,
        storageId: invalidTypeStorageId,
        fileName: "payload.exe",
        mimeType: "application/octet-stream",
      }),
    ).rejects.toThrow("UNSUPPORTED_RESEARCH_FILE");
  });

  it("binds a valid research attachment once and rejects a second binding", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const asOwner = asUser(t, owner);
    const validStorageId = await seedStorage(t, "application/pdf", 10 * 1024 * 1024);
    const world = await seedWorld(t, owner, { botName: "Attachment Bot" });
    const validAttachmentId = await t.run(async (ctx) =>
      ctx.db.insert("messageAttachments", {
        ownerId: owner.userId,
        storageId: validStorageId,
        fileName: "paper.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10 * 1024 * 1024,
        status: "uploaded",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const firstRun = await asOwner.mutation(api.messages.submitPrompt, {
      chatId: world.chatId,
      content: "Parse this attachment",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      clientSubmissionId: "attachment-first",
      attachmentIds: [validAttachmentId],
    });
    expect(firstRun.runId).toEqual(expect.any(String));
    await expect(
      asOwner.mutation(api.messages.submitPrompt, {
        chatId: world.chatId,
        content: "Reuse the same attachment",
        model: "gpt-5.6-terra",
        reasoningEffort: "medium",
        clientSubmissionId: "attachment-second",
        attachmentIds: [validAttachmentId],
      }),
    ).rejects.toThrow("ATTACHMENT_NOT_AVAILABLE");
    const attachment = await t.run(async (ctx) =>
      ctx.db.get("messageAttachments", validAttachmentId),
    );
    expect(attachment?.status).toBe("bound");
    expect(attachment?.runId).toBe(firstRun.runId);
  });

  it.skip("enforces Convex storage MIME and size limits for avatars and research files", () => {
    // convex-test 0.0.59 does not implement the storageGetMetadata syscall used by these validators.
  });
});
