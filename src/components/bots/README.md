# Bot components

This directory contains the bot identity and management components: the avatar renderer, dashboard card, creation form, memory editor, and chat list.

To find the deterministic SVG avatar renderer for default bots and the image renderer for uploads visit [BotAvatar.tsx](file:///C:/Hackathons/Parallex/src/components/bots/BotAvatar.tsx).

To find the dashboard card with name, mission, email capability, and chat entry points visit [BotCard.tsx](file:///C:/Hackathons/Parallex/src/components/bots/BotCard.tsx).

To find the creation form with the two-phase avatar upload, recipient defaulting, and mission limit visit [BotCreationForm.tsx](file:///C:/Hackathons/Parallex/src/components/bots/BotCreationForm.tsx).

To find the per-bot memory editor visit [BotMemoryEditor.tsx](file:///C:/Hackathons/Parallex/src/components/bots/BotMemoryEditor.tsx).

To find the paginated chat list for one bot visit [ChatList.tsx](file:///C:/Hackathons/Parallex/src/components/bots/ChatList.tsx).

The avatar upload and bot creation connection can be found in [BotCreationForm.tsx](file:///C:/Hackathons/Parallex/src/components/bots/BotCreationForm.tsx) and [bots.ts](file:///C:/Hackathons/Parallex/convex/bots.ts). The chat listing connection can be found in [ChatList.tsx](file:///C:/Hackathons/Parallex/src/components/bots/ChatList.tsx) and [chats.ts](file:///C:/Hackathons/Parallex/convex/chats.ts).

## Architectural decisions

- Default avatars are rendered from a stored palette index instead of uploaded files, so the seven-color loop costs no storage and stays deterministic per creation order.
- The creation form uploads the avatar through a claim token before bot creation and passes the storage identifier to `createBot`, so an orphaned upload can never become bot data.
- Mission is presented as descriptive metadata with explanatory copy, reinforcing that it is not a model instruction; memory is edited separately.
