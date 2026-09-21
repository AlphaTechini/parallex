# Template components

This directory contains the source-controlled template catalog and the authenticated deployment experience for `/templates`.

To find the twenty curated bot definitions, detailed memory instructions, category metadata, and schedule bootstrap composition visit [templateCatalog.ts](file:///C:/Hackathons/Parallex/src/components/templates/templateCatalog.ts).

To find the shared template and schedule contracts visit [types.ts](file:///C:/Hackathons/Parallex/src/components/templates/types.ts).

The template dashboard and deployment connection can be found in [TemplateDashboard.tsx](file:///C:/Hackathons/Parallex/src/components/templates/TemplateDashboard.tsx). The bot persistence connection can be found in [bots.ts](file:///C:/Hackathons/Parallex/convex/bots.ts).

## Architectural decisions

- Templates are typed source data rather than mutable database rows. Deployments copy memory into versioned bot instructions, so later catalog releases do not silently alter existing bots.
- Scheduled templates append the browser IANA timezone and an idempotent first-run checklist to bot memory. Convex remains the schedule authority.
- The overview is read-only until Edit is selected, preserving a clear distinction between the curated default and user changes.
- Component-specific styles use a CSS module so the new route does not modify global styles while other product work is in progress.
