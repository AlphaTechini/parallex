import { describe, expect, it } from "vitest";

import { api, internal } from "../convex/_generated/api";
import {
  asUser,
  countRows,
  identities,
  makeReportFixture,
  makeTest,
  readRows,
  seedRun,
  seedSchedule,
  seedToolCall,
  seedUser,
  seedWorld,
} from "./helpers";

describe("durable run and side-effect state transitions", () => {
  it("does not let a terminal run be claimed by a normal worker", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const run = await seedRun(t, world, owner.userId, {
      status: "completed",
      currentStage: "completed",
      assistantContent: "Completed answer",
      assistantStatus: "complete",
      completedAt: Date.now(),
    });

    const claim = await t.mutation(internal.workers.runMutations.claimRun, {
      runId: run.runId,
      generation: 99,
    });

    expect(claim).toEqual({ claimed: false, reason: "terminal" });
    const stored = await t.run(async (ctx) => ctx.db.get("researchRuns", run.runId));
    expect(stored?.status).toBe("completed");
    expect(stored?.workerGeneration).toBe(1);
  });

  it("does not allow a stale generation to overwrite a newer checkpoint", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const run = await seedRun(t, world, owner.userId, {
      workerGeneration: 2,
      leaseExpiresAt: Date.now() + 60_000,
      openaiConversationId: "conversation-generation",
      openaiResponseId: "response-generation",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("openaiResponses", {
        ownerId: owner.userId,
        runId: run.runId,
        responseId: "response-generation",
        conversationId: "conversation-generation",
        kind: "initial",
        status: "active",
        toolOutputsSubmitted: false,
        generation: 2,
        createdAt: Date.now(),
      });
    });

    await expect(
      t.mutation(internal.workers.runMutations.setRunConversation, {
        runId: run.runId,
        generation: 1,
        conversationId: "stale-conversation",
      }),
    ).rejects.toThrow("RUN_LEASE_INVALID");
    await expect(
      t.mutation(internal.workers.runMutations.checkpointResponseEvent, {
        runId: run.runId,
        generation: 1,
        responseId: "response-generation",
        sequenceNumber: 10,
        kind: "assistant_delta",
        delta: "stale",
      }),
    ).rejects.toThrow("RUN_LEASE_INVALID");

    const stored = await t.run(async (ctx) => ctx.db.get("researchRuns", run.runId));
    expect(stored?.workerGeneration).toBe(2);
    expect(stored?.openaiConversationId).toBe("conversation-generation");
  });

  it("keeps one active run per chat and promotes the oldest queued run", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const asOwner = asUser(t, owner);

    const first = await asOwner.mutation(api.messages.submitPrompt, {
      chatId: world.chatId,
      content: "First request",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      clientSubmissionId: "first-run",
    });
    await t.mutation(internal.workers.runMutations.claimRun, {
      runId: first.runId,
      generation: 1,
    });
    const second = await asOwner.mutation(api.messages.submitPrompt, {
      chatId: world.chatId,
      content: "Second request",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      clientSubmissionId: "second-run",
    });

    const before = await t.run(async (ctx) => {
      const firstRun = await ctx.db.get("researchRuns", first.runId);
      const secondRun = await ctx.db.get("researchRuns", second.runId);
      const chat = await ctx.db.get("chats", world.chatId);
      return { firstRun, secondRun, chat };
    });
    expect(before.firstRun?.status).toBe("initializing_provider");
    expect(before.secondRun?.status).toBe("queued");
    expect(before.chat?.activeRunId).toBe(first.runId);

    await t.mutation(internal.workers.runMutations.finalizeRun, {
      runId: first.runId,
      generation: 1,
      finalText: "First completed",
    });

    const after = await t.run(async (ctx) => {
      const firstRun = await ctx.db.get("researchRuns", first.runId);
      const secondRun = await ctx.db.get("researchRuns", second.runId);
      const chat = await ctx.db.get("chats", world.chatId);
      return { firstRun, secondRun, chat };
    });
    expect(after.firstRun?.status).toBe("completed");
    expect(after.secondRun?.status).toBe("accepted");
    expect(after.chat?.activeRunId).toBe(second.runId);
  });

  it("does not start email delivery before a stored report artifact exists", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const run = await seedRun(t, world, owner.userId, { status: "researching" });
    const toolCallId = await seedToolCall(
      t,
      run.runId,
      owner.userId,
      "send_research_email",
    );

    await expect(
      t.mutation(internal.emails.beginOutboundSend, {
        toolCallId,
        subject: "Premature delivery",
        bodySummary: "No report exists",
      }),
    ).rejects.toThrow("EMAIL_CONTEXT_INVALID");
    expect(await countRows(t, "emailMessages")).toBe(0);
  });

  it("leaves a completed run and stored report intact when email delivery fails", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const run = await seedRun(t, world, owner.userId, {
      status: "completed",
      currentStage: "completed",
      assistantContent: "Completed answer",
      assistantStatus: "complete",
      completedAt: Date.now(),
    });
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
    const emailMessageId = await t.run(async (ctx) =>
      ctx.db.insert("emailMessages", {
        ownerId: owner.userId,
        botId: world.botId,
        chatId: world.chatId,
        runId: run.runId,
        direction: "outbound",
        idempotencyKey: `email:${run.runId}:${report.reportId}`,
        fromAddress: "research-bot@agentmail.test",
        toAddresses: [owner.email],
        subject: "Research report",
        plainTextBody: "Summary",
        reportId: report.reportId,
        status: "sending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await t.mutation(internal.emails.markOutboundFailed, {
      emailMessageId,
      errorCode: "provider_error",
    });

    const storedRun = await t.run(async (ctx) => ctx.db.get("researchRuns", run.runId));
    const storedReport = await t.run(async (ctx) => ctx.db.get("reports", report.reportId));
    const storedEmail = await t.run(async (ctx) => ctx.db.get("emailMessages", emailMessageId));
    expect(storedRun?.status).toBe("completed");
    expect(storedReport?.status).toBe("ready");
    expect(storedEmail?.status).toBe("failed");
  });

  it("marks a one-time schedule completed after its occurrence and does not create a second run", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const creatorRun = await seedRun(t, world, owner.userId, { status: "completed" });
    const scheduledFor = Date.now() + 60_000;
    const scheduleId = await seedSchedule(t, world, owner.userId, creatorRun.runId, {
      scheduledFor,
    });

    await t.mutation(internal.scheduleOccurrenceWorker.run, {
      scheduleId,
      scheduledFor,
    });
    await t.mutation(internal.scheduleOccurrenceWorker.run, {
      scheduleId,
      scheduledFor,
    });

    const schedule = await t.run(async (ctx) => ctx.db.get("researchSchedules", scheduleId));
    const occurrences = await readRows(t, "scheduleOccurrences");
    expect(schedule?.status).toBe("completed");
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].status).toBe("run_created");
    expect(await countRows(t, "researchRuns")).toBe(2);
  });

  it("skips occurrences for paused and deleted schedules without creating runs", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const creatorRun = await seedRun(t, world, owner.userId, { status: "completed" });
    const pausedFor = Date.now() + 60_000;
    const deletedFor = Date.now() + 120_000;
    const pausedSchedule = await seedSchedule(t, world, owner.userId, creatorRun.runId, {
      status: "paused",
      scheduledFor: pausedFor,
    });
    const deletedSchedule = await seedSchedule(t, world, owner.userId, creatorRun.runId, {
      status: "deleted",
      scheduledFor: deletedFor,
    });

    const pausedResult = await t.mutation(internal.scheduleOccurrenceWorker.run, {
      scheduleId: pausedSchedule,
      scheduledFor: pausedFor,
    });
    const deletedResult = await t.mutation(internal.scheduleOccurrenceWorker.run, {
      scheduleId: deletedSchedule,
      scheduledFor: deletedFor,
    });

    expect(pausedResult).toMatchObject({ ok: true, skipped: true });
    expect(deletedResult).toMatchObject({ ok: true, skipped: true });
    expect(await countRows(t, "researchRuns")).toBe(1);
    expect((await readRows(t, "scheduleOccurrences")).map((occurrence) => occurrence.status)).toEqual([
      "skipped",
      "skipped",
    ]);
  });

  it("does not create provider jobs after cancellation", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const run = await seedRun(t, world, owner.userId, { status: "researching" });
    const toolCallId = await seedToolCall(
      t,
      run.runId,
      owner.userId,
      "firecrawl_search_web",
    );

    await asUser(t, owner).mutation(api.runs.cancelRun, { runId: run.runId });
    await expect(
      t.mutation(internal.firecrawlJobs.createJob, {
        toolCallId,
        capability: "firecrawl_search_web",
        providerJobId: "provider-job-after-cancel",
      }),
    ).rejects.toThrow("RUN_NOT_LIVE");
    expect(await countRows(t, "firecrawlJobs")).toBe(0);
    const storedRun = await t.run(async (ctx) => ctx.db.get("researchRuns", run.runId));
    expect(storedRun?.status).toBe("canceled");
    expect(storedRun?.cancelRequested).toBe(true);
  });
});
