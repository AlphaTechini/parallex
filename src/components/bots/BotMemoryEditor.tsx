"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";

export function BotMemoryEditor({
  botId,
  initialMemory,
}: {
  botId: Id<"bots">;
  initialMemory: string | null;
}) {
  const update = useMutation(api.bots.updateBotMemory);
  const [content, setContent] = useState(initialMemory ?? "");
  const [status, setStatus] = useState<string | null>(null);

  async function save() {
    setStatus(null);
    try {
      await update({ botId, content });
      setStatus("Memory saved.");
    } catch (cause) {
      setStatus(safeErrorMessage(cause));
    }
  }

  return (
    <div className="memory-editor">
      <label className="field-label">
        <span>Bot memory</span>
        <textarea
          className="text-area"
          onChange={(event) => setContent(event.target.value)}
          rows={5}
          value={content}
        />
        <small>Private instructions applied only to this bot.</small>
      </label>
      <div className="inline-row">
        <Button onClick={save} size="small" variant="secondary">
          Save memory
        </Button>
        {status ? <span className="form-status">{status}</span> : null}
      </div>
    </div>
  );
}
