"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";

function toneForStatus(status: string): "neutral" | "working" | "success" | "danger" {
  if (status === "sent") return "success";
  if (status === "sending") return "working";
  if (status === "failed") return "danger";
  return "neutral";
}

export function OutreachDrafts({ runId }: { runId: Id<"researchRuns"> }) {
  const drafts = useQuery(api.outreach.listDraftsForRun, { runId });
  const approve = useMutation(api.outreach.approveDraft);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!drafts || drafts.length === 0) return null;

  return (
    <section className="mt-3 grid gap-3" aria-label="Outreach drafts">
      {drafts.map((draft) => (
        <article
          className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
          key={draft._id}
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <span className="eyebrow">Approval required</span>
              <h3 className="mb-1 text-base font-semibold">{draft.merchantName}</h3>
              <p className="mb-0 text-sm text-zinc-600">{draft.productLabel}</p>
            </div>
            <Badge tone={toneForStatus(draft.status)}>{draft.status}</Badge>
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
              <dt className="font-semibold text-zinc-500">To</dt>
              <dd className="m-0 break-all text-zinc-900">{draft.recipientEmail}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
              <dt className="font-semibold text-zinc-500">Subject</dt>
              <dd className="m-0 text-zinc-900">{draft.subject}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
              <dt className="font-semibold text-zinc-500">Constraints</dt>
              <dd className="m-0 whitespace-pre-wrap text-zinc-700">
                {draft.constraints}
              </dd>
            </div>
          </dl>
          <div className="my-3 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
            {draft.body}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <small className="text-zinc-500">
              Approval sends this exact first message. Replies continue in the linked thread under the constraints above.
            </small>
            {draft.status === "draft" || draft.status === "failed" ? (
              <Button
                disabled={approvingId === draft._id}
                onClick={async () => {
                  setApprovingId(draft._id);
                  setError(null);
                  try {
                    await approve({ draftId: draft._id });
                  } catch (cause) {
                    setError(safeErrorMessage(cause));
                  } finally {
                    setApprovingId(null);
                  }
                }}
                size="small"
              >
                {approvingId === draft._id ? "Sending..." : "Approve and send"}
              </Button>
            ) : null}
          </div>
          {draft.failureCode ? (
            <p className="form-error mt-2">Send failed: {draft.failureCode}</p>
          ) : null}
        </article>
      ))}
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
