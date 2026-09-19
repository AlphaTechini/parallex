import { convexTest, type TestConvexForDataModel } from "convex-test";
import type { UserIdentity } from "convex/server";

import type { DataModel, Doc, Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

export const modules = import.meta.glob("../convex/**/*.ts");

export type TestConvex = TestConvexForDataModel<DataModel>;

export type TestUser = {
  userId: Id<"users">;
  email: string;
  identity: Partial<UserIdentity>;
};

export type TestWorld = {
  botId: Id<"bots">;
  inboxId: Id<"agentMailInboxes">;
  chatId: Id<"chats">;
  profileId: Id<"userProfiles">;
};

export function makeTest(): TestConvex {
  return convexTest({ schema, modules });
}

export async function seedUser(
  t: TestConvex,
  email: string,
  name: string,
): Promise<TestUser> {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email, name }),
  );
  return {
    userId,
    email,
    identity: {
      issuer: "https://test.invalid",
      subject: userId,
      email,
      name,
      tokenIdentifier: `${userId}|test-session`,
    },
  };
}

export function asUser(t: TestConvex, user: TestUser): TestConvex {
  return t.withIdentity(user.identity);
}

export async function seedProfile(
  t: TestConvex,
  ownerId: Id<"users">,
  accountEmail: string,
  globalInstructionVersionId?: Id<"instructionVersions">,
  globalInstructionVersion = 0,
): Promise<Id<"userProfiles">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("userProfiles", {
      ownerId,
      accountEmail,
      globalInstructionVersionId,
      globalInstructionVersion,
      nextAvatarColorIndex: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

export async function seedWorld(
  t: TestConvex,
  user: TestUser,
  options: {
    botName?: string;
    botStatus?: Doc<"bots">["status"];
    emailCapability?: Doc<"bots">["emailCapability"];
    inboxStatus?: Doc<"agentMailInboxes">["status"];
    chatStatus?: Doc<"chats">["status"];
    providerInboxId?: string;
    confirmedAddress?: string;
    providerThreadId?: string;
    botMemory?: string;
    globalMemory?: string;
  } = {},
): Promise<TestWorld> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const profileId = await ctx.db.insert("userProfiles", {
      ownerId: user.userId,
      accountEmail: user.email,
      globalInstructionVersion: options.globalMemory ? 1 : 0,
      nextAvatarColorIndex: 0,
      createdAt: now,
      updatedAt: now,
    });

    let globalInstructionVersionId: Id<"instructionVersions"> | undefined;
    if (options.globalMemory !== undefined) {
      globalInstructionVersionId = await ctx.db.insert("instructionVersions", {
        ownerId: user.userId,
        scope: "global",
        version: 1,
        content: options.globalMemory,
        createdAt: now,
      });
      await ctx.db.patch("userProfiles", profileId, {
        globalInstructionVersionId,
      });
    }

    const botId = await ctx.db.insert("bots", {
      ownerId: user.userId,
      name: options.botName ?? "Research Bot",
      mission: "Research public evidence and write clear reports.",
      recipientEmail: user.email,
      instructionVersion: options.botMemory === undefined ? 0 : 1,
      avatarKind: "default",
      avatarColorIndex: 0,
      emailCapability: options.emailCapability ?? "active",
      status: options.botStatus ?? "active",
      creationOrdinal: 1,
      createdAt: now,
      updatedAt: now,
    });

    if (options.botMemory !== undefined) {
      const botInstructionVersionId = await ctx.db.insert(
        "instructionVersions",
        {
          ownerId: user.userId,
          scope: "bot",
          botId,
          version: 1,
          content: options.botMemory,
          createdAt: now,
        },
      );
      await ctx.db.patch("bots", botId, { currentInstructionVersionId: botInstructionVersionId });
    }

    const inboxId = await ctx.db.insert("agentMailInboxes", {
      ownerId: user.userId,
      botId,
      desiredUsername: "research-bot",
      confirmedAddress: options.confirmedAddress ?? "research-bot@agentmail.test",
      providerInboxId: options.providerInboxId ?? "provider-inbox-test",
      provisioningIdempotencyKey: botId,
      status: options.inboxStatus ?? "active",
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const chatId = await ctx.db.insert("chats", {
      ownerId: user.userId,
      botId,
      titleLocked: false,
      status: options.chatStatus ?? "active",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("openaiCredentials", {
      ownerId: user.userId,
      ciphertext: "test-ciphertext",
      initializationVector: "test-iv",
      keyVersion: 1,
      displayHint: "test",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    if (options.providerThreadId !== undefined) {
      await ctx.db.insert("emailThreads", {
        ownerId: user.userId,
        botId,
        chatId,
        agentMailInboxId: inboxId,
        providerThreadId: options.providerThreadId,
        authorizedSenderEmail: user.email,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }

    return { botId, inboxId, chatId, profileId };
  });
}

export async function seedRun(
  t: TestConvex,
  world: TestWorld,
  ownerId: Id<"users">,
  options: {
    status?: Doc<"researchRuns">["status"];
    currentStage?: Doc<"researchRuns">["currentStage"];
    triggerKind?: Doc<"researchRuns">["triggerKind"];
    model?: Doc<"researchRuns">["model"];
    reasoningEffort?: Doc<"researchRuns">["reasoningEffort"];
    workerGeneration?: number;
    leaseExpiresAt?: number;
    cancelRequested?: boolean;
    openaiConversationId?: string;
    openaiResponseId?: string;
    lastOpenAISequenceNumber?: number;
    completedAt?: number;
    scheduleId?: Id<"researchSchedules">;
    scheduleOccurrenceId?: Id<"scheduleOccurrences">;
    triggerContent?: string;
    assistantContent?: string;
    assistantStatus?: Doc<"messages">["status"];
    setActive?: boolean;
  } = {},
): Promise<{ runId: Id<"researchRuns">; triggerMessageId: Id<"messages">; assistantMessageId: Id<"messages"> }> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const triggerKind = options.triggerKind ?? "web";
    const origin = triggerKind === "web" ? "web" : triggerKind;
    const triggerMessageId = await ctx.db.insert("messages", {
      ownerId,
      botId: world.botId,
      chatId: world.chatId,
      role: "user",
      origin,
      content: options.triggerContent ?? "Research this topic.",
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    const status = options.status ?? "researching";
    const runId = await ctx.db.insert("researchRuns", {
      ownerId,
      botId: world.botId,
      chatId: world.chatId,
      triggerMessageId,
      triggerKind,
      scheduleId: options.scheduleId,
      scheduleOccurrenceId: options.scheduleOccurrenceId,
      model: options.model ?? "gpt-5.6-terra",
      reasoningEffort: options.reasoningEffort ?? "medium",
      researchProtocolVersion: 1,
      openaiConversationId: options.openaiConversationId,
      openaiResponseId: options.openaiResponseId,
      lastOpenAISequenceNumber: options.lastOpenAISequenceNumber,
      workerGeneration: options.workerGeneration ?? 1,
      leaseExpiresAt: options.leaseExpiresAt,
      status,
      currentStage: options.currentStage ?? stageForStatus(status),
      completedAt: options.completedAt,
      startedAt: status === "accepted" ? undefined : now,
      createdAt: now,
      updatedAt: now,
      cancelRequested: options.cancelRequested ?? false,
    });
    const assistantMessageId = await ctx.db.insert("messages", {
      ownerId,
      botId: world.botId,
      chatId: world.chatId,
      runId,
      role: "assistant",
      origin,
      content: options.assistantContent ?? "",
      status: options.assistantStatus ?? "accepted",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch("messages", triggerMessageId, { runId });
    await ctx.db.patch("researchRuns", runId, { assistantMessageId });
    if (options.setActive !== false) {
      await ctx.db.patch("chats", world.chatId, { activeRunId: runId });
    }
    return { runId, triggerMessageId, assistantMessageId };
  });
}

export async function seedToolCall(
  t: TestConvex,
  runId: Id<"researchRuns">,
  ownerId: Id<"users">,
  functionName: Doc<"toolCalls">["functionName"],
  options: {
    openaiCallId?: string;
    argumentsJson?: string;
    status?: Doc<"toolCalls">["status"];
    originResponseId?: string;
    idempotencyKey?: string;
  } = {},
): Promise<Id<"toolCalls">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("toolCalls", {
      ownerId,
      runId,
      openaiCallId: options.openaiCallId ?? `call-${functionName}`,
      functionName,
      argumentsJson: options.argumentsJson ?? defaultToolArguments(functionName),
      argumentsHash: `hash-${functionName}`,
      idempotencyKey: options.idempotencyKey ?? `tool:${runId}:${functionName}`,
      status: options.status ?? "running",
      requestedAt: Date.now(),
      originResponseId: options.originResponseId,
      startedAt: options.status === "running" ? Date.now() : undefined,
      completedAt:
        options.status === "succeeded" || options.status === "failed"
          ? Date.now()
          : undefined,
    }),
  );
}

export async function seedStorage(
  t: TestConvex,
  contentType: string,
  sizeBytes: number,
  fill = 65,
): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const bytes = new Uint8Array(sizeBytes);
    bytes.fill(fill);
    return await ctx.storage.store(new Blob([bytes], { type: contentType }));
  });
}

export async function countRows<T extends keyof DataModel>(
  t: TestConvex,
  table: T,
): Promise<number> {
  return await t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
}

export async function readRows<T extends keyof DataModel>(
  t: TestConvex,
  table: T,
): Promise<Doc<T>[]> {
  return await t.run(async (ctx) => ctx.db.query(table).collect() as Promise<Doc<T>[]>);
}

export async function patchDocument<T extends keyof DataModel>(
  t: TestConvex,
  table: T,
  id: Id<T>,
  value: Partial<Doc<T>>,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.patch(table, id, value);
  });
}

export async function makeReportFixture(
  t: TestConvex,
  world: TestWorld,
  ownerId: Id<"users">,
  runId: Id<"researchRuns">,
  toolCallId: Id<"toolCalls">,
  status: Doc<"reports">["status"] = "ready",
): Promise<{ reportId: Id<"reports">; markdownStorageId: Id<"_storage"> }> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const reportId = await ctx.db.insert("reports", {
      ownerId,
      botId: world.botId,
      chatId: world.chatId,
      runId,
      title: "Research report",
      summary: "A stored summary.",
      status,
      citationStyle: "professional_inline",
      layoutVersion: 1,
      createdAt: now,
      readyAt: status === "ready" || status === "partial" ? now : undefined,
      updatedAt: now,
    });
    const storageId = await ctx.storage.store(
      new Blob(["# Research report\n"], { type: "text/markdown" }),
    );
    await ctx.db.insert("reportArtifacts", {
      ownerId,
      reportId,
      runId,
      format: "markdown",
      storageId,
      fileName: "research-report.md",
      mimeType: "text/markdown",
      sizeBytes: 19,
      contentHash: "markdown-hash",
      accessClass: "private_report",
      createdAt: now,
    });
    await ctx.db.patch("toolCalls", toolCallId, { status: "running" });
    return { reportId, markdownStorageId: storageId };
  });
}

export async function seedOpenAIResponse(
  t: TestConvex,
  runId: Id<"researchRuns">,
  ownerId: Id<"users">,
  conversationId: string,
  responseId: string,
  options: {
    status?: Doc<"openaiResponses">["status"];
    lastSequenceNumber?: number;
    generation?: number;
  } = {},
): Promise<Id<"openaiResponses">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("openaiResponses", {
      ownerId,
      runId,
      responseId,
      conversationId,
      kind: "initial",
      status: options.status ?? "active",
      lastSequenceNumber: options.lastSequenceNumber,
      toolOutputsSubmitted: false,
      generation: options.generation ?? 1,
      createdAt: Date.now(),
    }),
  );
}

export async function seedSchedule(
  t: TestConvex,
  world: TestWorld,
  ownerId: Id<"users">,
  createdByRunId: Id<"researchRuns">,
  options: {
    status?: Doc<"researchSchedules">["status"];
    scheduleKind?: Doc<"researchSchedules">["scheduleKind"];
    scheduledFor?: number;
    recurrence?: Doc<"researchSchedules">["recurrence"];
  } = {},
): Promise<Id<"researchSchedules">> {
  return await t.run(async (ctx) =>
    ctx.db.insert("researchSchedules", {
      ownerId,
      botId: world.botId,
      chatId: world.chatId,
      createdByRunId,
      name: "Scheduled research",
      researchPrompt: "Check for new information.",
      semanticReason: "The information can change over time.",
      scheduleKind: options.scheduleKind ?? "one_time",
      timezone: "UTC",
      recurrence: options.recurrence,
      nextRunAt: options.scheduledFor ?? Date.now() + 60_000,
      status: options.status ?? "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

export const identities = {
  ownerA: "owner-a@example.com",
  ownerB: "owner-b@example.com",
} as const;

function stageForStatus(status: Doc<"researchRuns">["status"]): Doc<"researchRuns">["currentStage"] {
  switch (status) {
    case "accepted":
    case "queued":
      return "accepted";
    case "initializing_provider":
    case "researching":
    case "waiting_for_tool":
      return "researching";
    case "composing":
      return "composing";
    case "preparing_report":
      return "preparing report";
    case "sending_email":
      return "sending email";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
  }
}

function defaultToolArguments(
  functionName: Doc<"toolCalls">["functionName"],
): string {
  switch (functionName) {
    case "firecrawl_search_web":
      return JSON.stringify({
        query: "research",
        sources: null,
        limit: 10,
        includeDomains: null,
        excludeDomains: null,
        location: null,
        country: null,
        timeRange: null,
        scrapeResults: false,
      });
    case "publish_report":
      return JSON.stringify({ title: "Report", summary: "Summary", markdownContent: "# Report" });
    case "send_research_email":
      return JSON.stringify({ subject: "Report", bodySummary: "Summary" });
    case "update_chat_title":
      return JSON.stringify({ title: "Research" });
    case "create_research_schedule":
      return JSON.stringify({
        name: "Schedule",
        researchPrompt: "Check updates",
        semanticReason: "The information changes",
        scheduleKind: "one_time",
        timezone: "UTC",
        nextRunAt: Date.now() + 60_000,
        recurrence: null,
      });
    default:
      return JSON.stringify({});
  }
}
