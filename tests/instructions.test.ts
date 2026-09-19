import { describe, expect, it } from "vitest";

import { api } from "../convex/_generated/api";
import {
  MANDATORY_RESEARCH_PROTOCOL,
  buildResearchInstructions,
} from "../convex/prompts/researchProtocol";
import {
  asUser,
  identities,
  makeTest,
  readRows,
  seedUser,
  seedWorld,
} from "./helpers";

describe("instruction composition and version snapshots", () => {
  it("excludes bot mission and preserves mandatory, global, then bot ordering", () => {
    const instructions = buildResearchInstructions({
      globalMemory: "GLOBAL_MEMORY_SENTINEL",
      botMemory: "BOT_MEMORY_SENTINEL",
    });

    expect(instructions.startsWith(MANDATORY_RESEARCH_PROTOCOL)).toBe(true);
    expect(instructions.indexOf("GLOBAL_MEMORY_SENTINEL")).toBeGreaterThan(
      instructions.indexOf(MANDATORY_RESEARCH_PROTOCOL),
    );
    expect(instructions.indexOf("BOT_MEMORY_SENTINEL")).toBeGreaterThan(
      instructions.indexOf("GLOBAL_MEMORY_SENTINEL"),
    );
    expect(instructions).not.toContain("Research public evidence and write clear reports.");
    expect(instructions).not.toContain("mission");
  });

  it("creates immutable global and bot versions instead of editing existing records", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const asOwner = asUser(t, owner);

    await asOwner.mutation(api.userProfiles.updateGlobalMemory, {
      content: "global version one",
    });
    await asOwner.mutation(api.userProfiles.updateGlobalMemory, {
      content: "global version two",
    });
    await asOwner.mutation(api.bots.updateBotMemory, {
      botId: world.botId,
      content: "bot version two",
    });

    const versions = await readRows(t, "instructionVersions");
    const globalVersions = versions
      .filter((version) => version.scope === "global")
      .sort((left, right) => left.version - right.version);
    const botVersions = versions
      .filter((version) => version.scope === "bot")
      .sort((left, right) => left.version - right.version);

    expect(globalVersions.map((version) => version.content)).toEqual([
      "global version one",
      "global version two",
    ]);
    expect(globalVersions[0].supersededAt).toEqual(expect.any(Number));
    expect(globalVersions[1].supersededAt).toBeUndefined();
    expect(botVersions.map((version) => version.content)).toEqual([
      "bot version two",
    ]);
    expect(botVersions[0].ownerId).toBe(owner.userId);
    expect(botVersions[0].botId).toBe(world.botId);
  });

  it("keeps the original instruction version references on an existing run", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner, {
      globalMemory: "global before run",
      botMemory: "bot before run",
    });
    const asOwner = asUser(t, owner);
    const globalBefore = await t.run(async (ctx) =>
      ctx.db
        .query("instructionVersions")
        .withIndex("by_owner_scope_version", (q) =>
          q.eq("ownerId", owner.userId).eq("scope", "global").eq("version", 1),
        )
        .unique(),
    );
    const botBefore = await t.run(async (ctx) =>
      ctx.db
        .query("instructionVersions")
        .withIndex("by_bot_version", (q) =>
          q.eq("botId", world.botId).eq("version", 1),
        )
        .unique(),
    );

    const submission = await asOwner.mutation(api.messages.submitPrompt, {
      chatId: world.chatId,
      content: "Snapshot these instructions",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      clientSubmissionId: "snapshot-run",
    });
    await asOwner.mutation(api.userProfiles.updateGlobalMemory, {
      content: "global after run",
    });
    await asOwner.mutation(api.bots.updateBotMemory, {
      botId: world.botId,
      content: "bot after run",
    });

    const run = await t.run(async (ctx) => ctx.db.get("researchRuns", submission.runId));
    expect(run?.globalInstructionVersionId).toBe(globalBefore?._id);
    expect(run?.botInstructionVersionId).toBe(botBefore?._id);
    const storedGlobalBefore = await t.run(async (ctx) =>
      ctx.db.get("instructionVersions", globalBefore!._id),
    );
    const storedBotBefore = await t.run(async (ctx) =>
      ctx.db.get("instructionVersions", botBefore!._id),
    );
    expect(storedGlobalBefore?.content).toBe("global before run");
    expect(storedBotBefore?.content).toBe("bot before run");
  });

  it("rejects cross-owner global and bot instruction pointers", async () => {
    const t = makeTest();
    const ownerA = await seedUser(t, identities.ownerA, "Owner A");
    const ownerB = await seedUser(t, identities.ownerB, "Owner B");
    const worldA = await seedWorld(t, ownerA);
    const worldB = await seedWorld(t, ownerB, {
      globalMemory: "owner B global",
      botMemory: "owner B bot",
    });
    const foreignVersions = await t.run(async (ctx) => {
      const profileB = await ctx.db
        .query("userProfiles")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerB.userId))
        .unique();
      const botB = await ctx.db.get("bots", worldB.botId);
      return {
        globalId: profileB!.globalInstructionVersionId!,
        botId: botB!.currentInstructionVersionId!,
      };
    });

    await t.run(async (ctx) => {
      const profileA = await ctx.db
        .query("userProfiles")
        .withIndex("by_owner", (q) => q.eq("ownerId", ownerA.userId))
        .unique();
      await ctx.db.patch("userProfiles", profileA!._id, {
        globalInstructionVersionId: foreignVersions.globalId,
      });
      await ctx.db.patch("bots", worldA.botId, {
        currentInstructionVersionId: foreignVersions.botId,
      });
    });

    await expect(
      asUser(t, ownerA).mutation(api.messages.submitPrompt, {
        chatId: worldA.chatId,
        content: "Use only my instructions",
        model: "gpt-5.6-terra",
        reasoningEffort: "medium",
        clientSubmissionId: "foreign-instruction",
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
