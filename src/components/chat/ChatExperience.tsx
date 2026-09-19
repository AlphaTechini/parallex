"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { ActivityFeed } from "@/components/chat/ActivityFeed";
import { Composer } from "@/components/chat/Composer";
import { MessageRow } from "@/components/chat/MessageRow";
import { RunStatusBanner } from "@/components/chat/RunStatusBanner";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { isRunActive } from "@/lib/runStatus";

export function ChatExperience({ chatId }: { chatId: Id<"chats"> }) {
  const chat = useQuery(api.chats.getChat, { chatId });
  const bot = useQuery(
    api.bots.getBot,
    chat ? { botId: chat.botId } : "skip",
  );
  const credential = useQuery(api.credentials.getOpenAICredentialStatus, {});
  const run = useQuery(
    api.runs.getRun,
    chat?.activeRunId ? { runId: chat.activeRunId } : "skip",
  );
  const { results: resultsDesc, status, loadMore } = usePaginatedQuery(
    api.messages.listMessages,
    { chatId },
    { initialNumItems: 50 },
  );

  if (chat === undefined || bot === undefined || credential === undefined) {
    return <div className="page-loading"><Spinner label="Loading chat" /></div>;
  }
  if (chat === null || bot === null) {
    return <section className="empty-state"><h1>Chat not found</h1></section>;
  }

  const messages = [...resultsDesc].reverse();
  const active = isRunActive(run?.status);

  return (
    <div className="chat-layout">
      <aside className="chat-rail">
        <Link className="back-link" href={`/bots/${bot._id}`}>← {bot.name}</Link>
        <BotAvatar avatar={bot.avatar} name={bot.name} size="medium" />
        <div>
          <span className="eyebrow">Conversation</span>
          <h1>{chat.title || "Untitled chat"}</h1>
        </div>
        <p>{bot.mission}</p>
        <code>{bot.emailAddress || "Provisioning inbox"}</code>
      </aside>

      <section className="chat-main">
        {run && active ? <RunStatusBanner runId={run._id} status={run.status} /> : null}
        {run ? <ActivityFeed active={active} runId={run._id} /> : null}
        <div className="message-list" aria-live="polite">
          {status === "CanLoadMore" ? (
            <Button onClick={() => loadMore(50)} size="small" variant="quiet">
              Load older messages
            </Button>
          ) : null}
          {messages.length === 0 ? (
            <div className="chat-empty">
              <span className="empty-index">01</span>
              <h2>What should {bot.name} investigate?</h2>
              <p>
                Ask a focused question, attach source documents, or create a
                recurring brief in natural language.
              </p>
            </div>
          ) : (
            messages.map((message) => <MessageRow key={message._id} message={message} />)
          )}
        </div>
        <Composer
          chatId={chatId}
          credentialConfigured={credential.configured}
          runActive={active}
        />
      </section>
    </div>
  );
}
