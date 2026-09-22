"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import type { BotAvatar as BotAvatarValue } from "../../../convex/bots";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { NewChatButton } from "@/components/chat/NewChatButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/format";
import { isRunActive, runStageLabel } from "@/lib/runStatus";

export function ChatSidebar({
  botId,
  botName,
  botAvatar,
  emailAddress,
  currentChatId,
  collapsed,
  onToggle,
}: {
  botId: Id<"bots">;
  botName: string;
  botAvatar: BotAvatarValue;
  emailAddress: string | null;
  currentChatId: Id<"chats">;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.chats.listChats,
    { botId },
    { initialNumItems: 30 },
  );

  return (
    <aside className={collapsed ? "chat-rail collapsed" : "chat-rail"}>
      <div className="chat-rail-heading">
        {collapsed ? null : (
          <Link className="back-link" href={`/bots?botId=${botId}`}>
            ← Bot details
          </Link>
        )}
        <Button
          aria-label={collapsed ? "Expand conversation sidebar" : "Collapse conversation sidebar"}
          aria-pressed={collapsed}
          onClick={onToggle}
          size="small"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          variant="quiet"
        >
          {collapsed ? "›" : "‹"}
        </Button>
      </div>

      {collapsed ? (
        <>
          <BotAvatar avatar={botAvatar} name={botName} size="medium" />
          <NewChatButton botId={botId} iconOnly />
        </>
      ) : (
        <>
          <div className="chat-rail-bot">
            <BotAvatar avatar={botAvatar} name={botName} size="medium" />
            <div>
              <strong>{botName}</strong>
              <span>{emailAddress || "Provisioning inbox"}</span>
            </div>
          </div>
          <NewChatButton botId={botId} />
          <div className="chat-history-heading">
            <span className="eyebrow">Conversations</span>
            <small>{status === "LoadingFirstPage" ? "Loading" : `${results.length} recent`}</small>
          </div>
          <nav aria-label={`${botName} conversations`} className="chat-history-list">
            {results.map((chat) => (
              <Link
                aria-current={chat._id === currentChatId ? "page" : undefined}
                className={chat._id === currentChatId ? "chat-history-link active" : "chat-history-link"}
                href={`/chats?chatId=${chat._id}`}
                key={chat._id}
              >
                <span>
                  <strong>{chat.title || "Untitled chat"}</strong>
                  <small>{formatRelativeTime(chat.lastMessageAt)}</small>
                </span>
                {chat.activeRunStatus ? (
                  <Badge tone={isRunActive(chat.activeRunStatus) ? "working" : "neutral"}>
                    {runStageLabel(chat.activeRunStatus)}
                  </Badge>
                ) : null}
              </Link>
            ))}
            {status === "CanLoadMore" ? (
              <Button onClick={() => loadMore(30)} size="small" variant="quiet">
                Load older chats
              </Button>
            ) : null}
          </nav>
        </>
      )}
    </aside>
  );
}
