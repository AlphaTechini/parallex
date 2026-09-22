# Schedule components

This directory contains the schedule presentation and lifecycle controls.

To find the per-schedule row with next run time and the pause, resume, and delete controls visit [ScheduleRow.tsx](file:///C:/Hackathons/Parallex/src/components/schedules/ScheduleRow.tsx).

To find the schedules section for one bot visit [BotSchedules.tsx](file:///C:/Hackathons/Parallex/src/components/schedules/BotSchedules.tsx).

To find the direct website-monitor creation form, including URL, daily or every-three-days frequency, optional change rule, and browser timezone capture visit [SiteMonitorForm.tsx](file:///C:/Hackathons/Parallex/src/components/schedules/SiteMonitorForm.tsx).

To find the bot group used on the cross-bot schedules overview visit [BotScheduleGroup.tsx](file:///C:/Hackathons/Parallex/src/components/schedules/BotScheduleGroup.tsx).

The schedule listing and lifecycle connection can be found in [BotSchedules.tsx](file:///C:/Hackathons/Parallex/src/components/schedules/BotSchedules.tsx) and [schedules.ts](file:///C:/Hackathons/Parallex/convex/schedules.ts). The occurrence execution connection can be found in [scheduleOccurrenceWorker.ts](file:///C:/Hackathons/Parallex/convex/scheduleOccurrenceWorker.ts).

## Architectural decisions

- General schedules remain conversational. Website monitors are the narrow exception: their form creates a locked, single-URL schedule with only daily or every-three-days recurrence.
- Time display uses a shared formatter and shows the stored schedule timezone context, so paused and active states are never ambiguous about when work will run.
