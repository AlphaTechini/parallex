# Next.js application

This directory contains the Next.js 16 App Router frontend: route protection, pages, UI components, and client-safe helpers. The frontend is a realtime viewer and submitter of Convex state. It never talks to OpenAI, Zhipu, Firecrawl, or AgentMail directly, never holds provider credentials, and never decides authorization.

To find route protection for page navigation visit [proxy.ts](file:///C:/Hackathons/Parallex/src/proxy.ts).

To find pages and routing groups visit [app/](file:///C:/Hackathons/Parallex/src/app/README.md). To find UI components by category visit [components/](file:///C:/Hackathons/Parallex/src/components/README.md). To find client-safe helpers visit [lib/](file:///C:/Hackathons/Parallex/src/lib/README.md).

The Convex realtime and authentication connection can be found in [app/providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx). The route protection connection can be found in [proxy.ts](file:///C:/Hackathons/Parallex/src/proxy.ts).

## Architectural decisions

- The browser owns presentation only. Every mutation goes through an owner-checked Convex function, so the proxy is a routing convenience and never the authorization boundary.
- Data access is reactive: pages subscribe to Convex queries instead of fetching once, so reopening a chat on any device shows the persisted run state immediately.
- Server-side values are never bundled to the client. Only `NEXT_PUBLIC_CONVEX_URL` is read in client code; everything else stays in Convex server scope.
- Markdown rendered from model output passes through a sanitizing renderer with a protocol allowlist, regardless of server-side sanitization, so stored artifacts and displayed chat are protected independently.
- Components are grouped by product category (bots, chat, layout, schedules, settings) with a minimal shared `ui` set, so a feature's logic is findable by folder rather than by search.
