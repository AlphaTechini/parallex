"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { BotScheduleGroup } from "@/components/schedules/BotScheduleGroup";
import { Spinner } from "@/components/ui/Spinner";

export default function SchedulesPage() {
  return (
    <AuthGuard>
      <SchedulesContent />
    </AuthGuard>
  );
}

function SchedulesContent() {
  const bots = useQuery(api.bots.listBots, {});
  return (
    <AppShell>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Automation</span>
          <h1>Schedules</h1>
          <p>Pause, resume, and review research your bots will run later.</p>
        </div>
      </div>
      {bots === undefined ? (
        <Spinner label="Loading schedules" />
      ) : bots.length === 0 ? (
        <section className="empty-state"><h2>No bots yet</h2></section>
      ) : (
        <div className="schedule-groups">
          {bots.map((bot) => <BotScheduleGroup bot={bot} key={bot._id} />)}
        </div>
      )}
    </AppShell>
  );
}
