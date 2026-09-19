# Schedules route

This route group contains the cross-bot schedules overview.

To find the schedules page that groups every bot's schedules in one place visit [page.tsx](file:///C:/Hackathons/Parallex/src/app/schedules/page.tsx).

The schedule lifecycle controls connection can be found in [schedules.ts](file:///C:/Hackathons/Parallex/convex/schedules.ts) and in [ScheduleRow.tsx](file:///C:/Hackathons/Parallex/src/components/schedules/ScheduleRow.tsx). The occurrence execution connection can be found in [scheduleOccurrenceWorker.ts](file:///C:/Hackathons/Parallex/convex/scheduleOccurrenceWorker.ts).

## Architectural decisions

- This surface is lifecycle-only: pause, resume, and delete. Schedule creation and meaning changes stay conversational so the model's semantic validation cannot be bypassed with a form.
- The overview iterates the owner's bots and renders one group per bot, which mirrors the ownership model instead of one global list that would need extra joins.
