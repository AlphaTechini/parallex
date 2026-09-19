"use client";

import type { Id } from "../../../../convex/_generated/dataModel";
import { useParams } from "next/navigation";

import { ChatExperience } from "@/components/chat/ChatExperience";
import { AppShell } from "@/components/layout/AppShell";

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  return (
    <AppShell>
      <ChatExperience chatId={params.chatId as Id<"chats">} />
    </AppShell>
  );
}
