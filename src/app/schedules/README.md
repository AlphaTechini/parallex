# Schedules route

This route group contains the cross-bot schedules overview.

To find the schedules page that groups every bot's schedules in one place visit [page.tsx](file:///C:/Hackathons/Parallex/src/app/schedules/page.tsx).

The schedule lifecycle controls connection can be found in [schedules.ts](file:///C:/Hackathons/Parallex/convex/schedules.ts) and in [ScheduleRow.tsx](file:///C:/Hackathons/Parallex/src/components/schedules/ScheduleRow.tsx). The occurrence execution connection can be found in [scheduleOccurrenceWorker.ts](file:///C:/Hackathons/Parallex/convex/scheduleOccurrenceWorker.ts). Website monitor creation can be found in [SiteMonitorForm.tsx](file:///C:/Hackathons/Parallex/src/components/schedules/SiteMonitorForm.tsx) and [siteMonitors.ts](file:///C:/Hackathons/Parallex/convex/siteMonitors.ts).

## Architectural decisions

- This cross-bot surface remains lifecycle-only. The per-bot Schedules tab exposes the narrow website-monitor form, which validates one target URL and fixed daily or every-three-days recurrence without allowing general schedule semantics to bypass conversational validation.
- The overview iterates the owner's bots and renders one group per bot, which mirrors the ownership model instead of one global list that would need extra joins.
