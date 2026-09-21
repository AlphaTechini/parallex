"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { ActivityFeed } from "@/components/chat/ActivityFeed";
import { OutreachDrafts } from "@/components/chat/OutreachDrafts";
import { RunStatusBanner } from "@/components/chat/RunStatusBanner";
import { Badge } from "@/components/ui/Badge";
import { isRunActive, isRunExecuting, runStageLabel } from "@/lib/runStatus";

export function MessageRunSection({ runId }: { runId: Id<"researchRuns"> }) {
  const run = useQuery(api.runs.getRun, { runId });

  if (run === undefined || run === null) return null;
  const active = isRunActive(run.status);
  const executing = isRunExecuting(run.status);

  return (
    <div className="message-run-section">
      {active ? <RunStatusBanner runId={runId} status={run.status} /> : null}
      {!active ? <div className="message-run-summary">
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
      </div> : null}
      {run.status === "failed" && run.failureMessage ? (
        <p className="form-error">{run.failureMessage}</p>
      ) : null}
      <ActivityFeed
        active={executing}
        initiallyExpanded={executing}
        key={executing ? "executing" : "inactive"}
        runId={runId}
      />
      <OutreachDrafts runId={runId} />
    </div>
  );
}
