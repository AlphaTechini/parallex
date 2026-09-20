"use client";

import { useMutation, useQuery } from "convex/react";
import { type FormEvent, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { safeErrorMessage } from "@/lib/errors";

export function ZhipuKeyForm() {
  const credential = useQuery(api.credentials.getZhipuCredentialStatus, {});
  const saveKey = useMutation(api.credentials.upsertZhipuCredential);
  const deleteKey = useMutation(api.credentials.deleteZhipuCredential);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await saveKey({ apiKey });
      setApiKey("");
      setMessage("API key saved.");
    } catch (cause) {
      setMessage(safeErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="settings-card">
      <div className="settings-card-heading">
        <div>
          <span className="eyebrow">Model access</span>
          <h2>Zhipu API key</h2>
        </div>
        <Badge tone={credential?.configured ? "success" : "neutral"}>
          {credential?.configured ? "Configured" : "Not configured"}
        </Badge>
      </div>
      <p>
        Uses your Zhipu Coding Plan. Stored encrypted and never shown again.
      </p>
      {credential?.configured ? (
        <p className="credential-hint">
          Active key ending in <code>••••{credential.displayHint}</code>
        </p>
      ) : null}
      <form className="inline-form" onSubmit={handleSubmit}>
        <input
          className="text-input"
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={
            credential?.configured ? "Paste a replacement key" : "Paste Zhipu API key"
          }
          required
          type="password"
          value={apiKey}
        />
        <Button disabled={saving} type="submit">
          {saving ? "Saving..." : credential?.configured ? "Replace" : "Save key"}
        </Button>
      </form>
      <div className="settings-footer">
        {message ? <span className="form-status">{message}</span> : <span />}
        {credential?.configured ? (
          <Button
            onClick={() => {
              if (
                window.confirm(
                  "Delete this key? New Zhipu research runs will stop.",
                )
              ) {
                void deleteKey({});
              }
            }}
            size="small"
            variant="danger"
          >
            Delete key
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
