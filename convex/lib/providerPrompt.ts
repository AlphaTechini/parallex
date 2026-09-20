import type { Id } from "../_generated/dataModel";

type ProviderPromptContext = {
  triggerMessage: { content: string };
  run: { triggerKind: "web" | "email" | "schedule" };
  attachments: Array<{
    id: Id<"messageAttachments">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  priorReportSummary?: string;
};

export function buildProviderInput(context: ProviderPromptContext): string {
  const sections = [context.triggerMessage.content];
  if (context.attachments.length > 0) {
    sections.push(
      `Approved attachments for this request:\n${context.attachments
        .map(
          (attachment) =>
            `- attachmentId=${attachment.id}; name=${attachment.fileName}; type=${attachment.mimeType}; bytes=${attachment.sizeBytes}`,
        )
        .join("\n")}`,
    );
  }
  if (context.run.triggerKind === "schedule" && context.priorReportSummary) {
    sections.push(
      `Bounded prior-report context for change comparison:\n${context.priorReportSummary}`,
    );
  }
  return sections.join("\n\n");
}
