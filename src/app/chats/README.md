# Chat route

This route group contains the conversation page for one chat.

To find the static chat route wrapper visit [page.tsx](file:///C:/Hackathons/Parallex/src/app/chats/page.tsx). It mounts the `chatId` query-string experience in [ChatPageContent.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ChatPageContent.tsx).

The chat realtime connection can be found in [ChatExperience.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ChatExperience.tsx) and in [chats.ts](file:///C:/Hackathons/Parallex/convex/chats.ts). The submission connection can be found in [Composer.tsx](file:///C:/Hackathons/Parallex/src/components/chat/Composer.tsx) and [messages.ts](file:///C:/Hackathons/Parallex/convex/messages.ts).

## Architectural decisions

- The page resolves a `chatId` query string and mounts the experience component, so `/chats?chatId=...` deep-links are equivalent to opening a chat from its bot page without requiring unbounded static route generation.
- All state shown here (chat, bot, credential status, active run, messages) arrives through reactive Convex queries, which is what makes closing and reopening the tab non-destructive.
