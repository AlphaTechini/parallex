"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatBytes } from "@/lib/format";

function DownloadArtifact({
  reportId,
  format,
  fileName,
  sizeBytes,
}: {
  reportId: Id<"reports">;
  format: "markdown" | "pdf";
  fileName: string;
  sizeBytes: number;
}) {
  const download = useQuery(api.reports.getReportDownloadUrl, { reportId, format });
  return download ? (
    <a className="artifact-link" download={download.fileName} href={download.url}>
      <span>{format === "pdf" ? "PDF" : "Markdown"}</span>
      <small>{formatBytes(sizeBytes)}</small>
    </a>
  ) : (
    <span className="artifact-link disabled">Preparing {fileName}</span>
  );
}

export function RunArtifacts({ runId }: { runId: Id<"researchRuns"> }) {
  const report = useQuery(api.reports.getReportForRun, { runId });
  const email = useQuery(api.emails.getEmailForRun, { runId });
  const retry = useMutation(api.emails.retryFailedEmail);
  const [retrying, setRetrying] = useState(false);

  if (!report && !email) return null;

  return (
    <div className="run-artifacts">
      {report ? (
        <section className="report-card">
          <div>
            <span className="eyebrow">Research report</span>
            <h3>{report.title}</h3>
            <p>{report.summary}</p>
          </div>
          <Badge tone={report.status === "ready" ? "success" : "working"}>
            {report.status}
          </Badge>
          <div className="artifact-links">
            {report.artifacts.map((artifact) => (
              <DownloadArtifact
                fileName={artifact.fileName}
                format={artifact.format}
                key={artifact.format}
                reportId={report._id}
                sizeBytes={artifact.sizeBytes}
              />
            ))}
          </div>
        </section>
      ) : null}
      {email ? (
        <div className="email-status-row">
          <span aria-hidden="true">✉</span>
          <div>
            <strong>Email {email.status}</strong>
            <small>{email.subject}</small>
          </div>
          {email.status === "failed" ? (
            <Button
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  await retry({ emailMessageId: email._id });
                } finally {
                  setRetrying(false);
                }
              }}
              size="small"
              variant="secondary"
            >
              Retry
            </Button>
          ) : (
            <Badge tone={email.status === "delivered" ? "success" : "working"}>
              {email.status}
            </Badge>
          )}
        </div>
      ) : null}
    </div>
  );
}
