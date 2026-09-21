"use client";

import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { api } from "../../../convex/_generated/api";
import { ChatExperience } from "@/components/chat/ChatExperience";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Spinner } from "@/components/ui/Spinner";

export function ChatPageContent() {
  const chatId = useSearchParams().get("chatId");
  const router = useRouter();

  useEffect(() => {
    if (!chatId) {
      router.replace("/dashboard");
    }
  }, [chatId, router]);

  if (!chatId) {
    return (
      <div className="page-loading">
        <Spinner label="Loading chat" />
      </div>
    );
  }

  return (
    <AuthGuard>
      <ChatWorkspace rawChatId={chatId} />
    </AuthGuard>
  );
}

function ChatWorkspace({ rawChatId }: { rawChatId: string }) {
  const chatId = useQuery(api.routeIds.resolveChatId, { id: rawChatId });

  if (chatId === undefined) {
    return (
      <AppShell>
        <div className="page-loading">
          <Spinner label="Loading chat" />
        </div>
      </AppShell>
    );
  }
  if (chatId === null) {
    return (
      <AppShell>
        <section className="empty-state"><h1>Chat not found</h1></section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ChatExperience chatId={chatId} />
    </AppShell>
  );
}
