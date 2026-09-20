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
import {
  defaultEffortForModel,
  defaultModelForProviders,
  MODEL_CATALOG,
  type ModelId,
  type ProviderId,
} from "@/lib/models";

export function Composer({
  chatId,
  configuredProviders,
  runActive,
}: {
  chatId: Id<"chats">;
  configuredProviders: ProviderId[];
  runActive: boolean;
}) {
  const submitPrompt = useMutation(api.messages.submitPrompt);
  const [content, setContent] = useState("");
  const [model, setModel] = useState(() =>
    defaultModelForProviders(configuredProviders),
  );
  const [effort, setEffort] = useState(() => defaultEffortForModel(model));
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableModels = MODEL_CATALOG.filter((item) =>
    configuredProviders.some((provider) => provider === item.provider),
  );
  const selectedModel =
    availableModels.find((item) => item.id === model) ?? availableModels[0];
  const effectiveModel = selectedModel?.id ?? model;
  const effectiveEffort = selectedModel?.efforts.includes(effort as never)
    ? effort
    : defaultEffortForModel(effectiveModel);

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!content.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await submitPrompt({
        chatId,
        content,
        model: effectiveModel,
        reasoningEffort: effectiveEffort,
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

  if (configuredProviders.length === 0) {
    return (
      <div className="composer-notice">
        <div>
          <strong>Add an OpenAI or Zhipu API key to start research.</strong>
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
                setModel(nextModel as ModelId);
                const next = MODEL_CATALOG.find((item) => item.id === nextModel);
                if (next && !next.efforts.includes(effort as never)) {
                  setEffort(defaultEffortForModel(nextModel));
                }
              }}
              value={effectiveModel}
            >
              {availableModels.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Reasoning effort</span>
            <select
              onChange={(event) => setEffort(event.target.value)}
              value={effectiveEffort}
            >
              {selectedModel?.efforts.map((item) => (
                <option key={item} value={item}>{item} effort</option>
              ))}
            </select>
          </label>
          <span className="model-blurb">{selectedModel?.blurb}</span>
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
