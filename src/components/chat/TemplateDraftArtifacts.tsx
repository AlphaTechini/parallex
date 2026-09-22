"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";
import Link from "next/link";

import { api } from "../../../convex/_generated/api";

export function TemplateDraftArtifacts({ runId }: { runId: Id<"researchRuns"> }) {
  const drafts = useQuery(api.templateDrafts.listForRun, { runId });

  if (drafts === undefined || drafts.length === 0) return null;

  return (
    <section className="mt-3 grid gap-3" aria-label="Template drafts">
      {drafts.map((draft) => (
        <article
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4"
          key={draft._id}
        >
          <div>
            <span className="eyebrow">Template draft ready</span>
            <h3 className="mb-1 text-base font-semibold">{draft.name}</h3>
            <p className="mb-0 text-sm text-zinc-600">
              {draft.shortDescription}
            </p>
          </div>
          <Link
            className="button button-primary"
            href={draft.reviewPath}
          >
            {draft.status === "published"
              ? "View in My templates"
              : "Review and deploy"}
          </Link>
        </article>
      ))}
    </section>
  );
}
