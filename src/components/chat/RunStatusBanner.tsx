"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";
import { runStageLabel } from "@/lib/runStatus";

export function RunStatusBanner({
  runId,
  status,
}: {
  runId: Id<"researchRuns">;
  status: string;
}) {
  const cancel = useMutation(api.runs.cancelRun);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="run-banner">
      <span className="live-orb" aria-hidden="true" />
      <div>
        <strong>{runStageLabel(status)}</strong>
        <span>Work continues securely in the cloud.</span>
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
