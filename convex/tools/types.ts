import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

export type ExecutorResult =
  | { kind?: "immediate"; outputJson: string }
  | { kind?: "async"; providerJobId: string; capability: string }
  | {
      kind?: "failed";
      code: string;
      retryable: boolean;
      safeMessage: string;
    };

export type ToolExecutionContext = {
  ctx: ActionCtx;
  toolCallId: Id<"toolCalls">;
  toolCall: Doc<"toolCalls">;
  run: Doc<"researchRuns">;
  chat: Doc<"chats">;
  bot: Doc<"bots">;
  args: Record<string, unknown>;
  attachments: Array<{
    id: Id<"messageAttachments">;
    storageId: Id<"_storage">;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    status: Doc<"messageAttachments">["status"];
  }>;
};
