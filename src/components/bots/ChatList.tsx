"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";

import { api } from "../../../convex/_generated/api";
import { NewChatButton } from "@/components/chat/NewChatButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { formatRelativeTime } from "@/lib/format";
import { isRunActive, runStageLabel } from "@/lib/runStatus";

export function ChatList({ botId }: { botId: Id<"bots"> }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.chats.listChats,
    { botId },
    { initialNumItems: 20 },
  );
  return (
    <section className="detail-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Conversations</span>
          <h2>Research threads</h2>
        </div>
        <NewChatButton botId={botId} />
      </div>
      {status === "LoadingFirstPage" ? (
        <Spinner label="Loading chats" />
      ) : results.length === 0 ? (
        <div className="panel-empty">
          <h3>No conversations yet</h3>
          <p>Start a chat to give this bot its first research assignment.</p>
        </div>
      ) : (
        <div className="chat-list">
          {results.map((chat) => (
             <Link className="chat-row" href={`/chats?chatId=${chat._id}`} key={chat._id}>
              <div>
                <strong>{chat.title || "Untitled chat"}</strong>
                <span>{formatRelativeTime(chat.lastMessageAt)}</span>
              </div>
              {chat.activeRunStatus ? (
                <Badge tone={isRunActive(chat.activeRunStatus) ? "working" : "neutral"}>
                  {runStageLabel(chat.activeRunStatus)}
                </Badge>
              ) : (
                <span aria-hidden="true">→</span>
              )}
            </Link>
          ))}
          {status === "CanLoadMore" ? (
            <Button onClick={() => loadMore(20)} variant="secondary">
              Load more
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
