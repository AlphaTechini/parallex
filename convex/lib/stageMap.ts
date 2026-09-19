export type UiRunStage =
  | "accepted"
  | "researching"
  | "composing"
  | "preparing report"
  | "sending email"
  | "completed"
  | "failed"
  | "canceled";

export function mapRunStatusToUiStage(status: string): UiRunStage {
  switch (status) {
    case "accepted":
    case "queued":
      return "accepted";
    case "initializing_provider":
    case "researching":
    case "waiting_for_tool":
      return "researching";
    case "composing":
      return "composing";
    case "preparing_report":
      return "preparing report";
    case "sending_email":
      return "sending email";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      throw new Error("INVALID_RUN_STATUS");
  }
}
