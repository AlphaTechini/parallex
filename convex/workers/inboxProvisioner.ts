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
  const body =
    typeof record.body === "object" && record.body !== null
      ? record.body as Record<string, unknown>
      : {};
  const code = typeof body.code === "string" ? body.code.toLowerCase() : "";
  const bodyText = JSON.stringify(body).toLowerCase().slice(0, 4_000);
  const unavailableCode = ["already_exists", "resource_taken"].includes(code);
  const unavailableDetail =
    /username|address/.test(`${message} ${bodyText}`) &&
    /taken|unavailable|already exists|already in use/.test(`${message} ${bodyText}`);
  return [400, 409, 422].includes(statusCode ?? 0) && (unavailableCode || unavailableDetail);
}

function usernameCandidates(desiredUsername: string, botId: string): string[] {
  const uniqueSuffix = botId.slice(-8).toLowerCase();
  const uniqueBase = desiredUsername.slice(0, 30 - uniqueSuffix.length - 1).replace(/-+$/, "");
  return [
    desiredUsername,
    `${desiredUsername.slice(0, 28).replace(/-+$/, "")}-2`,
    `${desiredUsername.slice(0, 28).replace(/-+$/, "")}-3`,
    `${uniqueBase || "bot"}-${uniqueSuffix}`,
  ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
}

function matchesRequestedUsername(address: string, username: string): boolean {
  return address.trim().toLowerCase().split("@", 1)[0] === username;
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

    const candidates = usernameCandidates(inbox.desiredUsername, bot._id);

    for (const candidate of candidates) {
      await ctx.runMutation(internal.inboxes.markCreating, {
        inboxId: inbox._id,
      });
      try {
        const created = await createInboxWithUsername(
          candidate,
          inbox.provisioningIdempotencyKey,
        );
        if (!matchesRequestedUsername(created.confirmedAddress, candidate)) {
          throw new Error("AGENTMAIL_INBOX_IDENTITY_MISMATCH");
        }
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
