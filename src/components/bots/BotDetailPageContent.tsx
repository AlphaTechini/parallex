"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { BotSettingsPanel } from "@/components/bots/BotSettingsPanel";
import { ChatList } from "@/components/bots/ChatList";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { BotSchedules } from "@/components/schedules/BotSchedules";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";

export function BotDetailPageContent() {
  const botIdParam = useSearchParams().get("botId");
  const botId = botIdParam;
  const router = useRouter();

  useEffect(() => {
    if (!botId) {
      router.replace("/dashboard");
    }
  }, [botId, router]);

  if (botId === null) {
    return (
      <div className="page-loading">
        <Spinner label="Loading bot" />
      </div>
    );
  }

  return (
    <AuthGuard>
      <BotDetailWorkspace rawBotId={botId} />
    </AuthGuard>
  );
}

function BotDetailWorkspace({ rawBotId }: { rawBotId: string }) {
  const botId = useQuery(api.routeIds.resolveBotId, { id: rawBotId });
  const bot = useQuery(
    api.bots.getBot,
    botId === undefined || botId === null ? "skip" : { botId },
  );
  const [tab, setTab] = useState<"chat" | "schedules" | "settings">("chat");
  if (botId === undefined || bot === undefined) {
    return (
      <AppShell>
        <div className="page-loading"><Spinner label="Loading bot" /></div>
      </AppShell>
    );
  }
  if (botId === null || bot === null) {
    return (
      <AppShell>
        <section className="empty-state"><h1>Bot not found</h1></section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <Link className="back-link" href="/dashboard">← Dashboard</Link>
      <header className="bot-page-header">
        <BotAvatar avatar={bot.avatar} name={bot.name} size="medium" />
        <h1>{bot.name}</h1>
        <Badge tone={bot.emailCapability === "active" ? "success" : "working"}>
          {bot.emailCapability}
        </Badge>
      </header>
      <div className="tab-list" role="tablist">
        <button
          aria-selected={tab === "chat"}
          className={tab === "chat" ? "tab active" : "tab"}
          onClick={() => setTab("chat")}
          role="tab"
          type="button"
        >
          Chat
        </button>
        <button
          aria-selected={tab === "schedules"}
          className={tab === "schedules" ? "tab active" : "tab"}
          onClick={() => setTab("schedules")}
          role="tab"
          type="button"
        >
          Schedules
        </button>
        <button
          aria-selected={tab === "settings"}
          className={tab === "settings" ? "tab active" : "tab"}
          onClick={() => setTab("settings")}
          role="tab"
          type="button"
        >
          Settings
        </button>
      </div>
      {tab === "chat" ? <ChatList botId={botId} /> : null}
      {tab === "schedules" ? <BotSchedules botId={botId} /> : null}
      {tab === "settings" ? <BotSettingsPanel bot={bot} botId={botId} /> : null}
    </AppShell>
  );
}
