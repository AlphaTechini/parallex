"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { ActivityFeed } from "@/components/chat/ActivityFeed";
import { Badge } from "@/components/ui/Badge";
import { isRunActive, runStageLabel } from "@/lib/runStatus";

export function MessageRunSection({ runId }: { runId: Id<"researchRuns"> }) {
  const run = useQuery(api.runs.getRun, { runId });
  const [showActivity, setShowActivity] = useState(false);

  if (run === undefined || run === null) return null;
  const active = isRunActive(run.status);

  return (
    <div className="message-run-section">
      <div className="inline-row">
        <Badge
          tone={
            run.status === "failed"
              ? "danger"
              : run.status === "completed"
                ? "success"
                : active
                  ? "working"
                  : "neutral"
          }
        >
          {run.status === "queued" ? "Queued" : runStageLabel(run.status)}
        </Badge>
        <button
          className="activity-link"
          onClick={() => setShowActivity(!showActivity)}
          type="button"
        >
          {showActivity ? "Hide research activity" : "Research activity"}
        </button>
      </div>
      {run.status === "failed" && run.failureMessage ? (
        <p className="form-error">{run.failureMessage}</p>
      ) : null}
      {showActivity ? (
        <ActivityFeed active={active} initiallyExpanded runId={runId} />
      ) : null}
    </div>
  );
}