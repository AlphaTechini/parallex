"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { api } from "../../../convex/_generated/api";
import {
  AttachmentPicker,
  type UploadedAttachment,
} from "@/components/chat/AttachmentPicker";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";
import { DEFAULT_EFFORT, DEFAULT_MODEL, MODEL_CATALOG } from "@/lib/models";

export function Composer({
  chatId,
  credentialConfigured,
  runActive,
}: {
  chatId: Id<"chats">;
  credentialConfigured: boolean;
  runActive: boolean;
}) {
  const submitPrompt = useMutation(api.messages.submitPrompt);
  const [content, setContent] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [effort, setEffort] = useState(DEFAULT_EFFORT);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModel = MODEL_CATALOG.find((item) => item.id === model) ?? MODEL_CATALOG[1];

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await submitPrompt({
        chatId,
        content,
        model,
        reasoningEffort: effort,
        clientSubmissionId: crypto.randomUUID(),
        attachmentIds: attachments.map((attachment) => attachment.id),
      });
      setContent("");
      setAttachments([]);
    } catch (cause) {
      setError(safeErrorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  if (!credentialConfigured) {
    return (
      <div className="composer-notice">
        <div>
          <strong>Add your OpenAI API key to start research.</strong>
          <span>The key is encrypted before it is stored.</span>
        </div>
        <Link className="button button-primary button-small" href="/settings">
          Open settings
        </Link>
      </div>
    );
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <AttachmentPicker attachments={attachments} onChange={setAttachments} />
      <textarea
        aria-label="Research request"
        className="composer-input"
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void handleSubmit();
          }
        }}
        placeholder="Ask for a market scan, literature review, policy update, or scheduled brief..."
        rows={3}
        value={content}
      />
      <div className="composer-toolbar">
        <div className="model-controls">
          <label>
            <span className="sr-only">Model</span>
            <select
              onChange={(event) => {
                const nextModel = event.target.value;
                setModel(nextModel);
                const next = MODEL_CATALOG.find((item) => item.id === nextModel);
                if (next && !next.efforts.includes(effort as never)) {
                  setEffort("medium");
                }
              }}
              value={model}
            >
              {MODEL_CATALOG.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Reasoning effort</span>
            <select onChange={(event) => setEffort(event.target.value)} value={effort}>
              {selectedModel.efforts.map((item) => (
                <option key={item} value={item}>{item} effort</option>
              ))}
            </select>
          </label>
          <span className="model-blurb">{selectedModel.blurb}</span>
          {runActive ? <span className="queue-hint">Next request will queue</span> : null}
        </div>
        <Button disabled={sending || !content.trim()} type="submit">
          {sending ? "Accepting..." : "Send request"}
        </Button>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
