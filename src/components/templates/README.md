# Template components

This directory contains the source-controlled template catalog, the agent-created draft editor, and the authenticated deployment experience for `/templates`.

To find the twenty curated bot definitions, detailed memory instructions, category metadata, and schedule bootstrap composition visit [templateCatalog.ts](file:///C:/Hackathons/Parallex/src/components/templates/templateCatalog.ts). Every built-in memory ends with the shared comprehensive framework from [shared/templateFramework.ts](file:///C:/Hackathons/Parallex/shared/templateFramework.ts).

To find the shared template and schedule contracts visit [types.ts](file:///C:/Hackathons/Parallex/src/components/templates/types.ts).

The template dashboard, catalog filters, Drafts and My Templates sections, and `?draft=<id>` routing can be found in [TemplateDashboard.tsx](file:///C:/Hackathons/Parallex/src/components/templates/TemplateDashboard.tsx). The built-in deployment connection can be found in [TemplateOverview.tsx](file:///C:/Hackathons/Parallex/src/components/templates/TemplateOverview.tsx), while draft review, structured autosave editing, the canonical memory preview, and draft deployment (including the deploy-time avatar upload) can be found in [TemplateDraftEditor.tsx](file:///C:/Hackathons/Parallex/src/components/templates/TemplateDraftEditor.tsx). The bot persistence connection, including server-side memory compilation for drafts, can be found in [bots.ts](file:///C:/Hackathons/Parallex/convex/bots.ts) and [templateDrafts.ts](file:///C:/Hackathons/Parallex/convex/templateDrafts.ts). The durable chat review button can be found in [TemplateDraftArtifacts.tsx](file:///C:/Hackathons/Parallex/src/components/chat/TemplateDraftArtifacts.tsx).

## Architectural decisions

- Templates are typed source data rather than mutable database rows. Deployments copy memory into versioned bot instructions, so later catalog releases do not silently alter existing bots.
- Agent-created templates are persisted structured drafts in Convex, never raw memory strings. The backend validates section depth and compiles the canonical bot memory, so a draft cannot skip pricing, evidence, ranking, uncertainty, or safety sections. Raw memory is never an independent editable source.
- Scheduled templates append the browser IANA timezone and an idempotent first-run checklist to bot memory. Convex remains the schedule authority.
- The built-in overview is read-only until Edit is selected, preserving a clear distinction between the curated default and user changes. The draft editor is always editable with debounced autosave; the memory preview comes from the server response, never local compilation.
- Draft deployment passes only `templateDraftId` and configuration to `createBot`. The mutation compiles memory server-side from the saved draft and publishes the draft into My Templates on first deployment, so the browser cannot inject a different memory body.
- Avatars are selected and uploaded only during draft deployment through the owner-bound claim flow; nothing image-related is persisted on the draft itself.
- The email panel requires a valid report recipient and an explicit client-side confirmation of the selected inbox or address prefix. The confirmation invalidates when either email value changes, while bot and inbox persistence remain one atomic backend creation mutation.
- Component-specific styles use a CSS module so the route does not modify global styles while other product work is in progress.
