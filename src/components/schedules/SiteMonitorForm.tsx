"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState, useSyncExternalStore } from "react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";
import styles from "@/components/schedules/siteMonitorForm.module.css";

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function SiteMonitorForm({ botId }: { botId: Id<"bots"> }) {
  const createMonitor = useMutation(api.siteMonitors.create);
  const [url, setUrl] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "every_three_days">(
    "daily",
  );
  const [changeDescription, setChangeDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timezone = useSyncExternalStore(
    () => () => undefined,
    browserTimeZone,
    () => "UTC",
  );

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      const result = await createMonitor({
        botId,
        url,
        frequency,
        ...(changeDescription.trim()
          ? { changeDescription: changeDescription.trim() }
          : {}),
        timezone,
      });
      setNotice(
        result.created
          ? "Monitor created. Its first baseline check starts in about one minute."
          : "An equivalent monitor already exists for this URL and change rule.",
      );
      if (result.created) {
        setUrl("");
        setChangeDescription("");
      }
    } catch (cause) {
      setError(safeErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.monitorForm} onSubmit={submit}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">Website monitor</span>
          <h3>Watch one page</h3>
        </div>
        <span className={styles.timezone}>{timezone}</span>
      </div>
      <p className={styles.intro}>
        The monitor checks only this exact URL. It establishes a baseline in
        about one minute, then alerts you only when a relevant change appears.
      </p>
      <div className={styles.fields}>
        <label>
          <span>Target URL</span>
          <input
            autoComplete="url"
            maxLength={2048}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://example.com/pricing"
            required
            type="url"
            value={url}
          />
        </label>
        <label>
          <span>Check frequency</span>
          <select
            onChange={(event) =>
              setFrequency(event.target.value as "daily" | "every_three_days")
            }
            value={frequency}
          >
            <option value="daily">Daily</option>
            <option value="every_three_days">Every 3 days</option>
          </select>
        </label>
        <label className={styles.fullWidth}>
          <span>What change should it watch for? Optional</span>
          <textarea
            maxLength={2000}
            onChange={(event) => setChangeDescription(event.target.value)}
            placeholder="Leave blank to alert on any meaningful page change."
            rows={3}
            value={changeDescription}
          />
        </label>
      </div>
      <div className={styles.actions}>
        <Button disabled={submitting} size="small" type="submit">
          {submitting ? "Creating monitor..." : "Start monitoring"}
        </Button>
        <small>Only change alerts are emailed. No-change checks stay quiet.</small>
      </div>
      {notice ? <p className={styles.notice}>{notice}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
