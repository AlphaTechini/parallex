import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { getAuthenticatedUserId, requireOwnedBot } from "./lib/authHelpers";
import { canonicalizeUrl, sha256Hex } from "./lib/normalize";
import { getActiveOpenAICredential } from "./lib/providerCredentials";
import { isValidTimeZone, normalizeRecurrence } from "./lib/recurrence";
import { v } from "convex/values";

const occurrenceWorker = makeFunctionReference<
  "mutation",
  { scheduleId: Id<"researchSchedules">; scheduledFor: number }
>("scheduleOccurrenceWorker:run");

const FIRST_CHECK_DELAY_MS = 60_000;

function monitorPrompt(
  url: string,
  tag: string,
  changeDescription: string | undefined,
): string {
  const changeFocus = changeDescription
    ? `Alert only when this specific change is present: ${changeDescription}`
    : "Alert on any meaningful visible content or availability change.";
  return `WEBSITE MONITOR\nTarget URL: ${url}\nChange-tracking tag: ${tag}\n${changeFocus}\n\nOn every run, call firecrawl_compare_page_change exactly once with this target URL, this exact tag, and includeFullContent set to true. Do not use search, map, crawl, scrape, browser, or any other web function.\n\nThe first successful check establishes a baseline. State that briefly in chat, but do not publish a report or send email. On later checks, if no relevant change is reported, reply briefly in chat and do not publish a report or send email. If a relevant change is reported, summarize the old and new information with the target URL as the only source, publish a concise report, then send that report by email.`;
}

export const create = mutation({
  args: {
    botId: v.id("bots"),
    url: v.string(),
    frequency: v.union(v.literal("daily"), v.literal("every_three_days")),
    changeDescription: v.optional(v.string()),
    timezone: v.string(),
  },
  returns: v.object({
    scheduleId: v.id("researchSchedules"),
    chatId: v.id("chats"),
    nextRunAt: v.number(),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const bot = await requireOwnedBot(ctx, ownerId, args.botId);
    if (bot.status !== "active") throw new Error("NOT_FOUND");
    if (!isValidTimeZone(args.timezone)) throw new Error("INVALID_TIMEZONE");

    let monitorUrl: string;
    try {
      monitorUrl = canonicalizeUrl(args.url);
    } catch {
      throw new Error("INVALID_MONITOR_URL");
    }
    if (monitorUrl.length > 2_048) throw new Error("INVALID_MONITOR_URL");
    const changeDescription = args.changeDescription
      ?.replace(/\u0000/g, "")
      .trim()
      .slice(0, 2_000) || undefined;

    if ((await getActiveOpenAICredential(ctx, ownerId)) === null) {
      throw new Error("NO_ACTIVE_PROVIDER");
    }
    const provider = "openai";
    const model = "gpt-5.6-terra";
    const reasoningEffort = "medium";

    const existing = await ctx.db
      .query("researchSchedules")
      .withIndex("by_owner_bot_monitor_url", (q) =>
        q.eq("ownerId", ownerId).eq("botId", bot._id).eq("monitorUrl", monitorUrl),
      )
      .take(20);
    const matching = existing.find(
      (schedule) =>
        schedule.status !== "deleted" &&
        schedule.monitorChangeDescription === changeDescription,
    );
    if (matching !== undefined) {
      return {
        scheduleId: matching._id,
        chatId: matching.chatId,
        nextRunAt: matching.nextRunAt,
        created: false,
      };
    }

    const now = Date.now();
    const nextRunAt = now + FIRST_CHECK_DELAY_MS;
    const recurrence = normalizeRecurrence(
      {
        frequency: "daily",
        interval: args.frequency === "daily" ? 1 : 3,
        hour: null,
        minute: null,
        weekday: null,
        dayOfMonth: null,
      },
      args.timezone,
      nextRunAt,
    );
    const urlHash = await sha256Hex(monitorUrl);
    const ruleHash = await sha256Hex(changeDescription ?? "any-change");
    const monitorTag = `site-monitor:${urlHash.slice(0, 32)}`;
    const hostname = new URL(monitorUrl).hostname;
    const chatId = await ctx.db.insert("chats", {
      ownerId,
      botId: bot._id,
      title: `Monitor: ${hostname}`,
      titleSource: "fallback",
      titleLocked: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const scheduleId = await ctx.db.insert("researchSchedules", {
      ownerId,
      botId: bot._id,
      chatId,
      provider,
      model,
      reasoningEffort,
      name: `Monitor ${hostname}`,
      researchPrompt: monitorPrompt(monitorUrl, monitorTag, changeDescription),
      semanticReason: `website-monitor:${urlHash}:${ruleHash}`,
      monitorUrl,
      monitorChangeDescription: changeDescription,
      monitorTag,
      scheduleKind: "recurring",
      timezone: args.timezone,
      recurrence,
      nextRunAt,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const scheduledFunctionId = await ctx.scheduler.runAt(
      nextRunAt,
      occurrenceWorker,
      { scheduleId, scheduledFor: nextRunAt },
    );
    await ctx.db.patch("researchSchedules", scheduleId, {
      convexScheduledFunctionId: scheduledFunctionId,
      updatedAt: Date.now(),
    });
    return { scheduleId, chatId, nextRunAt, created: true };
  },
});
