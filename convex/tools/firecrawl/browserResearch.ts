"use node";

import { makeFunctionReference } from "convex/server";

import {
  assertPublicUrl,
  assertPublicUrlsInText,
  getFirecrawlClient,
  normalizeGoal,
} from "../../lib/firecrawlClient";
import type { ExecutorResult, ToolExecutionContext } from "../types";
import {
  asProviderDocument,
  documentSource,
  isTargetStatusError,
  persistAndBuildImmediateResult,
  providerErrorResult,
  textValue,
} from "./shared";
import {
  MAX_DOCUMENT_EVIDENCE_CHARS,
  MAX_RESULT_DOCUMENTS,
} from "./outputBudget";

const assertLive = makeFunctionReference<"mutation">("firecrawlJobs:assertToolCallLive");
type BrowserSource = NonNullable<ReturnType<typeof documentSource>>;

function extractGoalUrls(goal: string): string[] {
  return Array.from(
    new Set(
      (goal.match(/https?:\/\/[^\s"'<>]+/gi) ?? []).map((candidate) =>
        candidate.replace(/[),.;]+$/, ""),
      ),
    ),
  );
}

function goalTerms(goal: string): string[] {
  return Array.from(
    new Set(
      goal
        .toLowerCase()
        .replace(/https?:\/\/[^\s"'<>]+/g, " ")
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 3),
    ),
  ).slice(0, 24);
}

function browserWorkflowCode(
  startUrl: string,
  terms: string[],
  goalUrls: string[],
  maxSteps: number,
): string {
  return `
const startUrl = ${JSON.stringify(startUrl)};
const startOrigin = ${JSON.stringify(new URL(startUrl).origin)};
const terms = ${JSON.stringify(terms)};
const goalUrls = ${JSON.stringify(goalUrls)};
const maxSteps = ${maxSteps};
const visited = new Set();
const pages = [];

async function capture(response, fallbackUrl) {
  const url = page.url() || fallbackUrl;
  const title = await page.title().catch(() => "");
  const markdown = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
  return {
    url,
    title,
    statusCode: response && typeof response.status === "function" ? response.status() : undefined,
    markdown: String(markdown).replace(/\\u0000/g, "").slice(0, ${MAX_DOCUMENT_EVIDENCE_CHARS}),
  };
}

let response = await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
for (let step = 0; step < maxSteps; step += 1) {
  const current = await capture(response, startUrl);
  if (!visited.has(current.url)) {
    visited.add(current.url);
    pages.push(current);
  }
  if (current.statusCode >= 400 || step + 1 >= maxSteps) break;

  const links = await page.locator("a").evaluateAll((anchors, payload) => {
    return anchors
      .map((anchor) => {
        const href = anchor.getAttribute("href");
        const label = (anchor.textContent || "").trim();
        if (!href) return null;
        let url;
        try {
          url = new URL(href, location.href);
        } catch {
          return null;
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        const text = (label + " " + url.href).toLowerCase();
        const score = payload.terms.reduce(
          (total, term) => total + (text.includes(term) ? 1 : 0),
          0,
        );
        return { url: url.href, score };
      })
      .filter((entry) => entry !== null)
      .sort((left, right) => right.score - left.score);
  }, { terms, startOrigin, goalUrls });

  const next = links.find((entry) => {
    if (visited.has(entry.url)) return false;
    try {
      const url = new URL(entry.url);
      return url.origin === startOrigin || goalUrls.includes(url.href);
    } catch {
      return false;
    }
  });
  if (!next) break;
  response = await page
    .goto(next.url, { waitUntil: "domcontentloaded", timeout: 20000 })
    .catch(() => null);
  if (!response) break;
}

JSON.stringify({ pages });
`;
}

function responseText(response: {
  result?: string;
  output?: string;
  stdout?: string;
}): string {
  return response.result ?? response.output ?? response.stdout ?? "";
}

function pageRecords(value: unknown, fallbackUrl: string): Array<Record<string, unknown>> {
  if (typeof value === "string") return [{ url: fallbackUrl, markdown: value }];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [{ url: fallbackUrl, markdown: "" }];
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.pages)) {
    return [
      {
        url: fallbackUrl,
        markdown: responseText(record as { result?: string; output?: string; stdout?: string }),
      },
    ];
  }
  return record.pages
    .slice(0, MAX_RESULT_DOCUMENTS)
    .flatMap((page) =>
      typeof page === "object" && page !== null && !Array.isArray(page)
        ? [page as Record<string, unknown>]
        : [],
    );
}

function browserSources(
  records: Array<Record<string, unknown>>,
): { pages: Array<Record<string, unknown>>; sources: BrowserSource[] } {
  const pages: Array<Record<string, unknown>> = [];
  const sources: BrowserSource[] = [];
  for (const record of records) {
    const url = textValue(record.url, 2_048);
    if (!url) continue;
    const title = textValue(record.title, 500);
    const markdown = textValue(record.markdown, MAX_DOCUMENT_EVIDENCE_CHARS);
    const statusCode = typeof record.statusCode === "number" ? record.statusCode : undefined;
    const document = asProviderDocument({
      url,
      title,
      markdown,
      statusCode,
      metadata: { url, sourceURL: url, title, statusCode },
    });
    try {
      const source = documentSource(
        document,
        url,
        "web",
        "firecrawl_browser_research",
      );
      if (source !== undefined) sources.push(source);
      pages.push({ url, title, statusCode, markdown });
    } catch (error) {
      if (!isTargetStatusError(error)) throw error;
    }
  }
  if (records.length > 0 && pages.length === 0) {
    throw new Error("FIRECRAWL_TARGET_STATUS_INVALID");
  }
  return { pages, sources };
}

export async function execute(context: ToolExecutionContext): Promise<ExecutorResult> {
  let sessionId: string | undefined;
  let client: ReturnType<typeof getFirecrawlClient> | undefined;
  try {
    const checked = await assertPublicUrl(context.args.startUrl as string);
    const goal = normalizeGoal(context.args.goal as string);
    await assertPublicUrlsInText(goal);
    const goalUrls = [];
    for (const goalUrl of extractGoalUrls(goal)) {
      goalUrls.push((await assertPublicUrl(goalUrl)).url.toString());
    }
    await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
    client = getFirecrawlClient();
    const maxSteps = Math.max(1, Math.min(30, Math.trunc(Number(context.args.maxSteps))));
    const session = await client.browser({
      ttl: Math.min(600, Math.max(30, maxSteps * 20)),
      activityTtl: Math.min(300, Math.max(30, maxSteps * 10)),
      streamWebView: false,
    });
    if (!session.success || typeof session.id !== "string" || !session.id) {
      throw new Error("FIRECRAWL_BROWSER_SESSION_MISSING");
    }
    sessionId = session.id;
    await context.ctx.runMutation(assertLive, { toolCallId: context.toolCallId });
    const response = await client.browserExecute(sessionId, {
      code: browserWorkflowCode(
        checked.url.toString(),
        goalTerms(goal),
        goalUrls,
        maxSteps,
      ),
      language: "node",
      timeout: Math.min(180, Math.max(30, maxSteps * 6)),
    });
    if (!response.success) throw new Error("FIRECRAWL_BROWSER_EXECUTION_FAILED");
    const rawResult = responseText(response);
    let parsed: unknown = rawResult;
    try {
      parsed = JSON.parse(rawResult);
    } catch {
      // A plain execution result is still useful evidence for the start page.
    }
    const normalized = browserSources(pageRecords(parsed, checked.url.toString()));
    return await persistAndBuildImmediateResult(
      context,
      "firecrawl_browser_research",
      {
        startUrl: checked.url.toString(),
        goal,
        maxSteps,
        pages: normalized.pages,
      },
      normalized.sources,
    );
  } catch (error) {
    return providerErrorResult(error);
  } finally {
    if (sessionId !== undefined && client !== undefined) {
      try {
        await client.deleteBrowser(sessionId);
      } catch {
        // The provider TTL remains the cleanup fallback if deletion is interrupted.
      }
    }
  }
}
