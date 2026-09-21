import { describe, expect, it, vi } from "vitest";

vi.mock("../convex/lib/firecrawlClient", async () => {
  const actual = await vi.importActual<typeof import("../convex/lib/firecrawlClient")>(
    "../convex/lib/firecrawlClient",
  );
  return {
    ...actual,
    assertPublicUrl: vi.fn(async (value: string) => ({
      url: actual.assertPublicUrlShape(value),
      addresses: ["93.184.216.34"],
    })),
    getFirecrawlClient: vi.fn(),
  };
});

import {
  FIRECRAWL_TOOL_NAMES,
  TOOL_FUNCTION_NAMES,
  getResearchToolDefinitions,
  toolPhase,
  validateToolArguments,
} from "../convex/tools/definitions";
import { executeRegisteredTool } from "../convex/tools/registry";
import type { ToolExecutionContext } from "../convex/tools/types";
import { getFirecrawlClient } from "../convex/lib/firecrawlClient";
import { internal } from "../convex/_generated/api";
import {
  identities,
  makeTest,
  seedRun,
  seedToolCall,
  seedUser,
  seedWorld,
} from "./helpers";

const expectedToolNames = [
  "firecrawl_search_web",
  "firecrawl_search_research",
  "firecrawl_search_developer",
  "firecrawl_map_site",
  "firecrawl_scrape_page",
  "firecrawl_batch_scrape",
  "firecrawl_crawl_site",
  "firecrawl_parse_document",
  "firecrawl_extract_structured",
  "firecrawl_query_page",
  "firecrawl_interact_page",
  "firecrawl_browser_research",
  "firecrawl_extract_media",
  "firecrawl_compare_page_change",
  "firecrawl_agent_gather",
  "list_stored_reports",
  "read_stored_report",
  "update_chat_title",
  "publish_report",
  "send_research_email",
  "create_research_schedule",
] as const;

const provider = {
  search: vi.fn(async () => ({
    web: [{ url: "https://example.com/search-result", title: "Search result" }],
    news: [],
    images: [],
  })),
  map: vi.fn(async () => ({ links: [{ url: "https://example.com/docs" }] })),
  scrape: vi.fn(async () => ({
    metadata: { scrapeId: "scrape-1", url: "https://example.com/page" },
    markdown: "Evidence from the page.",
    title: "Example page",
    statusCode: 200,
  })),
  startCrawl: vi.fn(async () => ({ id: "crawl-job" })),
  startBatchScrape: vi.fn(async () => ({ id: "batch-job" })),
  parse: vi.fn(async () => ({
    metadata: { scrapeId: "document-1" },
    markdown: "Parsed document.",
  })),
  research: {
    searchPapers: vi.fn(async () => ({
      results: [
        {
          title: "A paper",
          abstract: "Abstract evidence",
          ids: { doi: ["10.1000/example"] },
        },
      ],
    })),
  },
  interact: vi.fn(async () => ({ output: "Public interaction output" })),
  stopInteraction: vi.fn(async () => undefined),
  startAgent: vi.fn(async () => ({ id: "agent-job" })),
};

function makeToolContext(
  name: ToolExecutionContext["toolCall"]["functionName"],
  args: Record<string, unknown>,
  overrides: Partial<ToolExecutionContext> = {},
): ToolExecutionContext {
  const runMutation = vi.fn(async (_reference: unknown, mutationArgs: unknown) => {
    const record = mutationArgs as Record<string, unknown>;
    if (record.sources !== undefined && Array.isArray(record.sources)) {
      return record.sources.map((source, index) => ({
        sourceId: `000${index}researchSources`,
        canonicalUrl: (source as { canonicalUrl: string }).canonicalUrl,
      }));
    }
    if (record.providerJobId !== undefined) {
      return {
        jobId: "job-record",
        providerJobId: record.providerJobId,
      };
    }
    return { ok: true };
  });
  const context = {
    ctx: {
      runMutation,
      runQuery: vi.fn(),
      runAction: vi.fn(),
      scheduler: { runAfter: vi.fn() },
      storage: {
        get: vi.fn(async () => new Blob(["attachment"], { type: "application/pdf" })),
      },
    },
    toolCallId: "0001toolCalls",
    toolCall: {
      _id: "0001toolCalls",
      _creationTime: 1,
      ownerId: "0001users",
      runId: "0001researchRuns",
      openaiCallId: "call-routing",
      functionName: name,
      argumentsJson: JSON.stringify(args),
      argumentsHash: "hash",
      idempotencyKey: "key",
      status: "running",
      requestedAt: 1,
    },
    run: {
      _id: "0001researchRuns",
      _creationTime: 1,
      ownerId: "0001users",
      botId: "0001bots",
      chatId: "0001chats",
      triggerMessageId: "0001messages",
      triggerKind: "web",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      researchProtocolVersion: 1,
      workerGeneration: 1,
      status: "researching",
      currentStage: "researching",
      createdAt: 1,
      updatedAt: 1,
      cancelRequested: false,
    },
    chat: {
      _id: "0001chats",
      _creationTime: 1,
      ownerId: "0001users",
      botId: "0001bots",
      titleLocked: true,
      status: "active",
      activeRunId: "0001researchRuns",
      createdAt: 1,
      updatedAt: 1,
    },
    bot: {
      _id: "0001bots",
      _creationTime: 1,
      ownerId: "0001users",
      name: "Routing Bot",
      mission: "Research",
      recipientEmail: "owner@example.com",
      instructionVersion: 0,
      avatarKind: "default",
      avatarColorIndex: 0,
      emailCapability: "active",
      status: "active",
      creationOrdinal: 1,
      createdAt: 1,
      updatedAt: 1,
    },
    args,
    attachments: [],
    ...overrides,
  } as unknown as ToolExecutionContext;
  return context;
}

function schemaObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(schemaObjects);
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  const nested = [record.anyOf, record.oneOf, record.allOf, record.items];
  const properties = record.properties;
  if (typeof properties === "object" && properties !== null) {
    nested.push(...Object.values(properties as Record<string, unknown>));
  }
  return [record, ...nested.flatMap(schemaObjects)];
}

describe("Firecrawl routing and function contracts", () => {
  it("exposes exactly the twenty-one approved tool names", () => {
    expect(TOOL_FUNCTION_NAMES).toEqual(expectedToolNames);
    expect(FIRECRAWL_TOOL_NAMES).toHaveLength(15);
    expect(getResearchToolDefinitions({ includeChatTitle: true, includeResearchEmail: true })).toHaveLength(21);
  });

  it("marks every object schema strict and rejects unknown properties", () => {
    const definitions = getResearchToolDefinitions({
      includeChatTitle: true,
      includeResearchEmail: true,
    });
    for (const definition of definitions) {
      expect(definition.strict).toBe(true);
      for (const schema of schemaObjects(definition.parameters)) {
        if (schema.type === "object") expect(schema.additionalProperties).toBe(false);
      }
    }

    const invalid = validateToolArguments(
      "firecrawl_scrape_page",
      JSON.stringify({
        url: "https://example.com",
        formats: null,
        onlyMainContent: null,
        maxAgeMs: null,
        unexpected: true,
      }),
    );
    expect(invalid).toMatchObject({ ok: false, code: "invalid_arguments" });
  });

  it("routes known URL, domain breadth, bounded crawl, URL lists, and documents correctly", async () => {
    vi.mocked(getFirecrawlClient).mockReturnValue(provider as never);

    const scrape = await executeRegisteredTool(
      "firecrawl_scrape_page",
      makeToolContext("firecrawl_scrape_page", {
        url: "https://example.com/page",
        formats: ["markdown"],
        onlyMainContent: true,
        maxAgeMs: null,
      }),
    );
    const map = await executeRegisteredTool(
      "firecrawl_map_site",
      makeToolContext("firecrawl_map_site", {
        url: "https://example.com",
        search: null,
        limit: 25,
        includeSubdomains: false,
      }),
    );
    const crawl = await executeRegisteredTool(
      "firecrawl_crawl_site",
      makeToolContext("firecrawl_crawl_site", {
        url: "https://example.com",
        limit: 20,
        maxDepth: 2,
        includePaths: null,
        excludePaths: null,
        includeSubdomains: false,
        allowExternalLinks: false,
        formats: ["markdown"],
      }),
    );
    const batch = await executeRegisteredTool(
      "firecrawl_batch_scrape",
      makeToolContext("firecrawl_batch_scrape", {
        urls: ["https://example.com/a", "https://example.com/b"],
        formats: ["markdown"],
        onlyMainContent: true,
        maxAgeMs: null,
      }),
    );
    const parse = await executeRegisteredTool(
      "firecrawl_parse_document",
      makeToolContext("firecrawl_parse_document", {
        url: null,
        attachmentId: "0001messageAttachments",
        perPage: true,
        includeLayout: false,
        ocr: false,
      }, {
        attachments: [
          {
            id: "0001messageAttachments" as never,
            storageId: "0001_storage" as never,
            fileName: "paper.pdf",
            mimeType: "application/pdf",
            sizeBytes: 100,
            status: "bound",
          },
        ],
      }),
    );

    expect(scrape).toMatchObject({ kind: "immediate" });
    expect(map).toMatchObject({ kind: "immediate" });
    expect(crawl).toMatchObject({ kind: "async", providerJobId: "crawl-job" });
    expect(batch).toMatchObject({ kind: "async", providerJobId: "batch-job" });
    expect(parse).toMatchObject({ kind: "immediate" });
    expect(provider.scrape).toHaveBeenCalled();
    expect(provider.map).toHaveBeenCalledWith(
      "https://example.com/",
      expect.objectContaining({ limit: 25 }),
    );
    expect(provider.startCrawl).toHaveBeenCalledWith(
      "https://example.com/",
      expect.objectContaining({ limit: 20, maxDiscoveryDepth: 2 }),
    );
    expect(provider.startBatchScrape).toHaveBeenCalledWith(
      ["https://example.com/a", "https://example.com/b"],
      expect.objectContaining({
        idempotencyKey: "parallex-0001toolCalls",
      }),
    );
    expect(provider.parse).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "paper.pdf", contentType: "application/pdf" }),
      expect.any(Object),
    );
  });

  it("uses specialized academic and developer search paths", async () => {
    vi.mocked(getFirecrawlClient).mockReturnValue(provider as never);
    await executeRegisteredTool(
      "firecrawl_search_research",
      makeToolContext("firecrawl_search_research", {
        query: "distributed systems papers",
        mode: "academic",
        limit: 5,
        publishedAfter: null,
        publishedBefore: null,
      }),
    );
    await executeRegisteredTool(
      "firecrawl_search_developer",
      makeToolContext("firecrawl_search_developer", {
        query: "Convex pagination",
        source: "documentation",
        limit: 5,
      }),
    );

    expect(provider.search).toHaveBeenCalledWith(
      "distributed systems papers",
      expect.objectContaining({ categories: ["research"], limit: 5 }),
    );
    expect(provider.search).toHaveBeenCalledWith(
      "Convex pagination",
      expect.objectContaining({ categories: ["developer"], limit: 5 }),
    );
  });

  it("claims independent calls together and dependent phases in order", async () => {
    const t = makeTest();
    const owner = await seedUser(t, identities.ownerA, "Owner A");
    const world = await seedWorld(t, owner);
    const run = await seedRun(t, world, owner.userId, {
      status: "researching",
      workerGeneration: 1,
      leaseExpiresAt: Date.now() + 60_000,
    });
    const originResponseId = "origin-response";
    const firstSearch = await seedToolCall(t, run.runId, owner.userId, "firecrawl_search_web", {
      openaiCallId: "search-one",
      status: "validated",
      originResponseId,
    });
    const secondSearch = await seedToolCall(t, run.runId, owner.userId, "firecrawl_search_web", {
      openaiCallId: "search-two",
      status: "validated",
      originResponseId,
    });
    const reportCall = await seedToolCall(t, run.runId, owner.userId, "publish_report", {
      openaiCallId: "report-one",
      status: "validated",
      originResponseId,
    });
    const emailCall = await seedToolCall(t, run.runId, owner.userId, "send_research_email", {
      openaiCallId: "email-one",
      status: "validated",
      originResponseId,
    });

    expect(toolPhase("firecrawl_search_web")).toBe(1);
    expect(toolPhase("publish_report")).toBe(2);
    expect(toolPhase("send_research_email")).toBe(3);
    const firstPhase = await t.mutation(internal.workers.runMutations.claimToolPhase, {
      runId: run.runId,
      generation: 1,
      originResponseId,
    });
    expect(new Set(firstPhase.toolCallIds)).toEqual(new Set([firstSearch, secondSearch]));

    for (const toolCallId of [firstSearch, secondSearch]) {
      await t.mutation(internal.workers.runMutations.completeToolCall, {
        toolCallId,
        status: "succeeded",
        outputJson: "{}",
      });
    }
    const reportPhase = await t.mutation(internal.workers.runMutations.claimToolPhase, {
      runId: run.runId,
      generation: 1,
      originResponseId,
    });
    expect(reportPhase.toolCallIds).toEqual([reportCall]);
    await t.mutation(internal.workers.runMutations.completeToolCall, {
      toolCallId: reportCall,
      status: "succeeded",
      outputJson: "{}",
    });
    const emailPhase = await t.mutation(internal.workers.runMutations.claimToolPhase, {
      runId: run.runId,
      generation: 1,
      originResponseId,
    });
    expect(emailPhase).toMatchObject({ state: "terminal", toolCallIds: [] });
    const email = await t.run(async (ctx) => ctx.db.get("toolCalls", emailCall));
    expect(email?.status).toBe("failed");
    expect(email?.failureCode).toBe("report_required");
  });

  it("rejects unsafe URLs and private interaction goals before provider calls", async () => {
    vi.mocked(getFirecrawlClient).mockReturnValue(provider as never);
    const unsafeUrl = await executeRegisteredTool(
      "firecrawl_scrape_page",
      makeToolContext("firecrawl_scrape_page", {
        url: "http://127.0.0.1/admin",
        formats: ["markdown"],
        onlyMainContent: true,
        maxAgeMs: null,
      }),
    );
    const unsafeGoal = await executeRegisteredTool(
      "firecrawl_interact_page",
      makeToolContext("firecrawl_interact_page", {
        url: "https://example.com",
        goal: "Log in with a password and inspect the private account",
        maxSteps: 3,
      }),
    );

    expect(unsafeUrl).toMatchObject({ kind: "failed" });
    expect(unsafeGoal).toMatchObject({ kind: "failed" });
    expect(provider.scrape).not.toHaveBeenCalledWith(
      "http://127.0.0.1/admin",
      expect.anything(),
    );
    expect(provider.interact).not.toHaveBeenCalled();
  });
});
