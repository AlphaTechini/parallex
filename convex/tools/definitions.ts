import type { FunctionTool } from "openai/resources/responses/responses";

type JsonSchema = Record<string, unknown>;

const nullable = (schema: JsonSchema): JsonSchema => ({
  anyOf: [schema, { type: "null" }],
});

const stringSchema = (options: JsonSchema = {}): JsonSchema => ({
  type: "string",
  ...options,
});

const stringArray = (options: JsonSchema = {}): JsonSchema => ({
  type: "array",
  items: stringSchema(),
  ...options,
});

const objectSchema = (
  properties: Record<string, JsonSchema>,
  options: JsonSchema = {},
): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
  ...options,
});

const formats = {
  type: "array",
  items: {
    type: "string",
    enum: ["markdown", "links", "screenshot", "html", "rawHtml", "images", "summary"],
  },
  minItems: 1,
  maxItems: 4,
} satisfies JsonSchema;

const recurrenceSchema = objectSchema({
  frequency: nullable({
    type: "string",
    enum: ["hourly", "daily", "weekly", "monthly"],
  }),
  interval: nullable({ type: "integer", minimum: 1, maximum: 365 }),
  hour: nullable({ type: "integer", minimum: 0, maximum: 23 }),
  minute: nullable({ type: "integer", minimum: 0, maximum: 59 }),
  weekday: nullable({ type: "integer", minimum: 1, maximum: 7 }),
  dayOfMonth: nullable({ type: "integer", minimum: 1, maximum: 31 }),
});

function tool(
  name: ToolFunctionName,
  description: string,
  parameters: JsonSchema,
): FunctionTool {
  return { type: "function", name, description, parameters, strict: true };
}

export const TOOL_FUNCTION_NAMES = [
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

export type ToolFunctionName = (typeof TOOL_FUNCTION_NAMES)[number];

const TOOL_NAME_SET = new Set<string>(TOOL_FUNCTION_NAMES);

export function isToolFunctionName(value: string): value is ToolFunctionName {
  return TOOL_NAME_SET.has(value);
}

export const FIRECRAWL_TOOL_NAMES = TOOL_FUNCTION_NAMES.filter((name) =>
  name.startsWith("firecrawl_"),
);

const TOOL_DEFINITIONS: readonly FunctionTool[] = [
  tool(
    "firecrawl_search_web",
    "Discover web, news, or image sources for a topic. Search results are discovery signals; fetch full content for important claims. Use scrape instead for one known URL.",
    objectSchema({
      query: stringSchema({ minLength: 1, maxLength: 1000 }),
      sources: nullable({
        type: "array",
        items: { type: "string", enum: ["web", "news", "images"] },
        minItems: 1,
        maxItems: 3,
      }),
      limit: nullable({ type: "integer", minimum: 1, maximum: 20 }),
      includeDomains: nullable(stringArray({ maxItems: 20 })),
      excludeDomains: nullable(stringArray({ maxItems: 20 })),
      location: nullable(stringSchema({ maxLength: 200 })),
      country: nullable(stringSchema({ pattern: "^[A-Z]{2}$" })),
      timeRange: nullable({
        type: "string",
        enum: ["day", "week", "month", "year"],
      }),
      scrapeResults: nullable({ type: "boolean" }),
    }),
  ),
  tool(
    "firecrawl_search_research",
    "Discover papers, studies, abstracts, and scholarly evidence. Fetch or parse selected full documents when conclusions depend on more than an abstract.",
    objectSchema({
      query: stringSchema({ minLength: 1, maxLength: 1000 }),
      mode: nullable({ type: "string", enum: ["academic", "index", "auto"] }),
      limit: nullable({ type: "integer", minimum: 1, maximum: 20 }),
      publishedAfter: nullable(stringSchema({ format: "date" })),
      publishedBefore: nullable(stringSchema({ format: "date" })),
    }),
  ),
  tool(
    "firecrawl_search_developer",
    "Discover official software documentation, public repositories, issues, pull requests, and implementation evidence. Prefer primary technical material.",
    objectSchema({
      query: stringSchema({ minLength: 1, maxLength: 1000 }),
      source: nullable({
        type: "string",
        enum: ["auto", "documentation", "repository", "issues", "pull_requests"],
      }),
      limit: nullable({ type: "integer", minimum: 1, maximum: 20 }),
    }),
  ),
  tool(
    "firecrawl_map_site",
    "Discover relevant URLs on a known public site without downloading every page. Select useful URLs for later scraping.",
    objectSchema({
      url: stringSchema({ format: "uri", maxLength: 2048 }),
      search: nullable(stringSchema({ maxLength: 500 })),
      limit: nullable({ type: "integer", minimum: 1, maximum: 100 }),
      includeSubdomains: nullable({ type: "boolean" }),
    }),
  ),
  tool(
    "firecrawl_scrape_page",
    "Fetch clean content from one exact public URL. Markdown is the normal evidence format; request other formats only when material.",
    objectSchema({
      url: stringSchema({ format: "uri", maxLength: 2048 }),
      formats: nullable(formats),
      onlyMainContent: nullable({ type: "boolean" }),
      maxAgeMs: nullable({ type: "integer", minimum: 0, maximum: 604800000 }),
    }),
  ),
  tool(
    "firecrawl_batch_scrape",
    "Fetch an explicit list of independent public URLs with common settings. Use crawl instead for recursive discovery.",
    objectSchema({
      urls: stringArray({ minItems: 1, maxItems: 20 }),
      formats: nullable(formats),
      onlyMainContent: nullable({ type: "boolean" }),
      maxAgeMs: nullable({ type: "integer", minimum: 0, maximum: 604800000 }),
    }),
  ),
  tool(
    "firecrawl_crawl_site",
    "Recursively fetch a bounded coherent public site section when map plus selective scrape is insufficient. Always use deliberate limits.",
    objectSchema({
      url: stringSchema({ format: "uri", maxLength: 2048 }),
      limit: { type: "integer", minimum: 1, maximum: 100 },
      maxDepth: { type: "integer", minimum: 1, maximum: 5 },
      includePaths: nullable(stringArray({ maxItems: 20 })),
      excludePaths: nullable(stringArray({ maxItems: 20 })),
      includeSubdomains: nullable({ type: "boolean" }),
      allowExternalLinks: nullable({ type: "boolean" }),
      formats: nullable(formats),
    }),
  ),
  tool(
    "firecrawl_parse_document",
    "Parse a public document URL or one approved attached document. Supply exactly one of url or attachmentId.",
    objectSchema({
      url: nullable(stringSchema({ format: "uri", maxLength: 2048 })),
      attachmentId: nullable(stringSchema({ minLength: 1, maxLength: 200 })),
      perPage: nullable({ type: "boolean" }),
      includeLayout: nullable({ type: "boolean" }),
      ocr: nullable({ type: "boolean" }),
    }),
  ),
  tool(
    "firecrawl_extract_structured",
    "Extract repeated comparable fields from known public pages. The JSON schema is supplied as a JSON-encoded string; preserve missing values and source URLs.",
    objectSchema({
      urls: stringArray({ minItems: 1, maxItems: 20 }),
      extractionPrompt: stringSchema({ minLength: 1, maxLength: 4000 }),
      jsonSchemaJson: stringSchema({ minLength: 2, maxLength: 20000 }),
    }),
  ),
  tool(
    "firecrawl_query_page",
    "Ask a narrow question or obtain relevant highlights from one known long public page. Use full scrape when broad context matters.",
    objectSchema({
      url: stringSchema({ format: "uri", maxLength: 2048 }),
      question: stringSchema({ minLength: 1, maxLength: 2000 }),
      mode: { type: "string", enum: ["question", "highlights"] },
    }),
  ),
  tool(
    "firecrawl_interact_page",
    "Perform a bounded non-sensitive interaction starting from a known public page when normal scraping cannot reveal the evidence. Never log in or bypass access controls.",
    objectSchema({
      url: stringSchema({ format: "uri", maxLength: 2048 }),
      goal: stringSchema({ minLength: 1, maxLength: 2000 }),
      maxSteps: { type: "integer", minimum: 1, maximum: 20 },
    }),
  ),
  tool(
    "firecrawl_browser_research",
    "Run a bounded multi-step workflow on public pages when scrape-bound interaction is insufficient. Never supply code, credentials, login, or private-account steps.",
    objectSchema({
      startUrl: stringSchema({ format: "uri", maxLength: 2048 }),
      goal: stringSchema({ minLength: 1, maxLength: 2000 }),
      maxSteps: { type: "integer", minimum: 1, maximum: 30 },
    }),
  ),
  tool(
    "firecrawl_extract_media",
    "Extract audio or video from a supported public media URL only when the media content itself is necessary and page text is insufficient.",
    objectSchema({
      url: stringSchema({ format: "uri", maxLength: 2048 }),
      mediaType: { type: "string", enum: ["audio", "video"] },
    }),
  ),
  tool(
    "firecrawl_compare_page_change",
    "Retrieve provider change evidence for a known public page in change-focused research. Convex remains the schedule authority.",
    objectSchema({
      url: stringSchema({ format: "uri", maxLength: 2048 }),
      tag: nullable(stringSchema({ maxLength: 200 })),
      includeFullContent: nullable({ type: "boolean" }),
    }),
  ),
  tool(
    "firecrawl_agent_gather",
    "Delegate a bounded hard-to-locate public-data subproblem when the correct sites and path are genuinely unknown. Verify consequential results directly.",
    objectSchema({
      goal: stringSchema({ minLength: 1, maxLength: 4000 }),
      outputSchemaJson: nullable(stringSchema({ maxLength: 20000 })),
      maxCredits: nullable({ type: "integer", minimum: 1, maximum: 100 }),
    }),
  ),
  tool(
    "list_stored_reports",
    "List the stored research reports of this conversation with their publish status and latest email delivery state. Use before resending a stored report or when the user asks to retry a failed delivery.",
    objectSchema({}),
  ),
  tool(
    "read_stored_report",
    "Read the stored markdown content of one report from this conversation by its report id. Use when a resend or retry needs the previously stored result.",
    objectSchema({
      reportId: stringSchema({ minLength: 1, maxLength: 64 }),
    }),
  ),
  tool(
    "update_chat_title",
    "Set a concise title for the current untitled conversation. This function is available only during the initial title step.",
    objectSchema({ title: stringSchema({ minLength: 1, maxLength: 120 }) }),
  ),
  tool(
    "publish_report",
    "Publish and persist a professional report after research is complete. The report must contain supported citations near claims.",
    objectSchema({
      title: stringSchema({ minLength: 1, maxLength: 300 }),
      summary: stringSchema({ minLength: 1, maxLength: 5000 }),
      markdownContent: stringSchema({ minLength: 1, maxLength: 500000 }),
    }),
  ),
  tool(
    "send_research_email",
    "Request delivery of a stored research report to the bot's configured recipient. The backend chooses the owned destination. Omit reportId to send the report from the current run; provide a reportId from list_stored_reports to resend an earlier stored report, for example when the user asks to retry a failed delivery.",
    objectSchema({
      subject: stringSchema({ minLength: 1, maxLength: 300 }),
      bodySummary: stringSchema({ minLength: 1, maxLength: 10000 }),
      reportId: nullable(stringSchema({ maxLength: 64 })),
    }),
  ),
  tool(
    "create_research_schedule",
    "Create a backend-validated future or recurring research task. Recurring work must concern information that can meaningfully change or accumulate.",
    objectSchema({
      name: stringSchema({ minLength: 1, maxLength: 200 }),
      researchPrompt: stringSchema({ minLength: 1, maxLength: 10000 }),
      semanticReason: stringSchema({ minLength: 1, maxLength: 1000 }),
      scheduleKind: { type: "string", enum: ["one_time", "recurring"] },
      timezone: stringSchema({ minLength: 1, maxLength: 100 }),
      nextRunAt: { type: "integer", minimum: 1 },
      recurrence: nullable(recurrenceSchema),
    }),
  ),
];

const TOOL_BY_NAME = new Map(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition]),
);

export function getResearchToolDefinitions({
  includeChatTitle,
  includeResearchEmail = true,
}: {
  includeChatTitle: boolean;
  includeResearchEmail?: boolean;
}): FunctionTool[] {
  return TOOL_DEFINITIONS.filter(
    (definition) =>
      (includeChatTitle || definition.name !== "update_chat_title") &&
      (includeResearchEmail || definition.name !== "send_research_email"),
  ).map((definition) => ({ ...definition }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSchema(value: unknown, schema: JsonSchema, path: string): string | null {
  const anyOf = schema.anyOf;
  if (Array.isArray(anyOf)) {
    const valid = anyOf.some(
      (candidate) => isRecord(candidate) && validateSchema(value, candidate, path) === null,
    );
    return valid ? null : `${path} does not match an allowed value`;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return `${path} is not an allowed value`;
  }

  switch (schema.type) {
    case "null":
      return value === null ? null : `${path} must be null`;
    case "boolean":
      return typeof value === "boolean" ? null : `${path} must be a boolean`;
    case "integer":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return `${path} must be a number`;
      }
      if (schema.type === "integer" && !Number.isInteger(value)) {
        return `${path} must be an integer`;
      }
      if (typeof schema.minimum === "number" && value < schema.minimum) {
        return `${path} is below the minimum`;
      }
      if (typeof schema.maximum === "number" && value > schema.maximum) {
        return `${path} is above the maximum`;
      }
      return null;
    }
    case "string": {
      if (typeof value !== "string") {
        return `${path} must be a string`;
      }
      if (typeof schema.minLength === "number" && value.length < schema.minLength) {
        return `${path} is too short`;
      }
      if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
        return `${path} is too long`;
      }
      if (schema.format === "uri") {
        try {
          const url = new URL(value);
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
            return `${path} must be a public HTTP URL`;
          }
        } catch {
          return `${path} must be a valid URL`;
        }
      }
      if (schema.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${path} must be an ISO date`;
      }
      if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) {
        return `${path} has an invalid format`;
      }
      return null;
    }
    case "array": {
      if (!Array.isArray(value)) {
        return `${path} must be an array`;
      }
      if (typeof schema.minItems === "number" && value.length < schema.minItems) {
        return `${path} has too few items`;
      }
      if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
        return `${path} has too many items`;
      }
      if (isRecord(schema.items)) {
        for (let index = 0; index < value.length; index += 1) {
          const error = validateSchema(value[index], schema.items, `${path}[${index}]`);
          if (error !== null) return error;
        }
      }
      return null;
    }
    case "object": {
      if (!isRecord(value)) {
        return `${path} must be an object`;
      }
      const properties = isRecord(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required)
        ? schema.required.filter((item): item is string => typeof item === "string")
        : [];
      for (const requiredProperty of required) {
        if (!(requiredProperty in value)) {
          return `${path}.${requiredProperty} is required`;
        }
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in properties)) return `${path}.${key} is not allowed`;
        }
      }
      for (const [key, propertyValue] of Object.entries(value)) {
        const propertySchema = properties[key];
        if (isRecord(propertySchema)) {
          const error = validateSchema(propertyValue, propertySchema, `${path}.${key}`);
          if (error !== null) return error;
        }
      }
      return null;
    }
    default:
      return `${path} has an unsupported schema`;
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function schemaAllowsNull(schema: JsonSchema): boolean {
  if (schema.type === "null") return true;
  return (
    Array.isArray(schema.anyOf) &&
    schema.anyOf.some((candidate) => isRecord(candidate) && schemaAllowsNull(candidate))
  );
}

function normalizeNullableArguments(value: unknown, schema: JsonSchema): unknown {
  if (Array.isArray(schema.anyOf) && value !== null) {
    const candidate = schema.anyOf.find(
      (item) => isRecord(item) && item.type !== "null",
    );
    return isRecord(candidate)
      ? normalizeNullableArguments(value, candidate)
      : value;
  }
  const items = schema.items;
  if (schema.type === "array" && Array.isArray(value) && isRecord(items)) {
    return value.map((item) => normalizeNullableArguments(item, items));
  }
  if (schema.type !== "object" || !isRecord(value)) return value;

  const properties = isRecord(schema.properties) ? schema.properties : {};
  const normalized: Record<string, unknown> = { ...value };
  for (const [key, propertySchema] of Object.entries(properties)) {
    if (!isRecord(propertySchema)) continue;
    if (!(key in normalized) && schemaAllowsNull(propertySchema)) {
      normalized[key] = null;
    } else if (key in normalized) {
      normalized[key] = normalizeNullableArguments(
        normalized[key],
        propertySchema,
      );
    }
  }
  return normalized;
}

export type ToolArgumentsValidation =
  | { ok: true; value: Record<string, unknown>; canonicalJson: string }
  | { ok: false; code: string; safeMessage: string };

export function validateToolArguments(
  name: string,
  argumentsJson: string,
): ToolArgumentsValidation {
  if (!isToolFunctionName(name)) {
    return { ok: false, code: "unknown_tool", safeMessage: "The requested function is not available." };
  }
  if (argumentsJson.length > 500000) {
    return { ok: false, code: "arguments_too_large", safeMessage: "The function arguments exceeded the allowed size." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson);
  } catch {
    return { ok: false, code: "invalid_json", safeMessage: "The function arguments were not valid JSON." };
  }
  const definition = TOOL_BY_NAME.get(name);
  if (definition === undefined || definition.parameters === null) {
    return { ok: false, code: "unknown_tool", safeMessage: "The requested function is not available." };
  }
  parsed = normalizeNullableArguments(parsed, definition.parameters);
  if (name === "firecrawl_search_web" && isRecord(parsed)) {
    if (Array.isArray(parsed.includeDomains) && parsed.includeDomains.length === 0) {
      parsed.includeDomains = null;
    }
    if (Array.isArray(parsed.excludeDomains) && parsed.excludeDomains.length === 0) {
      parsed.excludeDomains = null;
    }
    if (
      Array.isArray(parsed.includeDomains) &&
      parsed.includeDomains.length > 0 &&
      Array.isArray(parsed.excludeDomains) &&
      parsed.excludeDomains.length > 0
    ) {
      parsed.excludeDomains = null;
    }
  }
  const schemaError = validateSchema(parsed, definition.parameters, "$args");
  if (schemaError !== null || !isRecord(parsed)) {
    return {
      ok: false,
      code: "invalid_arguments",
      safeMessage: schemaError ?? "The function arguments must be an object.",
    };
  }

  if (name === "firecrawl_parse_document") {
    const hasUrl = typeof parsed.url === "string";
    const hasAttachment = typeof parsed.attachmentId === "string";
    if (hasUrl === hasAttachment) {
      return {
        ok: false,
        code: "invalid_arguments",
        safeMessage: "Provide exactly one document URL or attachment ID.",
      };
    }
  }
  if (name === "create_research_schedule") {
    const recurring = parsed.scheduleKind === "recurring";
    if (recurring !== (parsed.recurrence !== null)) {
      return {
        ok: false,
        code: "invalid_arguments",
        safeMessage: recurring
          ? "A recurring schedule requires recurrence settings."
          : "A one-time schedule cannot include recurrence settings.",
      };
    }
  }

  return {
    ok: true,
    value: parsed,
    canonicalJson: JSON.stringify(canonicalize(parsed)),
  };
}

export function toolPhase(name: ToolFunctionName): 1 | 2 | 3 {
  if (name === "publish_report") return 2;
  if (name === "send_research_email") return 3;
  return 1;
}
