import { query } from "./_generated/server";
import { getAuthenticatedUserId, requireOwnedRun } from "./lib/authHelpers";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

export const listRunEvents = query({
  args: {
    runId: v.id("researchRuns"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthenticatedUserId(ctx);
    await requireOwnedRun(ctx, ownerId, args.runId);
    const page = await ctx.db
      .query("runEvents")
      .withIndex("by_owner_run_sequence", (q) =>
        q.eq("ownerId", ownerId).eq("runId", args.runId),
      )
      .order("asc")
      .paginate(args.paginationOpts);

    return {
      page: page.page.map((event) => ({
        _id: event._id,
        sequence: event.sequence,
        kind: event.kind,
        label: event.label,
        status: event.status,
        safeDetail: event.safeDetail ?? null,
        reasoningSummaryText: event.reasoningSummaryText ?? null,
        createdAt: event.createdAt,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
