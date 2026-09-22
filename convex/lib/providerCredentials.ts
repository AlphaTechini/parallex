import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function getActiveOpenAICredential(
  ctx: Pick<MutationCtx, "db">,
  ownerId: Id<"users">,
) {
  return await ctx.db
    .query("openaiCredentials")
    .withIndex("by_owner_status", (q) =>
      q.eq("ownerId", ownerId).eq("status", "active"),
    )
    .first();
}
