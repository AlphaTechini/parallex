# Components

This directory contains the React component tree, grouped by product category with a minimal shared `ui` set. Components subscribe to Convex queries and mutations directly; there is no separate client-side state layer.

To find per-category documentation visit [bots/](file:///C:/Hackathons/Parallex/src/components/bots/README.md), [chat/](file:///C:/Hackathons/Parallex/src/components/chat/README.md), [layout/](file:///C:/Hackathons/Parallex/src/components/layout/README.md), [schedules/](file:///C:/Hackathons/Parallex/src/components/schedules/README.md), [settings/](file:///C:/Hackathons/Parallex/src/components/settings/README.md), [templates/](file:///C:/Hackathons/Parallex/src/components/templates/README.md), and [ui/](file:///C:/Hackathons/Parallex/src/components/ui/README.md). The `auth/` folder is a reserved boundary described in [auth/](file:///C:/Hackathons/Parallex/src/components/auth/README.md).

The Convex client connection can be found in [../app/providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx).

## Architectural decisions

- One category folder per product surface, so chat behavior, bot management, template deployment, schedule controls, and settings are findable by folder instead of by naming convention.
- Product components compose the small shared `ui` primitives (Button, Badge, Card, Spinner) rather than restyling raw elements, which keeps contrast and focus treatment consistent across surfaces.
- Activity and artifact components render backend event records, never model prose, so the interface cannot claim an operation succeeded before the database says so.
- Category components import directly from `convex/_generated/api`; there is no intermediate client API layer to drift out of sync with function signatures.
