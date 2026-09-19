"use node";

import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { createInboxWithUsername } from "../lib/agentmailClient";
import { sanitizeErrorCode } from "../lib/normalize";
import { v } from "convex/values";

function isUsernameUnavailable(error: unknown): boolean {
  const record =
    typeof error === "object" && error !== null
      ? error as Record<string, unknown>
      : {};
  const statusCode =
    typeof record.statusCode === "number" ? record.statusCode : undefined;
  const message =
    typeof record.message === "string" ? record.message.toLowerCase() : "";
  return (
    statusCode === 409 ||
    (statusCode === 422 &&
      /username|address|taken|unavailable|already exists/.test(message))
  );
}

export const provision = internalAction({
  args: { inboxId: v.id("agentMailInboxes") },
  handler: async (ctx, args) => {
    const { inbox, bot } = await ctx.runMutation(internal.inboxes.loadById, {
      inboxId: args.inboxId,
    });
    if (
      inbox.status === "active" ||
      inbox.status === "deleted" ||
      bot.status !== "active" ||
      bot.ownerId !== inbox.ownerId
    ) {
      return { ok: true };
    }

    const candidates = [
      inbox.desiredUsername,
      ...Array.from({ length: 4 }, (_, index) =>
        `${inbox.desiredUsername}-${index + 2}`,
      ),
    ];

    for (const candidate of candidates) {
      await ctx.runMutation(internal.inboxes.markCreating, {
        inboxId: inbox._id,
      });
      try {
        const created = await createInboxWithUsername(
          candidate,
          inbox.provisioningIdempotencyKey,
        );
        await ctx.runMutation(internal.inboxes.markActive, {
          inboxId: inbox._id,
          providerInboxId: created.providerInboxId,
          confirmedAddress: created.confirmedAddress,
          providerDomainId: created.providerDomainId,
        });
        return { ok: true };
      } catch (error) {
        if (isUsernameUnavailable(error)) {
          continue;
        }
        await ctx.runMutation(internal.inboxes.markFailed, {
          inboxId: inbox._id,
          errorCode: sanitizeErrorCode(error),
        });
        return { ok: false };
      }
    }

    await ctx.runMutation(internal.inboxes.markFailed, {
      inboxId: inbox._id,
      errorCode: "username_unavailable",
    });
    return { ok: false };
  },
});
