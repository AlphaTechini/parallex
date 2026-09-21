"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { BotMemoryEditor } from "@/components/bots/BotMemoryEditor";
import { ChatList } from "@/components/bots/ChatList";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { BotSchedules } from "@/components/schedules/BotSchedules";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { safeErrorMessage } from "@/lib/errors";

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
  const archive = useMutation(api.bots.archiveBot);
  const router = useRouter();
  const [tab, setTab] = useState<"chats" | "schedules">("chats");
  const [error, setError] = useState<string | null>(null);
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
      <section className="bot-hero">
        <BotAvatar avatar={bot.avatar} name={bot.name} size="large" />
        <div className="bot-hero-copy">
          <div className="inline-row">
            <span className="eyebrow">Research bot</span>
            <Badge tone={bot.emailCapability === "active" ? "success" : "working"}>
              {bot.emailCapability}
            </Badge>
          </div>
          <h1>{bot.name}</h1>
          <p>{bot.mission}</p>
          <div className="bot-addresses">
            <span>From <code>{bot.emailAddress || "Provisioning inbox"}</code></span>
            <span>To <code>{bot.recipientEmail}</code></span>
          </div>
        </div>
        <Button
          onClick={async () => {
            if (!window.confirm("Archive this bot? Existing history remains available.")) return;
            setError(null);
            try {
              await archive({ botId });
              router.replace("/dashboard");
            } catch (cause) {
              setError(safeErrorMessage(cause));
            }
          }}
          variant="quiet"
        >
          Archive bot
        </Button>
      </section>
      {error ? <p className="form-error">{error}</p> : null}
      <BotMemoryEditor botId={botId} initialMemory={bot.botMemory} />
      <div className="tab-list" role="tablist">
        <button
          aria-selected={tab === "chats"}
          className={tab === "chats" ? "tab active" : "tab"}
          onClick={() => setTab("chats")}
          role="tab"
          type="button"
        >
          Chats
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
      </div>
      {tab === "chats" ? <ChatList botId={botId} /> : <BotSchedules botId={botId} />}
    </AppShell>
  );
}
