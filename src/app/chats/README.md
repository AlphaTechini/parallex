# Chat route

This route group contains the conversation page for one chat.

To find the chat page that mounts the full chat experience for the `chatId` dynamic segment visit [chatId]/page.tsx](file:///C:/Hackathons/Parallex/src/app/chats/[chatId]/page.tsx).

The chat realtime connection can be found in [ChatExperience.tsx](file:///C:/Hackathons/Parallex/src/components/chat/ChatExperience.tsx) and in [chats.ts](file:///C:/Hackathons/Parallex/convex/chats.ts). The submission connection can be found in [Composer.tsx](file:///C:/Hackathons/Parallex/src/components/chat/Composer.tsx) and [messages.ts](file:///C:/Hackathons/Parallex/convex/messages.ts).

## Architectural decisions

- The page only resolves the route parameter and mounts the experience component, so deep-linking a chat URL is equivalent to opening it from the bot page.
- All state shown here (chat, bot, credential status, active run, messages) arrives through reactive Convex queries, which is what makes closing and reopening the tab non-destructive.
