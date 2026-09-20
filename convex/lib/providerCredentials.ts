import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ProviderId } from "./models";

export async function getActiveProviderCredential(
  ctx: Pick<MutationCtx, "db">,
  ownerId: Id<"users">,
  provider: ProviderId,
) {
  if (provider === "zhipu") {
    return await ctx.db
      .query("zhipuCredentials")
      .withIndex("by_owner_status", (q) =>
        q.eq("ownerId", ownerId).eq("status", "active"),
      )
      .first();
  }
  return await ctx.db
    .query("openaiCredentials")
    .withIndex("by_owner_status", (q) =>
      q.eq("ownerId", ownerId).eq("status", "active"),
    )
    .first();
}
