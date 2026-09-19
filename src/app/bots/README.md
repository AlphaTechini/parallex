# Bot routes

This route group contains bot creation and the bot detail workspace.

To find the new bot page that mounts the creation form visit [new/page.tsx](file:///C:/Hackathons/Parallex/src/app/bots/new/page.tsx).

To find the bot detail page with identity header, archive action, memory editor, and the chats and schedules tabs visit [botId]/page.tsx](file:///C:/Hackathons/Parallex/src/app/bots/[botId]/page.tsx), where the bracketed folder is the dynamic segment.

The bot data and creation connection can be found in [bots.ts](file:///C:/Hackathons/Parallex/convex/bots.ts) and in [BotCreationForm.tsx](file:///C:/Hackathons/Parallex/src/components/bots/BotCreationForm.tsx). The inbox provisioning state shown here can be found in [inboxes.ts](file:///C:/Hackathons/Parallex/convex/inboxes.ts).

## Architectural decisions

- Creation is a form component, not a server action, because avatar upload is a two-phase flow (claim token, direct storage upload, finalize) that reports progress to the user.
- The detail page tabs (chats, schedules) reuse the same bot detail shell, so schedule management stays in the bot context where schedules are created.
- Archive is the only destructive control on this page and keeps history intact; deletion is deliberately not exposed in the UI.
