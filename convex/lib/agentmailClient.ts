"use node";

import { AgentMailClient } from "agentmail";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";

export type ProvisionedInbox = {
  providerInboxId: string;
  confirmedAddress: string;
  providerDomainId?: string;
};

export type SendAttachmentInput = {
  filename: string;
  contentBase64: string;
  contentType: string;
};

export type SendMessageInput = {
  inboxId: string;
  to: string;
  subject: string;
  text: string;
  attachment: SendAttachmentInput;
  idempotencyKey: string;
};

export type SentMessage = {
  messageId: string;
  threadId: string;
};

export type ReplyMessageInput = {
  inboxId: string;
  threadId?: string;
  messageId?: string;
  text: string;
  idempotencyKey: string;
};

export function getAgentMailClient(): AgentMailClient {
  const apiKey = process.env.AGENTMAIL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AGENTMAIL_NOT_CONFIGURED");
  }
  return new AgentMailClient({ apiKey });
}

function normalizedMessageText(value: string | undefined): string {
  return value?.replace(/\u0000/g, "").trim().slice(0, 10_000) ?? "";
}

export const fetchMessageContent = internalAction({
  args: {
    inboxId: v.string(),
    messageId: v.string(),
  },
  handler: async (_ctx, args) => {
    const message = await getAgentMailClient().inboxes.messages.get(
      args.inboxId,
      args.messageId,
    );
    const extractedText = normalizedMessageText(message.extractedText);
    const text = extractedText || normalizedMessageText(message.text);
    return {
      content: text,
      timestamp: message.timestamp.toISOString(),
    };
  },
});

export async function createInboxWithUsername(
  username: string,
  clientId: string,
): Promise<ProvisionedInbox> {
  const inbox = await getAgentMailClient().inboxes.create({
    username,
    clientId,
  });
  return {
    providerInboxId: inbox.inboxId,
    confirmedAddress: inbox.email,
  };
}

export async function sendMessageWithAttachment({
  inboxId,
  to,
  subject,
  text,
  attachment,
  idempotencyKey,
}: SendMessageInput): Promise<SentMessage> {
  const sent = await getAgentMailClient().inboxes.messages.send(
    inboxId,
    {
      to,
      subject,
      text,
      attachments: [
        {
          filename: attachment.filename,
          content: attachment.contentBase64,
          contentType: attachment.contentType,
        },
      ],
    },
    { idempotencyKey },
  );
  return { messageId: sent.messageId, threadId: sent.threadId };
}

export async function replyToMessage({
  inboxId,
  threadId,
  messageId,
  text,
  idempotencyKey,
}: ReplyMessageInput): Promise<SentMessage> {
  let replyTarget = messageId;
  if (!replyTarget && threadId) {
    const thread = await getAgentMailClient().inboxes.threads.get(
      inboxId,
      threadId,
    );
    replyTarget = thread.lastMessageId;
  }
  if (!replyTarget) {
    throw new Error("MISSING_REPLY_TARGET");
  }

  const sent = await getAgentMailClient().inboxes.messages.reply(
    inboxId,
    replyTarget,
    { text },
    { idempotencyKey },
  );
  return { messageId: sent.messageId, threadId: sent.threadId };
}
