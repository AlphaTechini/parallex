"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { Composer } from "@/components/chat/Composer";
import { MessageRow } from "@/components/chat/MessageRow";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { isRunActive } from "@/lib/runStatus";
import type { ProviderId } from "@/lib/models";

function scrollToLatest(
  bottomRef: { current: HTMLDivElement | null },
  programmaticScrollRef: { current: boolean },
  scrollTimerRef: { current: number | null },
) {
  programmaticScrollRef.current = true;
  if (scrollTimerRef.current !== null) {
    window.clearTimeout(scrollTimerRef.current);
  }
  bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  scrollTimerRef.current = window.setTimeout(() => {
    programmaticScrollRef.current = false;
    scrollTimerRef.current = null;
  }, 700);
}

export function ChatExperience({ chatId }: { chatId: Id<"chats"> }) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const programmaticScrollRef = useRef(false);
  const scrollTimerRef = useRef<number | null>(null);
  const touchYRef = useRef<number | null>(null);
  const chat = useQuery(api.chats.getChat, { chatId });
  const bot = useQuery(
    api.bots.getBot,
    chat ? { botId: chat.botId } : "skip",
  );
  const credentials = useQuery(api.credentials.getProviderCredentialStatuses, {});
  const run = useQuery(
    api.runs.getRun,
    chat?.activeRunId ? { runId: chat.activeRunId } : "skip",
  );
  const { results: resultsDesc, status, loadMore } = usePaginatedQuery(
    api.messages.listMessages,
    { chatId },
    { initialNumItems: 50 },
  );

  const messages = [...resultsDesc].reverse();
  const active = isRunActive(run?.status);
  const lastMessage = messages[messages.length - 1];
  const timelineReady =
    chat !== undefined &&
    chat !== null &&
    bot !== undefined &&
    bot !== null &&
    credentials !== undefined;

  useEffect(() => {
    const updateFollowState = () => {
      const currentScrollY = window.scrollY;
      const distance =
        document.documentElement.scrollHeight -
        (currentScrollY + window.innerHeight);
      if (distance < 180) followLatestRef.current = true;
      else if (
        !programmaticScrollRef.current &&
        currentScrollY < lastScrollYRef.current - 1
      ) {
        followLatestRef.current = false;
      }
      lastScrollYRef.current = currentScrollY;
    };
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        programmaticScrollRef.current = false;
        followLatestRef.current = false;
      }
    };
    const handleTouchStart = (event: TouchEvent) => {
      touchYRef.current = event.touches[0]?.clientY ?? null;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const nextY = event.touches[0]?.clientY;
      if (
        nextY !== undefined &&
        touchYRef.current !== null &&
        nextY > touchYRef.current
      ) {
        programmaticScrollRef.current = false;
        followLatestRef.current = false;
      }
      touchYRef.current = nextY ?? null;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
        programmaticScrollRef.current = false;
        followLatestRef.current = false;
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.clientX >= document.documentElement.clientWidth - 20) {
        programmaticScrollRef.current = false;
      }
    };
    lastScrollYRef.current = window.scrollY;
    updateFollowState();
    window.addEventListener("scroll", updateFollowState, { passive: true });
    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateFollowState);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    if (!followLatestRef.current) return;
    scrollToLatest(bottomRef, programmaticScrollRef, scrollTimerRef);
  }, [messages.length, lastMessage?.content, lastMessage?.status, run?.status]);

  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline === null) return;
    const observer = new MutationObserver(() => {
      if (!followLatestRef.current) return;
      requestAnimationFrame(() => {
        scrollToLatest(bottomRef, programmaticScrollRef, scrollTimerRef);
      });
    });
    observer.observe(timeline, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [timelineReady]);

  useEffect(() => {
    const timeline = timelineRef.current;
    const composerDock = composerDockRef.current;
    if (timeline === null || composerDock === null) return;
    const observer = new ResizeObserver(([entry]) => {
      timeline.style.setProperty(
        "--composer-height",
        `${Math.ceil(entry.contentRect.height)}px`,
      );
      if (followLatestRef.current) {
        requestAnimationFrame(() => {
          scrollToLatest(bottomRef, programmaticScrollRef, scrollTimerRef);
        });
      }
    });
    observer.observe(composerDock);
    return () => observer.disconnect();
  }, [timelineReady]);

  if (chat === undefined || bot === undefined || credentials === undefined) {
    return <div className="page-loading"><Spinner label="Loading chat" /></div>;
  }
  if (chat === null || bot === null) {
    return <section className="empty-state"><h1>Chat not found</h1></section>;
  }

  const configuredProviders: ProviderId[] = [
    ...(credentials.openai ? (["openai"] as const) : []),
    ...(credentials.zhipu ? (["zhipu"] as const) : []),
  ];

  return (
    <div className="chat-layout">
      <aside className="chat-rail">
        <Link className="back-link" href={`/bots?botId=${bot._id}`}>← {bot.name}</Link>
        <BotAvatar avatar={bot.avatar} name={bot.name} size="medium" />
        <div>
          <span className="eyebrow">Conversation</span>
          <h1>{chat.title || "Untitled chat"}</h1>
        </div>
        <p>{bot.mission}</p>
        <code>{bot.emailAddress || "Provisioning inbox"}</code>
      </aside>

      <section className="chat-main">
        <div className="message-list" aria-live="polite" ref={timelineRef}>
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
          <div aria-hidden="true" className="chat-bottom-anchor" ref={bottomRef} />
        </div>
        <div className="composer-dock" ref={composerDockRef}>
          <Composer
            chatId={chatId}
            configuredProviders={configuredProviders}
            onSubmitted={() => {
              followLatestRef.current = true;
              requestAnimationFrame(() => {
                scrollToLatest(bottomRef, programmaticScrollRef, scrollTimerRef);
              });
            }}
            runActive={active}
          />
        </div>
      </section>
    </div>
  );
}
