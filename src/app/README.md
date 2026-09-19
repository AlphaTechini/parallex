# App Router

This directory contains the Next.js App Router tree: the root layout, providers, the entry redirect, and one folder per route group. Pages are thin; product behavior lives in the components they mount.

To find the root layout, fonts, and provider wiring visit [layout.tsx](file:///C:/Hackathons/Parallex/src/app/layout.tsx) and [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx).

To find the authenticated entry redirect visit [page.tsx](file:///C:/Hackathons/Parallex/src/app/page.tsx).

To find global styles and the Tailwind entry visit [globals.css](file:///C:/Hackathons/Parallex/src/app/globals.css).

Route group folders: [bots/](file:///C:/Hackathons/Parallex/src/app/bots/README.md), [chats/](file:///C:/Hackathons/Parallex/src/app/chats/README.md), [dashboard/](file:///C:/Hackathons/Parallex/src/app/dashboard/README.md), [schedules/](file:///C:/Hackathons/Parallex/src/app/schedules/README.md), [settings/](file:///C:/Hackathons/Parallex/src/app/settings/README.md), [signin/](file:///C:/Hackathons/Parallex/src/app/signin/README.md).

The Convex client and Convex Auth provider connection can be found in [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx).

## Architectural decisions

- Pages stay small and delegate to category components, so routing changes rarely touch product logic.
- Providers degrade gracefully: when `NEXT_PUBLIC_CONVEX_URL` is absent the provider unmounts and the app renders a configuration state, which lets the production build succeed before Convex provisioning exists.
- The entry page is force-dynamic and redirects to `/dashboard` or `/signin` based on server-side authentication state, keeping the default route honest for both states.
- Dynamic segments (`[botId]`, `[chatId]`) pass identifiers straight to Convex functions; the functions, not the route, verify ownership.
