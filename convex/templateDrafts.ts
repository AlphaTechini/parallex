import { v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import schema from "./schema";
import { getAuthenticatedUserId } from "./lib/authHelpers";
import {
  compileTemplateMemory,
  normalizeTemplateSpecification,
  type TemplateSpecification,
} from "./lib/templateFramework";
import { TEMPLATE_FRAMEWORK_VERSION } from "../shared/templateFramework";

const importance = v.union(
  v.literal("essential"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
);

const category = v.union(
  v.literal("everyday"),
  v.literal("software"),
  v.literal("ai"),
  v.literal("hardware"),
  v.literal("custom"),
);

const schedule = v.object({
  id: v.string(),
  name: v.string(),
  summary: v.string(),
  researchPrompt: v.string(),
  frequency: v.union(
    v.literal("hourly"),
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
  ),
  interval: v.number(),
  localHour: v.number(),
  localMinute: v.number(),
  weekday: v.optional(v.number()),
  dayOfMonth: v.optional(v.number()),
});

const specificationFields = {
  name: v.string(),
  shortDescription: v.string(),
  mission: v.string(),
  outcome: v.string(),
  exampleRequest: v.string(),
  category,
  role: v.string(),
  intendedUser: v.string(),
  intakeQuestions: v.array(v.string()),
  hardConstraints: v.array(v.string()),
  evaluationCriteria: v.array(
    v.object({
      name: v.string(),
      description: v.string(),
      importance,
      weight: v.number(),
      priceRelevant: v.boolean(),
    }),
  ),
  pricingMethod: v.string(),
  researchWorkflow: v.array(v.string()),
  sourceStandards: v.array(v.string()),
  rankingMethod: v.array(v.string()),
  outputRequirements: v.array(v.string()),
  actionRules: v.array(v.string()),
  uncertaintyRules: v.array(v.string()),
  safetyBoundaries: v.array(v.string()),
  schedules: v.array(schedule),
};

const draftCard = v.object({
  _id: v.id("templateDrafts"),
  name: v.string(),
  shortDescription: v.string(),
  mission: v.string(),
  outcome: v.string(),
  category,
  status: v.union(
    v.literal("draft"),
    v.literal("published"),
    v.literal("archived"),
  ),
  scheduleCount: v.number(),
  deploymentCount: v.number(),
  updatedAt: v.number(),
});

function specificationFromDocument(
  draft: Doc<"templateDrafts">,
): TemplateSpecification {
  return {
    name: draft.name,
    shortDescription: draft.shortDescription,
    mission: draft.mission,
    outcome: draft.outcome,
    exampleRequest: draft.exampleRequest,
    category: draft.category,
    role: draft.role,
    intendedUser: draft.intendedUser,
    intakeQuestions: draft.intakeQuestions,
    hardConstraints: draft.hardConstraints,
    evaluationCriteria: draft.evaluationCriteria,
    pricingMethod: draft.pricingMethod,
    researchWorkflow: draft.researchWorkflow,
    sourceStandards: draft.sourceStandards,
    rankingMethod: draft.rankingMethod,
    outputRequirements: draft.outputRequirements,
    actionRules: draft.actionRules,
    uncertaintyRules: draft.uncertaintyRules,
    safetyBoundaries: draft.safetyBoundaries,
    schedules: draft.schedules,
  };
}

export const prepareDraftForTool = internalMutation({
  args: {
    toolCallId: v.id("toolCalls"),
    ...specificationFields,
  },
  returns: v.object({
    draftId: v.id("templateDrafts"),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("archived"),
    ),
    reviewPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const call = await ctx.db.get("toolCalls", args.toolCallId);
    if (call === null || call.functionName !== "create_template_draft") {
      throw new Error("TOOL_CALL_INVALID");
    }
    const run = await ctx.db.get("researchRuns", call.runId);
    const chat = run === null ? null : await ctx.db.get("chats", run.chatId);
    const bot = run === null ? null : await ctx.db.get("bots", run.botId);
    if (
      run === null ||
      chat === null ||
      bot === null ||
      call.ownerId !== run.ownerId ||
      chat.ownerId !== run.ownerId ||
      bot.ownerId !== run.ownerId ||
      run.chatId !== chat._id ||
      run.botId !== bot._id ||
      chat.botId !== bot._id ||
      chat.activeRunId !== run._id ||
      chat.status !== "active" ||
      bot.status !== "active" ||
      call.status !== "running" ||
      run.cancelRequested
    ) {
      throw new Error("TEMPLATE_DRAFT_CONTEXT_INVALID");
    }

    const existing = await ctx.db
      .query("templateDrafts")
      .withIndex("by_source_tool_call", (q) =>
        q.eq("sourceToolCallId", call._id),
      )
      .unique();
    if (existing !== null) {
      if (existing.ownerId !== run.ownerId) {
        throw new Error("TEMPLATE_DRAFT_IDEMPOTENCY_CONFLICT");
      }
      return {
        draftId: existing._id,
        status: existing.status,
        reviewPath: `/templates?draft=${existing._id}`,
      };
    }

    const { toolCallId, ...rawSpecification } = args;
    const specification = normalizeTemplateSpecification(rawSpecification);
    const now = Date.now();
    const draftId = await ctx.db.insert("templateDrafts", {
      ownerId: run.ownerId,
      sourceRunId: run._id,
      sourceBotId: bot._id,
      sourceToolCallId: toolCallId,
      idempotencyKey: `template-draft:${call._id}`,
      status: "draft",
      frameworkVersion: TEMPLATE_FRAMEWORK_VERSION,
      revision: 1,
      ...specification,
      deploymentCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return {
      draftId,
      status: "draft" as const,
      reviewPath: `/templates?draft=${draftId}`,
    };
  },
});

const card = (draft: Doc<"templateDrafts">) => ({
  _id: draft._id,
  name: draft.name,
  shortDescription: draft.shortDescription,
  mission: draft.mission,
  outcome: draft.outcome,
  category: draft.category,
  status: draft.status,
  scheduleCount: draft.schedules.length,
  deploymentCount: draft.deploymentCount,
  updatedAt: draft.updatedAt,
});

export const listMine = query({
  args: {},
  returns: v.object({
    drafts: v.array(draftCard),
    published: v.array(draftCard),
  }),
  handler: async (ctx) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const [drafts, published] = await Promise.all([
      ctx.db
        .query("templateDrafts")
        .withIndex("by_owner_status_updated", (q) =>
          q.eq("ownerId", ownerId).eq("status", "draft"),
        )
        .order("desc")
        .take(30),
      ctx.db
        .query("templateDrafts")
        .withIndex("by_owner_status_updated", (q) =>
          q.eq("ownerId", ownerId).eq("status", "published"),
        )
        .order("desc")
        .take(30),
    ]);
    return {
      drafts: drafts.map(card),
      published: published.map(card),
    };
  },
});

export const getMine = query({
  args: { draftId: v.id("templateDrafts") },
  returns: v.union(
    v.object({
      draft: schema.doc("templateDrafts"),
      compiledMemory: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const draft = await ctx.db.get("templateDrafts", args.draftId);
    if (draft === null || draft.ownerId !== ownerId) {
      return null;
    }
    return {
      draft,
      compiledMemory: compileTemplateMemory(specificationFromDocument(draft)),
    };
  },
});

export const listForRun = query({
  args: { runId: v.id("researchRuns") },
  returns: v.array(
    v.object({
      _id: v.id("templateDrafts"),
      name: v.string(),
      shortDescription: v.string(),
      status: v.union(
        v.literal("draft"),
        v.literal("published"),
        v.literal("archived"),
      ),
      reviewPath: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const run = await ctx.db.get("researchRuns", args.runId);
    if (run === null || run.ownerId !== ownerId) {
      throw new Error("NOT_FOUND");
    }
    const drafts = await ctx.db
      .query("templateDrafts")
      .withIndex("by_source_run", (q) => q.eq("sourceRunId", run._id))
      .order("desc")
      .take(10);
    return drafts
      .filter((draft) => draft.ownerId === ownerId)
      .map((draft) => ({
        _id: draft._id,
        name: draft.name,
        shortDescription: draft.shortDescription,
        status: draft.status,
        reviewPath: `/templates?draft=${draft._id}`,
      }));
  },
});

export const updateMine = mutation({
  args: {
    draftId: v.id("templateDrafts"),
    ...specificationFields,
  },
  returns: v.object({ revision: v.number(), compiledMemory: v.string() }),
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    const { draftId, ...rawSpecification } = args;
    const draft = await ctx.db.get("templateDrafts", draftId);
    if (
      draft === null ||
      draft.ownerId !== ownerId ||
      draft.status === "archived"
    ) {
      throw new Error("NOT_FOUND");
    }
    const specification = normalizeTemplateSpecification(rawSpecification);
    const revision = draft.revision + 1;
    await ctx.db.patch("templateDrafts", draft._id, {
      ...specification,
      frameworkVersion: TEMPLATE_FRAMEWORK_VERSION,
      revision,
      updatedAt: Date.now(),
    });
    return {
      revision,
      compiledMemory: compileTemplateMemory(specification),
    };
  },
});

export { specificationFromDocument };
