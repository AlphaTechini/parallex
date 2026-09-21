"use node";

import { makeFunctionReference } from "convex/server";
import { internalAction } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  agentMailIdempotencyKey,
  getAgentMailClient,
} from "../lib/agentmailClient";
import { sanitizeErrorCode } from "../lib/normalize";
import { v } from "convex/values";

type DraftContext = {
  draft: Doc<"outreachDrafts">;
  inbox: Doc<"agentMailInboxes"> & {
    providerInboxId: string;
    confirmedAddress: string;
  };
  message: Doc<"emailMessages">;
};

const getContext = makeFunctionReference<
  "query",
  { draftId: Id<"outreachDrafts"> },
  DraftContext
>("outreach:getApprovedDraftContext");
const markSent = makeFunctionReference<
  "mutation",
  {
    draftId: Id<"outreachDrafts">;
    providerMessageId: string;
    providerThreadId: string;
  },
  { ok: boolean }
>("outreach:markDraftSent");
const markFailed = makeFunctionReference<
  "mutation",
  { draftId: Id<"outreachDrafts">; failureCode: string },
  { ok: boolean }
>("outreach:markDraftFailed");

export const sendApprovedDraft = internalAction({
  args: { draftId: v.id("outreachDrafts") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(getContext, args);
    try {
      const sent = await getAgentMailClient().inboxes.messages.send(
        context.inbox.providerInboxId,
        {
          to: context.draft.recipientEmail,
          subject: context.draft.subject,
          text: context.draft.body,
        },
        {
          idempotencyKey: agentMailIdempotencyKey(
            `outreach:${context.draft._id}`,
          ),
        },
      );
      await ctx.runMutation(markSent, {
        draftId: context.draft._id,
        providerMessageId: sent.messageId,
        providerThreadId: sent.threadId,
      });
      return { ok: true };
    } catch (error) {
      await ctx.runMutation(markFailed, {
        draftId: context.draft._id,
        failureCode: sanitizeErrorCode(error),
      });
      return { ok: false };
    }
  },
});
