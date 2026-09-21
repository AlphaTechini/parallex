"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";
import { isRunActive, runStageLabel } from "@/lib/runStatus";

export function RunStatusBanner({
  runId,
  status,
}: {
  runId: Id<"researchRuns">;
  status: string;
}) {
  const cancel = useMutation(api.runs.cancelRun);
  const [error, setError] = useState<string | null>(null);

  if (!isRunActive(status)) return null;
  const queued = status === "queued";

  return (
    <div className={queued ? "run-banner run-banner-queued" : "run-banner"}>
      <span className={queued ? "queue-orb" : "live-orb"} aria-hidden="true" />
      <div>
        <strong>{queued ? "Queued" : runStageLabel(status)}</strong>
        <span>
          {queued
            ? "Waiting for the earlier request in this chat."
            : "Work continues securely in the cloud."}
        </span>
      </div>
      <Button
        onClick={async () => {
          setError(null);
          try {
            await cancel({ runId });
          } catch (cause) {
            setError(safeErrorMessage(cause));
          }
        }}
        size="small"
        variant="quiet"
      >
        Cancel
      </Button>
      {error ? <span className="form-error">{error}</span> : null}
    </div>
  );
}
