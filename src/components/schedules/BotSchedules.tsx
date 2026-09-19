"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import { ScheduleRow } from "@/components/schedules/ScheduleRow";
import { Spinner } from "@/components/ui/Spinner";

export function BotSchedules({ botId }: { botId: Id<"bots"> }) {
  const schedules = useQuery(api.schedules.listSchedules, { botId });

  return (
    <section className="detail-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Automation</span>
          <h2>Research schedules</h2>
        </div>
      </div>
      {schedules === undefined ? (
        <Spinner label="Loading schedules" />
      ) : schedules.length === 0 ? (
        <div className="panel-empty">
          <h3>No schedules yet</h3>
          <p>Ask the bot in chat to create recurring or future research.</p>
        </div>
      ) : (
        <div className="schedule-list">
          {schedules.map((schedule) => (
            <ScheduleRow key={schedule._id} schedule={schedule} />
          ))}
        </div>
      )}
    </section>
  );
}
