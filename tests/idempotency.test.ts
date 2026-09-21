import { describe, expect, it, vi } from "vitest";

vi.mock("../convex/lib/agentmailClient", () => ({
  createInboxWithUsername: vi.fn(),
  getAgentMailClient: vi.fn(),
  sendMessageWithAttachment: vi.fn(),
  replyToMessage: vi.fn(),
}));

import { createInboxWithUsername } from "../convex/lib/agentmailClient";
import { api, internal } from "../convex/_generated/api";
import {
  asUser,
  countRows,
  identities,
  makeReportFixture,
  makeTest,
  readRows,
  seedOpenAIResponse,
  seedRun,
  seedSchedule,
  seedToolCall,
  seedUser,
  seedWorld,
} from "./helpers";

describe("side-effect idempotency", () => {
  it("returns the same message and run for a repeated client submission", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const asOwner = asUser(t, owner);
    const args = {
      chatId: world.chatId,
      content: "Research durable idempotency",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      clientSubmissionId: "submission-1",
    } as const;

    const first = await asOwner.mutation(api.messages.submitPrompt, args);
    const second = await asOwner.mutation(api.messages.submitPrompt, args);

    expect(second).toEqual(first);
    const messages = await readRows(t, "messages");
    const userMessages = messages.filter(
      (message) => message.clientSubmissionId === args.clientSubmissionId,
    );
    expect(userMessages).toHaveLength(1);
    expect(await countRows(t, "researchRuns")).toBe(1);
  });

  it("rejects a changed payload that reuses a client submission identifier", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const asOwner = asUser(t, owner);

    await asOwner.mutation(api.messages.submitPrompt, {
      chatId: world.chatId,
      content: "Original request",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      clientSubmissionId: "submission-conflict",
    });

    await expect(
      asOwner.mutation(api.messages.submitPrompt, {
        chatId: world.chatId,
        content: "Changed request",
        model: "gpt-5.6-terra",
        reasoningEffort: "medium",
        clientSubmissionId: "submission-conflict",
      }),
    ).rejects.toThrow("SUBMISSION_CONFLICT");
    expect(await countRows(t, "researchRuns")).toBe(1);
  });

  it("replays an AgentMail webhook without creating another message or run", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner, {
      providerInboxId: "inbox-replay",
      providerThreadId: "provider-thread-replay",
    });
    const inbound = {
      providerEventId: "event-replay",
      eventType: "message.received" as const,
      payloadHash: "payload-replay",
      providerInboxId: "inbox-replay",
      providerMessageId: "provider-message-replay",
      providerThreadId: "provider-thread-replay",
      fromAddress: owner.email,
      toAddresses: ["research-bot@agentmail.test"],
      subject: "Research reply",
      extractedText: "Continue the research",
    };

    const first = await t.mutation(
      internal.inboundEmailProcessor.processInbound,
      inbound,
    );
    const second = await t.mutation(
      internal.inboundEmailProcessor.processInbound,
      inbound,
    );

    expect(first).toMatchObject({ ok: true, runId: expect.any(String) });
    expect(second).toMatchObject({ ok: true, duplicate: true });
    expect(await countRows(t, "emailMessages")).toBe(1);
    expect(
      (await readRows(t, "messages")).filter((message) => message.origin === "email"),
    ).toHaveLength(2);
    expect(await countRows(t, "researchRuns")).toBe(1);
    expect(await countRows(t, "webhookEvents")).toBe(1);
    expect(world.inboxId).toBeDefined();
  });

  it("reuses one AgentMail provisioning client_id and inbox record across retries", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner, {
      emailCapability: "provisioning",
      inboxStatus: "pending",
      providerInboxId: undefined,
      confirmedAddress: undefined,
    });
    vi.mocked(createInboxWithUsername).mockResolvedValue({
      providerInboxId: "provider-created-once",
      confirmedAddress: "research-bot@agentmail.test",
    });

    const first = await t.action(internal.workers.inboxProvisioner.provision, {
      inboxId: world.inboxId,
    });
    const second = await t.action(internal.workers.inboxProvisioner.provision, {
      inboxId: world.inboxId,
    });

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(createInboxWithUsername).toHaveBeenCalledTimes(1);
    const [username, clientId] = vi.mocked(createInboxWithUsername).mock.calls[0];
    expect(username).toBe("research-bot");
    expect(clientId).toBe(world.botId);
    const inbox = await t.run(async (ctx) => ctx.db.get("agentMailInboxes", world.inboxId));
    expect(inbox?.provisioningIdempotencyKey).toBe(world.botId);
    expect(inbox?.providerInboxId).toBe("provider-created-once");
  });

  it("uses one stable logical email key and does not create a second outbound record", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const run = await seedRun(t, world, owner.userId);
    const toolCallId = await seedToolCall(
      t,
      run.runId,
      owner.userId,
      "send_research_email",
    );
    const report = await makeReportFixture(
      t,
      world,
      owner.userId,
      run.runId,
      toolCallId,
    );

    const first = await t.mutation(internal.emails.beginOutboundSend, {
      toolCallId,
      subject: "First subject",
      bodySummary: "First summary",
    });
    const second = await t.mutation(internal.emails.beginOutboundSend, {
      toolCallId,
      subject: "Retry subject",
      bodySummary: "Retry summary",
    });
    await t.mutation(internal.emails.markOutboundAccepted, {
      emailMessageId: first.emailMessage._id,
      providerMessageId: "provider-email-1",
      providerThreadId: "provider-thread-1",
    });
    const afterAcceptance = await t.mutation(internal.emails.beginOutboundSend, {
      toolCallId,
      subject: "Third subject",
      bodySummary: "Third summary",
    });

    expect(first.emailMessage._id).toBe(second.emailMessage._id);
    expect(afterAcceptance).toMatchObject({ state: "accepted" });
    expect(afterAcceptance.emailMessage._id).toBe(first.emailMessage._id);
    const outbound = (await readRows(t, "emailMessages")).filter(
      (message) => message.direction === "outbound",
    );
    expect(outbound).toHaveLength(1);
    expect(outbound[0].idempotencyKey).toBe(`email:${run.runId}:${report.reportId}`);
  });

  it("creates one occurrence run when the scheduler invokes the same occurrence twice", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const creatorRun = await seedRun(t, world, owner.userId, { status: "completed" });
    const scheduledFor = Date.now() + 60_000;
    const scheduleId = await seedSchedule(t, world, owner.userId, creatorRun.runId, {
      scheduledFor,
    });

    const first = await t.mutation(internal.scheduleOccurrenceWorker.run, {
      scheduleId,
      scheduledFor,
    });
    const second = await t.mutation(internal.scheduleOccurrenceWorker.run, {
      scheduleId,
      scheduledFor,
    });

    expect(first).toMatchObject({ ok: true, runId: expect.any(String) });
    expect(second).toMatchObject({ ok: true, skipped: true });
    expect(await countRows(t, "scheduleOccurrences")).toBe(1);
    expect(await countRows(t, "researchRuns")).toBe(2);
  });

  it("does not duplicate run events, deltas, or tool calls when an OpenAI sequence is replayed", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const run = await seedRun(t, world, owner.userId, {
      openaiConversationId: "conversation-replay",
      openaiResponseId: "response-replay",
      workerGeneration: 1,
      leaseExpiresAt: Date.now() + 60_000,
    });
    await seedOpenAIResponse(
      t,
      run.runId,
      owner.userId,
      "conversation-replay",
      "response-replay",
    );

    const delta = {
      runId: run.runId,
      generation: 1,
      responseId: "response-replay",
      sequenceNumber: 4,
      kind: "assistant_delta" as const,
      delta: "partial answer",
    };
    expect(
      await t.mutation(internal.workers.runMutations.checkpointResponseEvent, delta),
    ).toEqual({ accepted: true, terminal: false });
    expect(
      await t.mutation(internal.workers.runMutations.checkpointResponseEvent, delta),
    ).toEqual({ accepted: false, terminal: false });

    const toolEvent = {
      runId: run.runId,
      generation: 1,
      responseId: "response-replay",
      sequenceNumber: 5,
      kind: "tool_call" as const,
      functionCalls: [
        {
          callId: "call-replay",
          name: "firecrawl_search_web",
          argumentsJson: JSON.stringify({
            query: "research",
            sources: null,
            limit: 10,
            includeDomains: null,
            excludeDomains: null,
            location: null,
            country: null,
            timeRange: null,
            scrapeResults: false,
          }),
        },
      ],
    };
    await t.mutation(internal.workers.runMutations.checkpointResponseEvent, toolEvent);
    await t.mutation(internal.workers.runMutations.checkpointResponseEvent, toolEvent);

    expect(await countRows(t, "toolCalls")).toBe(1);
    expect(
      (await readRows(t, "runEvents")).filter((event) => event.kind === "firecrawl_query"),
    ).toHaveLength(1);
    const assistant = await t.run(async (ctx) => ctx.db.get("messages", run.assistantMessageId));
    expect(assistant?.content).toBe("partial answer");
    const response = await t.run(async (ctx) =>
      ctx.db
        .query("openaiResponses")
        .withIndex("by_response_id", (q) => q.eq("responseId", "response-replay"))
        .unique(),
    );
    expect(response?.lastSequenceNumber).toBe(5);
  });
});
