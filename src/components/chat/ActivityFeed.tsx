"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const EVENT_ICONS: Record<string, string> = {
  prompt_received: "↳",
  research_status: "●",
  reasoning_summary: "✦",
  firecrawl_query: "◎",
  firecrawl_result: "▤",
  report_generation: "▧",
  email_send: "✉",
  email_delivery: "✓",
  run_error: "!",
};

export function ActivityFeed({
  runId,
  active,
  initiallyExpanded,
}: {
  runId: Id<"researchRuns">;
  active: boolean;
  initiallyExpanded?: boolean;
}) {
  const { results: resultsDesc, status, loadMore } = usePaginatedQuery(
    api.runEvents.listRunEvents,
    { runId },
    { initialNumItems: 30 },
  );
  const results = [...resultsDesc].reverse();
  const [expanded, setExpanded] = useState(initiallyExpanded ?? active);

  return (
    <section className="activity-feed">
      <button
        aria-expanded={expanded}
        className="activity-toggle"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span>
          <strong>Research activity</strong>
          <small>{active ? "Live" : `${results.length} events`}</small>
        </span>
        <span aria-hidden="true">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <div className="activity-list">
          {results.length === 0 ? (
            <p className="muted-copy">Activity will appear as the run progresses.</p>
          ) : (
            results.map((event) => (
              <article className="activity-row" key={event._id}>
                <span className={`activity-icon event-${event.status}`}>
                  {EVENT_ICONS[event.kind] ?? "·"}
                </span>
                <div>
                  <div className="inline-row">
                    <strong>{event.label}</strong>
                    <Badge
                      tone={
                        event.status === "failed"
                          ? "danger"
                          : event.status === "completed"
                            ? "success"
                            : "working"
                      }
                    >
                      {event.status}
                    </Badge>
                  </div>
                  {event.safeDetail ? <p>{event.safeDetail}</p> : null}
                  {event.reasoningSummaryText ? (
                    <blockquote>{event.reasoningSummaryText}</blockquote>
                  ) : null}
                </div>
              </article>
            ))
          )}
          {status === "CanLoadMore" ? (
            <Button onClick={() => loadMore(30)} size="small" variant="quiet">
              Load earlier activity
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
