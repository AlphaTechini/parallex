"use client";

import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";

import { api } from "../../../convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { safeErrorMessage } from "@/lib/errors";
import { formatScheduleTime } from "@/lib/format";

type Schedule = {
  _id: Id<"researchSchedules">;
  name: string;
  researchPrompt: string;
  monitorUrl: string | null;
  monitorChangeDescription: string | null;
  scheduleKind: "one_time" | "recurring";
  timezone: string;
  nextRunAt: number | null;
  status: "active" | "paused" | "completed" | "deleted";
};

export function ScheduleRow({ schedule }: { schedule: Schedule }) {
  const pause = useMutation(api.schedules.pauseSchedule);
  const resume = useMutation(api.schedules.resumeSchedule);
  const remove = useMutation(api.schedules.deleteSchedule);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(safeErrorMessage(cause));
    }
  }

  return (
    <article className="schedule-row">
      <div className="schedule-copy">
        <div className="inline-row">
          <h3>{schedule.name}</h3>
          <Badge tone={schedule.status === "active" ? "success" : "neutral"}>
            {schedule.status}
          </Badge>
          <Badge tone="indigo">
            {schedule.scheduleKind === "one_time" ? "One time" : "Recurring"}
          </Badge>
          {schedule.monitorUrl ? <Badge tone="indigo">Site monitor</Badge> : null}
        </div>
        {schedule.monitorUrl ? (
          <p>
            Monitoring <a href={schedule.monitorUrl} rel="noreferrer" target="_blank">{schedule.monitorUrl}</a>
            {schedule.monitorChangeDescription
              ? ` for: ${schedule.monitorChangeDescription}`
              : " for any meaningful change"}
          </p>
        ) : (
          <p>{schedule.researchPrompt}</p>
        )}
        <span>
          {formatScheduleTime(schedule.nextRunAt)} · {schedule.timezone}
        </span>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
      <div className="row-actions">
        {schedule.status === "active" ? (
          <Button
            onClick={() => run(() => pause({ scheduleId: schedule._id }))}
            size="small"
            variant="secondary"
          >
            Pause
          </Button>
        ) : schedule.status === "paused" ? (
          <Button
            onClick={() => run(() => resume({ scheduleId: schedule._id }))}
            size="small"
            variant="secondary"
          >
            Resume
          </Button>
        ) : null}
        <Button
          onClick={() => {
            if (window.confirm("Delete this schedule? Historical runs will remain.")) {
              void run(() => remove({ scheduleId: schedule._id }));
            }
          }}
          size="small"
          variant="quiet"
        >
          Delete
        </Button>
      </div>
    </article>
  );
}
