# Layout components

This directory contains the application frame shared by authenticated pages.

To find the app shell with the wordmark, main navigation, theme control, and sign-out control visit [AppShell.tsx](file:///C:/Hackathons/Parallex/src/components/layout/AppShell.tsx).

To find the persisted light/dark theme control visit [ThemeToggle.tsx](file:///C:/Hackathons/Parallex/src/components/layout/ThemeToggle.tsx).

To find the client-side auth gate used by protected static pages visit [AuthGuard.tsx](file:///C:/Hackathons/Parallex/src/components/layout/AuthGuard.tsx).

The sign-out connection can be found in [AppShell.tsx](file:///C:/Hackathons/Parallex/src/components/layout/AppShell.tsx) and [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts).

## Architectural decisions

- A single shell component owns the header and navigation so active-link state and sign-out behavior stay identical on every authenticated page.
- The theme control follows the system preference until a visitor chooses a theme; that choice is persisted in local storage and applied before hydration to avoid a visible theme flash.
- Navigation is intentionally small (dashboard, templates, schedules, settings); product surfaces live under bots and chats and are reached through the dashboard and detail pages.
- The auth guard waits for Convex Auth hydration before redirecting. This replaces request-time middleware so the frontend can be exported and hosted on Convex without weakening server-side ownership enforcement.
