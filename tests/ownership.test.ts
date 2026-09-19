import { describe, expect, it } from "vitest";

import { api, internal } from "../convex/_generated/api";
import {
  asUser,
  identities,
  makeReportFixture,
  makeTest,
  readRows,
  seedRun,
  seedToolCall,
  seedUser,
  seedWorld,
} from "./helpers";

describe("tenant ownership and lifecycle guards", () => {
  it("does not let owner A query or mutate owner B records", async () => {
    const t = makeTest();
    const ownerA = await seedUser(t, identities.ownerA, "Owner A");
    const ownerB = await seedUser(t, identities.ownerB, "Owner B");
    const worldB = await seedWorld(t, ownerB, {
      providerInboxId: "provider-inbox-b",
    });
    const runB = await seedRun(t, worldB, ownerB.userId, {
      openaiConversationId: "conversation-b",
      openaiResponseId: "response-b",
    });
    const callB = await seedToolCall(
      t,
      runB.runId,
      ownerB.userId,
      "publish_report",
    );
    const reportB = await makeReportFixture(
      t,
      worldB,
      ownerB.userId,
      runB.runId,
      callB,
    );
    const asA = asUser(t, ownerA);

    await expect(asA.query(api.bots.getBot, { botId: worldB.botId })).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(asA.query(api.chats.getChat, { chatId: worldB.chatId })).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(
      asA.query(api.messages.listMessages, {
        chatId: worldB.chatId,
        paginationOpts: { cursor: null, numItems: 20 },
      }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(asA.query(api.runs.getRun, { runId: runB.runId })).rejects.toThrow(
      "NOT_FOUND",
    );
    await expect(
      asA.query(api.reports.getReportDownloadUrl, {
        reportId: reportB.reportId,
        format: "markdown",
      }),
    ).rejects.toThrow("NOT_FOUND");
    const ownerBReportUrl = await asUser(t, ownerB).query(
      api.reports.getReportDownloadUrl,
      { reportId: reportB.reportId, format: "markdown" },
    );
    expect(ownerBReportUrl).toMatchObject({
      fileName: "research-report.md",
      mimeType: "text/markdown",
      url: expect.stringContaining("/api/storage/"),
    });
    await expect(
      asA.query(api.schedules.listSchedules, { botId: worldB.botId }),
    ).rejects.toThrow("NOT_FOUND");

    await expect(
      asA.mutation(api.bots.updateBotMemory, {
        botId: worldB.botId,
        content: "attacker memory",
      }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      asA.mutation(api.bots.archiveBot, { botId: worldB.botId }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      asA.mutation(api.chats.deleteChat, { chatId: worldB.chatId }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      asA.mutation(api.runs.cancelRun, { runId: runB.runId }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("does not treat provider identifiers as authorization credentials", async () => {
    const t = makeTest();
    const ownerA = await seedUser(t, identities.ownerA, "Owner A");
    const ownerB = await seedUser(t, identities.ownerB, "Owner B");
    const worldB = await seedWorld(t, ownerB, {
      providerInboxId: "shared-provider-inbox",
    });
    const runB = await seedRun(t, worldB, ownerB.userId, {
      openaiConversationId: "shared-conversation",
      openaiResponseId: "shared-response",
    });
    const asA = asUser(t, ownerA);

    await expect(
      asA.query(api.runs.getRun, {
        runId: "shared-response" as never,
      }),
    ).rejects.toThrow();
    await expect(
      asA.query(api.chats.getChat, {
        chatId: "shared-conversation" as never,
      }),
    ).rejects.toThrow();

    const mappedRun = await t.mutation(internal.workers.runMutations.getRunContext, {
      runId: runB.runId,
      generation: 1,
    }).catch(() => null);
    expect(mappedRun).toBeNull();
  });

  it("rejects a malformed cross-tenant webhook thread mapping", async () => {
    const t = makeTest();
    const ownerA = await seedUser(t, identities.ownerA, "Owner A");
    const ownerB = await seedUser(t, identities.ownerB, "Owner B");
    const worldA = await seedWorld(t, ownerA, {
      providerInboxId: "inbox-a",
    });
    const worldB = await seedWorld(t, ownerB, {
      providerInboxId: "inbox-b",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("emailThreads", {
        ownerId: ownerB.userId,
        botId: worldB.botId,
        chatId: worldB.chatId,
        agentMailInboxId: worldA.inboxId,
        providerThreadId: "shared-thread",
        authorizedSenderEmail: ownerB.email,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const result = await t.mutation(internal.inboundEmailProcessor.processInbound, {
      providerEventId: "event-cross-tenant",
      eventType: "message.received",
      payloadHash: "payload-hash",
      providerInboxId: "inbox-a",
      providerMessageId: "message-cross-tenant",
      providerThreadId: "shared-thread",
      fromAddress: ownerB.email,
      toAddresses: [ownerA.email],
      subject: "Cross tenant attempt",
      extractedText: "Should not be accepted",
    });

    expect(result).toMatchObject({ ok: true, rejected: true });
    const webhookEvents = await readRows(t, "webhookEvents");
    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0].failureCode).toBe("thread_mapping_invalid");
    expect(await readRows(t, "emailMessages")).toHaveLength(0);
    expect(await readRows(t, "messages")).toHaveLength(0);
  });

  it("blocks new work for archived bots and deleted chats while retaining ownership", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const asOwner = asUser(t, owner);

    await asOwner.mutation(api.bots.archiveBot, { botId: world.botId });
    await expect(
      asOwner.mutation(api.chats.createChat, { botId: world.botId }),
    ).rejects.toThrow("NOT_FOUND");
    await expect(
      asOwner.mutation(api.messages.submitPrompt, {
        chatId: world.chatId,
        content: "Research after archive",
        model: "gpt-5.6-terra",
        reasoningEffort: "medium",
        clientSubmissionId: "archived-submit",
      }),
    ).rejects.toThrow("BOT_ARCHIVED");

    const secondWorld = await seedWorld(t, owner, { botName: "Second Bot" });
    await asOwner.mutation(api.chats.deleteChat, { chatId: secondWorld.chatId });
    await expect(
      asOwner.mutation(api.messages.submitPrompt, {
        chatId: secondWorld.chatId,
        content: "Research after deletion",
        model: "gpt-5.6-terra",
        reasoningEffort: "medium",
        clientSubmissionId: "deleted-submit",
      }),
    ).rejects.toThrow("CHAT_DELETED");

    const storedBot = await t.run(async (ctx) => ctx.db.get("bots", world.botId));
    const storedChat = await t.run(async (ctx) => ctx.db.get("chats", secondWorld.chatId));
    expect(storedBot?.status).toBe("archived");
    expect(storedChat?.status).toBe("deleted");
  });
});
