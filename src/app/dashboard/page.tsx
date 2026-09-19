"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect } from "react";

import { api } from "../../../convex/_generated/api";
import { BotCard } from "@/components/bots/BotCard";
import { AppShell } from "@/components/layout/AppShell";
import { Spinner } from "@/components/ui/Spinner";

export default function DashboardPage() {
  const bots = useQuery(api.bots.listBots, {});
  const ensureProfile = useMutation(api.userProfiles.ensureProfile);

  useEffect(() => {
    void ensureProfile({});
  }, [ensureProfile]);

  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Research workspace</span>
          <h1>Your bots</h1>
          <p>Persistent specialists with their own memory and inbox.</p>
        </div>
        <Link className="button button-primary button-medium" href="/bots/new">
          Create bot
        </Link>
      </div>

      {bots === undefined ? (
        <div className="page-loading">
          <Spinner label="Loading bots" />
        </div>
      ) : bots.length === 0 ? (
        <section className="empty-state">
          <span className="empty-index">01</span>
          <div>
            <span className="eyebrow">No bots yet</span>
            <h2>Create your first research bot</h2>
            <p>
              A bot is a durable research identity with its own instructions,
              conversations, reports, schedules, and email address.
            </p>
          </div>
          <Link className="button button-primary button-large" href="/bots/new">
            Create your first bot
          </Link>
        </section>
      ) : (
        <section className="bot-grid" aria-label="Research bots">
          {bots.map((bot) => (
            <BotCard bot={bot} key={bot._id} />
          ))}
        </section>
      )}
    </AppShell>
  );
}
