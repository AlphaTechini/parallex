import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";
import { defineTable } from "convex/server";
import { v } from "convex/values";

const model = v.union(
  v.literal("gpt-5.6-luna"),
  v.literal("gpt-5.6-terra"),
  v.literal("gpt-5.6-sol"),
  v.literal("gpt-6-astra"),
  v.literal("glm-5.3-flash"),
  v.literal("glm-5.3"),
);

const modelProvider = v.union(v.literal("openai"), v.literal("zhipu"));

const reasoningEffort = v.union(
  v.literal("none"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("xhigh"),
  v.literal("max"),
);

const runStatus = v.union(
  v.literal("accepted"),
  v.literal("queued"),
  v.literal("initializing_provider"),
  v.literal("researching"),
  v.literal("waiting_for_tool"),
  v.literal("composing"),
  v.literal("preparing_report"),
  v.literal("sending_email"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

const runStage = v.union(
  v.literal("accepted"),
  v.literal("researching"),
  v.literal("composing"),
  v.literal("preparing report"),
  v.literal("sending email"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

const firecrawlCapability = v.union(
  v.literal("firecrawl_search_web"),
  v.literal("firecrawl_search_research"),
  v.literal("firecrawl_search_developer"),
  v.literal("firecrawl_map_site"),
  v.literal("firecrawl_scrape_page"),
  v.literal("firecrawl_batch_scrape"),
  v.literal("firecrawl_crawl_site"),
  v.literal("firecrawl_parse_document"),
  v.literal("firecrawl_extract_structured"),
  v.literal("firecrawl_query_page"),
  v.literal("firecrawl_interact_page"),
  v.literal("firecrawl_browser_research"),
  v.literal("firecrawl_extract_media"),
  v.literal("firecrawl_compare_page_change"),
  v.literal("firecrawl_agent_gather"),
);

const toolFunctionName = v.union(
  v.literal("firecrawl_search_web"),
  v.literal("firecrawl_search_research"),
  v.literal("firecrawl_search_developer"),
  v.literal("firecrawl_map_site"),
  v.literal("firecrawl_scrape_page"),
  v.literal("firecrawl_batch_scrape"),
  v.literal("firecrawl_crawl_site"),
  v.literal("firecrawl_parse_document"),
  v.literal("firecrawl_extract_structured"),
  v.literal("firecrawl_query_page"),
  v.literal("firecrawl_interact_page"),
  v.literal("firecrawl_browser_research"),
  v.literal("firecrawl_extract_media"),
  v.literal("firecrawl_compare_page_change"),
  v.literal("firecrawl_agent_gather"),
  v.literal("list_stored_reports"),
  v.literal("read_stored_report"),
  v.literal("update_chat_title"),
  v.literal("publish_report"),
  v.literal("send_research_email"),
  v.literal("send_direct_message"),
  v.literal("prepare_outreach_draft"),
  v.literal("list_research_schedules"),
  v.literal("create_research_schedule"),
);

const appTables = {
  userProfiles: defineTable({
    ownerId: v.id("users"),
    accountEmail: v.string(),
    globalInstructionVersionId: v.optional(v.id("instructionVersions")),
    globalInstructionVersion: v.number(),
    nextAvatarColorIndex: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerId"]),

  instructionVersions: defineTable({
    ownerId: v.id("users"),
    scope: v.union(v.literal("global"), v.literal("bot")),
    botId: v.optional(v.id("bots")),
    version: v.number(),
    content: v.string(),
    createdAt: v.number(),
    supersededAt: v.optional(v.number()),
  })
    .index("by_owner_scope_version", ["ownerId", "scope", "version"])
    .index("by_bot_version", ["botId", "version"])
    .index("by_owner_bot", ["ownerId", "botId"]),

  openaiCredentials: defineTable({
    ownerId: v.id("users"),
    ciphertext: v.string(),
    initializationVector: v.string(),
    authenticationTag: v.optional(v.string()),
    keyVersion: v.number(),
    displayHint: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("invalid"),
      v.literal("revoked"),
      v.literal("deleted"),
    ),
    lastValidatedAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"]),

  zhipuCredentials: defineTable({
    ownerId: v.id("users"),
    ciphertext: v.string(),
    initializationVector: v.string(),
    authenticationTag: v.optional(v.string()),
    keyVersion: v.number(),
    displayHint: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("invalid"),
      v.literal("revoked"),
      v.literal("deleted"),
    ),
    lastValidatedAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"]),

  bots: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    mission: v.string(),
    recipientEmail: v.string(),
    emailInboxId: v.optional(v.id("agentMailInboxes")),
    currentInstructionVersionId: v.optional(v.id("instructionVersions")),
    instructionVersion: v.number(),
    avatarKind: v.union(v.literal("default"), v.literal("upload")),
    avatarColorIndex: v.optional(v.number()),
    avatarStorageId: v.optional(v.id("_storage")),
    emailCapability: v.union(
      v.literal("provisioning"),
      v.literal("active"),
      v.literal("failed"),
      v.literal("disabled"),
    ),
    status: v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("deleted"),
    ),
    creationOrdinal: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_owner_creation_ordinal", ["ownerId", "creationOrdinal"])
    .index("by_owner_recipient", ["ownerId", "recipientEmail"])
    .index("by_owner_email_inbox", ["ownerId", "emailInboxId"]),

  agentMailInboxes: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    desiredUsername: v.string(),
    confirmedAddress: v.optional(v.string()),
    providerInboxId: v.optional(v.string()),
    providerDomainId: v.optional(v.string()),
    provisioningIdempotencyKey: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("creating"),
      v.literal("active"),
      v.literal("failed"),
      v.literal("deleted"),
    ),
    attemptCount: v.number(),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_bot", ["botId"])
    .index("by_owner", ["ownerId"])
    .index("by_owner_bot", ["ownerId", "botId"])
    .index("by_provider_inbox", ["providerInboxId"])
    .index("by_confirmed_address", ["confirmedAddress"])
    .index("by_idempotency_key", ["provisioningIdempotencyKey"]),

  chats: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    title: v.optional(v.string()),
    titleSource: v.optional(
      v.union(v.literal("model_function"), v.literal("fallback")),
    ),
    titleLocked: v.boolean(),
    openaiConversationId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("archived"),
      v.literal("deleted"),
    ),
    lastMessageAt: v.optional(v.number()),
    activeRunId: v.optional(v.id("researchRuns")),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner_updated", ["ownerId", "updatedAt"])
    .index("by_owner_bot_updated", ["ownerId", "botId", "updatedAt"])
    .index("by_bot_status", ["botId", "status"])
    .index("by_openai_conversation", ["openaiConversationId"])
    .index("by_owner_openai_conversation", ["ownerId", "openaiConversationId"]),

  messages: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    chatId: v.id("chats"),
    runId: v.optional(v.id("researchRuns")),
    role: v.union(v.literal("user"), v.literal("assistant")),
    origin: v.union(
      v.literal("web"),
      v.literal("email"),
      v.literal("schedule"),
      v.literal("system_result"),
    ),
    content: v.string(),
    clientSubmissionId: v.optional(v.string()),
    requestHash: v.optional(v.string()),
    openaiItemId: v.optional(v.string()),
    emailMessageId: v.optional(v.id("emailMessages")),
    status: v.union(
      v.literal("accepted"),
      v.literal("streaming"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_chat_created", ["chatId", "createdAt"])
    .index("by_owner_chat_created", ["ownerId", "chatId", "createdAt"])
    .index("by_run", ["runId"])
    .index("by_owner_submission", ["ownerId", "clientSubmissionId"])
    .index("by_openai_item", ["openaiItemId"])
    .index("by_email_message", ["emailMessageId"]),

  researchRuns: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    chatId: v.id("chats"),
    triggerMessageId: v.id("messages"),
    assistantMessageId: v.optional(v.id("messages")),
    triggerKind: v.union(
      v.literal("web"),
      v.literal("email"),
      v.literal("schedule"),
    ),
    scheduleId: v.optional(v.id("researchSchedules")),
    scheduleOccurrenceId: v.optional(v.id("scheduleOccurrences")),
    provider: v.optional(modelProvider),
    model,
    reasoningEffort,
    globalInstructionVersionId: v.optional(v.id("instructionVersions")),
    botInstructionVersionId: v.optional(v.id("instructionVersions")),
    researchProtocolVersion: v.number(),
    openaiConversationId: v.optional(v.string()),
    openaiResponseId: v.optional(v.string()),
    lastOpenAISequenceNumber: v.optional(v.number()),
    workerGeneration: v.number(),
    leaseExpiresAt: v.optional(v.number()),
    status: runStatus,
    currentStage: runStage,
    failureCode: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    cancelRequested: v.boolean(),
  })
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_owner_status_updated", ["ownerId", "status", "updatedAt"])
    .index("by_chat_created", ["chatId", "createdAt"])
    .index("by_chat_status", ["chatId", "status"])
    .index("by_bot_status", ["botId", "status"])
    .index("by_openai_response", ["openaiResponseId"])
    .index("by_schedule_occurrence", ["scheduleOccurrenceId"]),

  runEvents: defineTable({
    ownerId: v.id("users"),
    runId: v.id("researchRuns"),
    sequence: v.number(),
    kind: v.union(
      v.literal("prompt_received"),
      v.literal("research_status"),
      v.literal("reasoning_summary"),
      v.literal("firecrawl_query"),
      v.literal("firecrawl_result"),
      v.literal("report_generation"),
      v.literal("email_send"),
      v.literal("email_delivery"),
      v.literal("run_error"),
    ),
    label: v.string(),
    status: v.union(
      v.literal("started"),
      v.literal("updated"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    safeDetail: v.optional(v.string()),
    sourceId: v.optional(v.id("researchSources")),
    toolCallId: v.optional(v.id("toolCalls")),
    reasoningSummaryText: v.optional(v.string()),
    providerSequenceNumber: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_run_sequence", ["runId", "sequence"])
    .index("by_owner_run_sequence", ["ownerId", "runId", "sequence"])
    .index("by_tool_call", ["toolCallId"])
    .index("by_provider_sequence", ["runId", "providerSequenceNumber"]),

  toolCalls: defineTable({
    ownerId: v.id("users"),
    runId: v.id("researchRuns"),
    openaiCallId: v.string(),
    functionName: toolFunctionName,
    argumentsJson: v.string(),
    argumentsHash: v.string(),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("requested"),
      v.literal("validated"),
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    resultJson: v.optional(v.string()),
    resultStorageId: v.optional(v.id("_storage")),
    failureCode: v.optional(v.string()),
    requestedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    originResponseId: v.optional(v.string()),
  })
    .index("by_run_requested", ["runId", "requestedAt"])
    .index("by_openai_call", ["openaiCallId"])
    .index("by_run_openai_call", ["runId", "openaiCallId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_owner_status", ["ownerId", "status"]),

  firecrawlJobs: defineTable({
    ownerId: v.id("users"),
    runId: v.id("researchRuns"),
    toolCallId: v.id("toolCalls"),
    capability: firecrawlCapability,
    providerJobId: v.optional(v.string()),
    status: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("canceled"),
      v.literal("closed"),
    ),
    pollCursor: v.optional(v.string()),
    completedItems: v.optional(v.number()),
    totalItems: v.optional(v.number()),
    creditsUsed: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    lastPolledAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_tool_call", ["toolCallId"])
    .index("by_provider_job", ["providerJobId"])
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_owner_status", ["ownerId", "status"]),

  researchSources: defineTable({
    ownerId: v.id("users"),
    runId: v.id("researchRuns"),
    toolCallId: v.optional(v.id("toolCalls")),
    canonicalUrl: v.string(),
    urlHash: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    sourceType: v.union(
      v.literal("web"),
      v.literal("news"),
      v.literal("research"),
      v.literal("developer"),
      v.literal("pdf"),
      v.literal("document"),
      v.literal("image"),
      v.literal("video"),
      v.literal("other"),
    ),
    publisher: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    retrievedAt: v.number(),
    retrievalMethod: firecrawlCapability,
    pageStatusCode: v.optional(v.number()),
    contentHash: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    disposition: v.union(
      v.literal("candidate"),
      v.literal("used"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
    rejectionReason: v.optional(v.string()),
    citationLabel: v.optional(v.string()),
    citationOrder: v.optional(v.number()),
  })
    .index("by_run_retrieved", ["runId", "retrievedAt"])
    .index("by_run_disposition", ["runId", "disposition"])
    .index("by_run_url_hash", ["runId", "urlHash"])
    .index("by_owner_url_hash", ["ownerId", "urlHash"])
    .index("by_tool_call", ["toolCallId"]),

  reports: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    chatId: v.id("chats"),
    runId: v.id("researchRuns"),
    title: v.string(),
    summary: v.string(),
    status: v.union(
      v.literal("drafting"),
      v.literal("rendering"),
      v.literal("ready"),
      v.literal("partial"),
      v.literal("failed"),
    ),
    citationStyle: v.literal("professional_inline"),
    layoutVersion: v.number(),
    createdAt: v.number(),
    readyAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_chat_created", ["chatId", "createdAt"])
    .index("by_status", ["status"]),

  reportArtifacts: defineTable({
    ownerId: v.id("users"),
    reportId: v.id("reports"),
    runId: v.id("researchRuns"),
    format: v.union(v.literal("markdown"), v.literal("pdf")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    contentHash: v.string(),
    accessClass: v.literal("private_report"),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_report_format", ["reportId", "format"])
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_run", ["runId"])
    .index("by_storage_id", ["storageId"]),

  emailThreads: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    chatId: v.id("chats"),
    agentMailInboxId: v.id("agentMailInboxes"),
    providerThreadId: v.string(),
    authorizedSenderEmail: v.string(),
    outreachApproved: v.optional(v.boolean()),
    outreachConstraints: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("closed")),
    lastMessageAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_thread", ["providerThreadId"])
    .index("by_inbox_provider_thread", ["agentMailInboxId", "providerThreadId"])
    .index("by_chat", ["chatId"])
    .index("by_owner_chat", ["ownerId", "chatId"])
    .index("by_owner_status", ["ownerId", "status"]),

  outreachDrafts: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    chatId: v.id("chats"),
    runId: v.id("researchRuns"),
    agentMailInboxId: v.id("agentMailInboxes"),
    emailMessageId: v.optional(v.id("emailMessages")),
    recipientEmail: v.string(),
    merchantName: v.string(),
    productLabel: v.string(),
    subject: v.string(),
    body: v.string(),
    constraints: v.string(),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    providerMessageId: v.optional(v.string()),
    providerThreadId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
    approvedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_created", ["runId", "createdAt"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_provider_thread", ["providerThreadId"])
    .index("by_owner_status", ["ownerId", "status"]),

  emailMessages: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    chatId: v.id("chats"),
    runId: v.optional(v.id("researchRuns")),
    threadId: v.optional(v.id("emailThreads")),
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    providerMessageId: v.optional(v.string()),
    providerThreadId: v.optional(v.string()),
    idempotencyKey: v.string(),
    fromAddress: v.string(),
    toAddresses: v.array(v.string()),
    subject: v.string(),
    plainTextBody: v.optional(v.string()),
    reportId: v.optional(v.id("reports")),
    status: v.union(
      v.literal("pending"),
      v.literal("sending"),
      v.literal("accepted"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("received"),
      v.literal("verified"),
      v.literal("processed"),
      v.literal("rejected"),
    ),
    providerTimestamp: v.optional(v.number()),
    failureCode: v.optional(v.string()),
    lastAttemptAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_message", ["providerMessageId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_thread_created", ["threadId", "createdAt"])
    .index("by_chat_created", ["chatId", "createdAt"])
    .index("by_run", ["runId"])
    .index("by_owner_status", ["ownerId", "status"]),

  webhookEvents: defineTable({
    provider: v.union(v.literal("agentmail"), v.literal("openai")),
    providerEventId: v.string(),
    eventType: v.string(),
    signatureVerified: v.boolean(),
    payloadHash: v.string(),
    ownerId: v.optional(v.id("users")),
    botId: v.optional(v.id("bots")),
    runId: v.optional(v.id("researchRuns")),
    emailMessageId: v.optional(v.id("emailMessages")),
    status: v.union(
      v.literal("received"),
      v.literal("verified"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
    failureCode: v.optional(v.string()),
    receivedAt: v.number(),
    processedAt: v.optional(v.number()),
  })
    .index("by_provider_event", ["provider", "providerEventId"])
    .index("by_status_received", ["status", "receivedAt"])
    .index("by_owner_received", ["ownerId", "receivedAt"]),

  researchSchedules: defineTable({
    ownerId: v.id("users"),
    botId: v.id("bots"),
    chatId: v.id("chats"),
    createdByRunId: v.optional(v.id("researchRuns")),
    provider: v.optional(modelProvider),
    model: v.optional(model),
    reasoningEffort: v.optional(reasoningEffort),
    name: v.string(),
    researchPrompt: v.string(),
    semanticReason: v.string(),
    monitorUrl: v.optional(v.string()),
    monitorChangeDescription: v.optional(v.string()),
    monitorTag: v.optional(v.string()),
    scheduleKind: v.union(v.literal("one_time"), v.literal("recurring")),
    timezone: v.string(),
    recurrence: v.optional(
      v.object({
        frequency: v.union(
          v.literal("hourly"),
          v.literal("daily"),
          v.literal("weekly"),
          v.literal("monthly"),
        ),
        interval: v.number(),
        hour: v.optional(v.number()),
        minute: v.optional(v.number()),
        weekday: v.optional(v.number()),
        dayOfMonth: v.optional(v.number()),
      }),
    ),
    nextRunAt: v.number(),
    convexScheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("completed"),
      v.literal("deleted"),
    ),
    lastRunAt: v.optional(v.number()),
    lastSuccessfulRunAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_owner_status_next", ["ownerId", "status", "nextRunAt"])
    .index("by_bot_status_next", ["botId", "status", "nextRunAt"])
    .index("by_chat_created", ["chatId", "createdAt"])
    .index("by_scheduled_function", ["convexScheduledFunctionId"])
    .index("by_created_run", ["createdByRunId"])
    .index("by_owner_bot_monitor_url", ["ownerId", "botId", "monitorUrl"]),

  scheduleOccurrences: defineTable({
    ownerId: v.id("users"),
    scheduleId: v.id("researchSchedules"),
    scheduledFor: v.number(),
    occurrenceKey: v.string(),
    status: v.union(
      v.literal("claimed"),
      v.literal("run_created"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    runId: v.optional(v.id("researchRuns")),
    failureCode: v.optional(v.string()),
    claimedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_occurrence_key", ["occurrenceKey"])
    .index("by_schedule_time", ["scheduleId", "scheduledFor"])
    .index("by_owner_status", ["ownerId", "status"])
    .index("by_run", ["runId"]),

  openaiResponses: defineTable({
    ownerId: v.id("users"),
    runId: v.id("researchRuns"),
    responseId: v.optional(v.string()),
    parentResponseId: v.optional(v.string()),
    conversationId: v.string(),
    kind: v.union(v.literal("initial"), v.literal("tool_continuation")),
    status: v.union(
      v.literal("creating"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("abandoned"),
    ),
    lastSequenceNumber: v.optional(v.number()),
    toolOutputsSubmitted: v.boolean(),
    generation: v.number(),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_run", ["runId"])
    .index("by_response_id", ["responseId"])
    .index("by_run_status", ["runId", "status"]),

  zhipuTurns: defineTable({
    ownerId: v.id("users"),
    runId: v.id("researchRuns"),
    sequence: v.number(),
    generation: v.number(),
    status: v.union(
      v.literal("creating"),
      v.literal("completed"),
      v.literal("abandoned"),
    ),
    providerCompletionId: v.optional(v.string()),
    assistantContent: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_run_sequence", ["runId", "sequence"])
    .index("by_run_status", ["runId", "status"])
    .index("by_provider_completion", ["providerCompletionId"]),

  storageOwnership: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    purpose: v.union(
      v.literal("avatar"),
      v.literal("research"),
      v.literal("report"),
    ),
    createdAt: v.number(),
  }).index("by_storage", ["storageId"]),

  avatarUploadClaims: defineTable({
    ownerId: v.id("users"),
    token: v.string(),
    storageId: v.optional(v.id("_storage")),
    consumedByBotId: v.optional(v.id("bots")),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_token", ["token"])
    .index("by_storage", ["storageId"]),

  researchUploadClaims: defineTable({
    ownerId: v.id("users"),
    token: v.string(),
    storageId: v.optional(v.id("_storage")),
    attachmentId: v.optional(v.id("messageAttachments")),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_token", ["token"])
    .index("by_storage", ["storageId"]),

  messageAttachments: defineTable({
    ownerId: v.id("users"),
    chatId: v.optional(v.id("chats")),
    messageId: v.optional(v.id("messages")),
    runId: v.optional(v.id("researchRuns")),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    status: v.union(
      v.literal("uploaded"),
      v.literal("bound"),
      v.literal("parsing"),
      v.literal("parsed"),
      v.literal("failed"),
    ),
    firecrawlDocumentId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_created", ["ownerId", "createdAt"])
    .index("by_message", ["messageId"])
    .index("by_run", ["runId"])
    .index("by_storage", ["storageId"]),
};

export default defineSchema({
  ...authTables,
  ...appTables,
});
