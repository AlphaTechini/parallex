"use client";

import type { Id } from "../../../convex/_generated/dataModel";

import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { MessageRunSection } from "@/components/chat/MessageRunSection";
import { RunArtifacts } from "@/components/chat/RunArtifacts";
import { Badge } from "@/components/ui/Badge";
import { formatBytes } from "@/lib/format";

type Message = {
  _id: Id<"messages">;
  role: "user" | "assistant";
  origin: "web" | "email" | "schedule" | "system_result";
  content: string;
  status: "accepted" | "streaming" | "complete" | "failed";
  runId: Id<"researchRuns"> | null;
  attachments: Array<{
    _id: Id<"messageAttachments">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
  }>;
};

export function MessageRow({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <section className="message-turn message-turn-user">
        <article className="message message-user">
          <p>{message.content}</p>
          {message.attachments.length ? (
            <div className="message-attachments">
              {message.attachments.map((attachment) => (
                <span key={attachment._id}>
                  ▤ {attachment.fileName} · {formatBytes(attachment.sizeBytes)}
                </span>
              ))}
            </div>
          ) : null}
          <div className="message-meta">
            {message.origin === "email" ? <Badge>via email</Badge> : null}
            {message.origin === "schedule" ? <Badge tone="indigo">scheduled</Badge> : null}
            <span
              aria-label="Stored by the server and accepted for background processing"
              className="message-receipt"
              title="Stored by the server; research continues if you close this tab"
            >
              ✓✓
            </span>
          </div>
        </article>
        {message.runId ? <MessageRunSection runId={message.runId} /> : null}
      </section>
    );
  }

  return (
    <article className={`message message-assistant status-${message.status}`}>
      {message.content ? (
        <MarkdownMessage content={message.content} />
      ) : message.status === "failed" ? (
        <p className="form-error">This response could not be completed.</p>
      ) : (
        <div className="typing-shimmer" aria-label="Bot is composing a response">
          <span /> <span /> <span />
        </div>
      )}
      {message.runId ? <RunArtifacts runId={message.runId} /> : null}
    </article>
  );
}
