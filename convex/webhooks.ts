import { makeFunctionReference } from "convex/server";
import { internalMutation, type ActionCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/normalize";
import { v } from "convex/values";

const processInbound = makeFunctionReference<
  "mutation",
  {
    providerEventId: string;
    eventType: string;
    payloadHash: string;
    providerInboxId: string;
    providerMessageId: string;
    providerThreadId: string;
    fromAddress: string;
    toAddresses: string[];
    subject: string;
    extractedText: string;
    providerTimestamp?: number;
  },
  unknown
>("inboundEmailProcessor:processInbound");
const updateDelivery = makeFunctionReference<
  "mutation",
  { providerEventId: string; eventType: string; payloadHash: string; providerMessageId: string; providerTimestamp?: number },
  unknown
>("webhooks:processDelivery");
const recordRejectedRef = makeFunctionReference<
  "mutation",
  { providerEventId: string; eventType: string; payloadHash: string; failureCode: string },
  unknown
>("webhooks:recordRejected");

const DELIVERY_EVENTS = new Set([
  "message.sent",
  "message.delivered",
  "message.bounced",
  "message.complained",
  "message.rejected",
]);

function headerValue(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);
  return value === null ? undefined : value;
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return copy;
}

async function verifySvix(
  rawBody: Uint8Array,
  headers: Headers,
  secret: string,
): Promise<{ ok: boolean; providerEventId?: string }> {
  const id = headerValue(headers, "svix-id");
  const timestamp = headerValue(headers, "svix-timestamp");
  const signature = headerValue(headers, "svix-signature");
  if (!id || !timestamp || !signature || !/^\d+$/.test(timestamp)) return { ok: false, providerEventId: id };
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1_000 - timestampSeconds) > 300) {
    return { ok: false, providerEventId: id };
  }
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = decodeBase64(rawSecret);
  } catch {
    return { ok: false, providerEventId: id };
  }
  const key = await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(secretBytes),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedContent = `${id}.${timestamp}.${new TextDecoder().decode(rawBody)}`;
  const candidates = signature
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .map((entry) => entry.slice(3));
  for (const candidate of candidates) {
    try {
      if (
        await crypto.subtle.verify(
          "HMAC",
          key,
          ownedArrayBuffer(decodeBase64(candidate)),
          ownedArrayBuffer(new TextEncoder().encode(signedContent)),
        )
      ) return { ok: true, providerEventId: id };
    } catch {
      continue;
    }
  }
  return { ok: false, providerEventId: id };
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
}

function parsedTimestamp(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function appendDeliveryEvent(
  ctx: MutationCtx,
  message: { ownerId: Id<"users">; runId?: Id<"researchRuns"> },
  status: "accepted" | "delivered" | "failed",
) {
  if (message.runId === undefined) return;
  const run = await ctx.db.get("researchRuns", message.runId);
  if (run === null || run.ownerId !== message.ownerId) return;
  const last = await ctx.db
    .query("runEvents")
    .withIndex("by_run_sequence", (q) => q.eq("runId", run._id))
    .order("desc")
    .first();
  await ctx.db.insert("runEvents", {
    ownerId: message.ownerId,
    runId: run._id,
    sequence: (last?.sequence ?? 0) + 1,
    kind: "email_delivery",
    label: "Email delivery",
    status: status === "failed" ? "failed" : status === "delivered" ? "completed" : "updated",
    safeDetail:
      status === "delivered"
        ? "AgentMail confirmed delivery."
        : status === "accepted"
          ? "AgentMail accepted the email."
          : "AgentMail reported an email delivery failure.",
    createdAt: Date.now(),
  });
}

function eventMessage(payload: Record<string, unknown>) {
  const message = record(payload.message);
  const delivery = record(payload.delivery);
  const send = record(payload.send);
  return {
    inboxId: stringValue(message.inbox_id ?? message.inboxId ?? payload.inbox_id ?? payload.inboxId),
    messageId: stringValue(message.message_id ?? message.messageId ?? payload.message_id ?? payload.messageId ?? delivery.message_id ?? send.message_id),
    threadId: stringValue(message.thread_id ?? message.threadId ?? payload.thread_id ?? payload.threadId),
    from: stringValue(message.from_ ?? message.from ?? payload.from),
    to: stringArray(message.to ?? payload.to),
    subject: stringValue(message.subject ?? payload.subject) ?? "Research reply",
    extractedText:
      stringValue(
        message.extracted_text ??
          message.extractedText ??
          message.text ??
          payload.extracted_text ??
          payload.extractedText ??
          payload.text,
      ) ?? "",
    timestamp: stringValue(message.timestamp ?? payload.timestamp) ?? undefined,
  };
}

export const recordRejected = internalMutation({
  args: {
    providerEventId: v.string(),
    eventType: v.string(),
    payloadHash: v.string(),
    failureCode: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_event", (q) => q.eq("provider", "agentmail").eq("providerEventId", args.providerEventId))
      .unique();
    if (existing !== null) return { ok: true, duplicate: true };
    await ctx.db.insert("webhookEvents", {
      provider: "agentmail",
      providerEventId: args.providerEventId,
      eventType: args.eventType,
      signatureVerified: false,
      payloadHash: args.payloadHash,
      status: "rejected",
      failureCode: args.failureCode.slice(0, 200),
      receivedAt: Date.now(),
      processedAt: Date.now(),
    });
    return { ok: true };
  },
});

export const processDelivery = internalMutation({
  args: {
    providerEventId: v.string(),
    eventType: v.string(),
    payloadHash: v.string(),
    providerMessageId: v.string(),
    providerTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_event", (q) => q.eq("provider", "agentmail").eq("providerEventId", args.providerEventId))
      .unique();
    if (duplicate !== null) return { ok: true, duplicate: true };
    const emailMessage = await ctx.db
      .query("emailMessages")
      .withIndex("by_provider_message", (q) => q.eq("providerMessageId", args.providerMessageId))
      .unique();
    const status = args.eventType === "message.delivered"
      ? "delivered" as const
      : args.eventType === "message.sent"
        ? "accepted" as const
        : "failed" as const;
    const eventId = await ctx.db.insert("webhookEvents", {
      provider: "agentmail",
      providerEventId: args.providerEventId,
      eventType: args.eventType,
      signatureVerified: true,
      payloadHash: args.payloadHash,
      ownerId: emailMessage?.ownerId,
      botId: emailMessage?.botId,
      runId: emailMessage?.runId,
      emailMessageId: emailMessage?._id,
      status: "processing",
      receivedAt: Date.now(),
    });
    if (emailMessage === null || emailMessage.direction !== "outbound") {
      await ctx.db.patch("webhookEvents", eventId, {
        status: "rejected",
        failureCode: "message_not_mapped",
        processedAt: Date.now(),
      });
      return { ok: true, mapped: false };
    }
    const bot = await ctx.db.get("bots", emailMessage.botId);
    const inbox = bot === null
      ? null
      : await ctx.db.query("agentMailInboxes").withIndex("by_bot", (q) => q.eq("botId", bot._id)).unique();
    if (bot === null || inbox === null || bot.ownerId !== emailMessage.ownerId || inbox.ownerId !== emailMessage.ownerId) {
      await ctx.db.patch("webhookEvents", eventId, { status: "rejected", failureCode: "mapping_invalid", processedAt: Date.now() });
      return { ok: true, mapped: false };
    }
    await ctx.db.patch("emailMessages", emailMessage._id, {
      status,
      providerTimestamp: args.providerTimestamp,
      updatedAt: Date.now(),
    });
    await appendDeliveryEvent(ctx, emailMessage, status);
    await ctx.db.patch("webhookEvents", eventId, { status: "processed", processedAt: Date.now() });
    return { ok: true, mapped: true };
  },
});

export async function handleAgentMailWebhook(ctx: ActionCtx, request: Request): Promise<Response> {
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > 1_100_000) return new Response("", { status: 413 });
  const payloadHash = await sha256Hex(new TextDecoder().decode(rawBody));
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("", { status: 500 });
  const verification = await verifySvix(rawBody, request.headers, secret);
  if (!verification.ok) {
    if (verification.providerEventId) {
      await ctx.runMutation(recordRejectedRef, {
        providerEventId: verification.providerEventId,
        eventType: "unverified",
        payloadHash,
        failureCode: "signature_invalid",
      });
    }
    return new Response("", { status: 400 });
  }
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(rawBody));
    payload = record(parsed);
  } catch {
    await ctx.runMutation(recordRejectedRef, {
      providerEventId: verification.providerEventId!,
      eventType: "unparseable",
      payloadHash,
      failureCode: "invalid_json",
    });
    return new Response("", { status: 400 });
  }
  const eventType = stringValue(payload.event_type ?? payload.eventType) ?? "";
  const providerEventId = stringValue(payload.event_id ?? payload.eventId) ?? verification.providerEventId!;
  const message = eventMessage(payload);
  if (eventType === "message.received") {
    if (!message.inboxId || !message.messageId || !message.threadId || !message.from) {
      await ctx.runMutation(recordRejectedRef, {
        providerEventId,
        eventType,
        payloadHash,
        failureCode: "message_fields_missing",
      });
      return new Response("", { status: 400 });
    }
    await ctx.runMutation(processInbound, {
      providerEventId,
      eventType,
      payloadHash,
      providerInboxId: message.inboxId,
      providerMessageId: message.messageId,
      providerThreadId: message.threadId,
      fromAddress: message.from,
      toAddresses: message.to,
      subject: message.subject,
      extractedText: message.extractedText.slice(0, 10_000),
      providerTimestamp: parsedTimestamp(message.timestamp),
    });
    return new Response("", { status: 204 });
  }
  if (DELIVERY_EVENTS.has(eventType)) {
    if (!message.messageId) {
      await ctx.runMutation(recordRejectedRef, {
        providerEventId,
        eventType,
        payloadHash,
        failureCode: "delivery_message_id_missing",
      });
      return new Response("", { status: 400 });
    }
    await ctx.runMutation(updateDelivery, {
      providerEventId,
      eventType,
      payloadHash,
      providerMessageId: message.messageId,
      providerTimestamp: parsedTimestamp(message.timestamp),
    });
    return new Response("", { status: 204 });
  }
  await ctx.runMutation(recordRejectedRef, {
    providerEventId,
    eventType: eventType || "unknown",
    payloadHash,
    failureCode: "unsupported_event",
  });
  return new Response("", { status: 204 });
}
