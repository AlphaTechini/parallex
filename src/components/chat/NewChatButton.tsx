"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";

export function NewChatButton({
  botId,
  iconOnly = false,
}: {
  botId: Id<"bots">;
  iconOnly?: boolean;
}) {
  const createChat = useMutation(api.chats.createChat);
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const result = await createChat({ botId });
      router.push(`/chats?chatId=${result.chatId}`);
    } catch (cause) {
      setError(safeErrorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={iconOnly ? "new-chat-control icon-only" : "new-chat-control"}>
      <Button
        aria-label={iconOnly ? "Start a new chat" : undefined}
        disabled={creating}
        onClick={handleCreate}
        size="small"
        title={iconOnly ? "New chat" : undefined}
        variant={iconOnly ? "secondary" : "primary"}
      >
        {creating ? "…" : iconOnly ? "+" : "+ New chat"}
      </Button>
      {error && !iconOnly ? <small className="form-error">{error}</small> : null}
    </div>
  );
}
