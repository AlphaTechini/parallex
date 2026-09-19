"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { safeErrorMessage } from "@/lib/errors";

export function GlobalMemoryForm() {
  const profile = useQuery(api.userProfiles.getMyProfile, {});
  const update = useMutation(api.userProfiles.updateGlobalMemory);
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const content = draft ?? profile?.globalMemory ?? "";

  async function save() {
    setMessage(null);
    try {
      await update({ content });
      setMessage("Global memory saved.");
    } catch (cause) {
      setMessage(safeErrorMessage(cause));
    }
  }

  return (
    <Card className="settings-card">
      <div className="settings-card-heading">
        <div>
          <span className="eyebrow">Shared instructions</span>
          <h2>Global memory</h2>
        </div>
        <span className="version-label">Version {profile?.globalInstructionVersion ?? 0}</span>
      </div>
      <p>Instructions applied to every bot you own. Per-bot memory stays separate.</p>
      <textarea
        className="text-area"
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Always prefer primary sources and state uncertainty plainly."
        rows={9}
        value={content}
      />
      <div className="settings-footer">
        {message ? <span className="form-status">{message}</span> : <span />}
        <Button onClick={save}>Save memory</Button>
      </div>
    </Card>
  );
}
