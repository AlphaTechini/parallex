"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { api } from "../../../convex/_generated/api";
import { BotCard } from "@/components/bots/BotCard";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Spinner } from "@/components/ui/Spinner";

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const bots = useQuery(api.bots.listBots, {});
  const ensureProfile = useMutation(api.userProfiles.ensureProfile);
  const [emailFilter, setEmailFilter] = useState("all");

  useEffect(() => {
    void ensureProfile({});
  }, [ensureProfile]);

  const emailAddresses = Array.from(
    new Set(
      (bots ?? [])
        .map((bot) => bot.emailAddress)
        .filter((address): address is string => address !== null),
    ),
  ).sort();
  const visibleBots =
    emailFilter === "all"
      ? bots ?? []
      : (bots ?? []).filter((bot) => bot.emailAddress === emailFilter);

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
        <>
          {emailAddresses.length > 1 ? (
            <label className="field-label mb-6 max-w-sm">
              <span>Filter by bot email</span>
              <select
                onChange={(event) => setEmailFilter(event.target.value)}
                value={emailFilter}
              >
                <option value="all">All email addresses</option>
                {emailAddresses.map((address) => (
                  <option key={address} value={address}>
                    {address}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {visibleBots.length === 0 ? (
            <section className="empty-state">
              <div>
                <span className="eyebrow">No matching bots</span>
                <h2>Choose another email address</h2>
              </div>
            </section>
          ) : (
            <section className="bot-grid" aria-label="Research bots">
              {visibleBots.map((bot) => (
                <BotCard bot={bot} key={bot._id} />
              ))}
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
