const ACTIVE_RUNS = new Set([
  "accepted",
  "queued",
  "initializing_provider",
  "researching",
  "waiting_for_tool",
  "composing",
  "preparing_report",
  "sending_email",
]);

export function runStageLabel(status: string): string {
  if (status === "accepted" || status === "queued") return "Accepted";
  if (
    status === "initializing_provider" ||
    status === "researching" ||
    status === "waiting_for_tool"
  ) {
    return "Researching";
  }
  if (status === "composing") return "Composing";
  if (status === "preparing_report") return "Preparing report";
  if (status === "sending_email") return "Sending email";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "canceled") return "Canceled";
  return "Pending";
}

export function isRunActive(status: string | null | undefined): boolean {
  return status ? ACTIVE_RUNS.has(status) : false;
}

export function isRunExecuting(status: string | null | undefined): boolean {
  return status !== "queued" && isRunActive(status);
}
