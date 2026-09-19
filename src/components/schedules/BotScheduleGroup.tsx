"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { BotAvatar } from "@/components/bots/BotAvatar";
import { ScheduleRow } from "@/components/schedules/ScheduleRow";

export function BotScheduleGroup({
  bot,
}: {
  bot: {
    _id: Id<"bots">;
    name: string;
    avatar:
      | { kind: "default"; colorIndex: number }
      | { kind: "upload"; url: string | null };
  };
}) {
  const schedules = useQuery(api.schedules.listSchedules, { botId: bot._id });
  if (!schedules?.length) return null;

  return (
    <section className="schedule-group">
      <div className="schedule-group-heading">
        <BotAvatar avatar={bot.avatar} name={bot.name} size="small" />
        <h2>{bot.name}</h2>
      </div>
      <div className="schedule-list">
        {schedules.map((schedule) => (
          <ScheduleRow key={schedule._id} schedule={schedule} />
        ))}
      </div>
    </section>
  );
}
