# Templates route

This protected route presents curated bot templates and mounts the review-first deployment experience.

To find the `/templates` route wrapper visit [page.tsx](file:///C:/Hackathons/Parallex/src/app/templates/page.tsx).

The template catalog, filters, overview, edit mode, email identity selection, API-key gate, timezone capture, and deployment connection can be found in [TemplateDashboard.tsx](file:///C:/Hackathons/Parallex/src/components/templates/TemplateDashboard.tsx) and the surrounding [template components](file:///C:/Hackathons/Parallex/src/components/templates/README.md).

## Architectural decisions

- The route remains statically exportable by using a query-string template selector rather than a dynamic segment.
- Authentication at the route is an experience guard only. Bot and inbox ownership remains enforced by Convex.
- The selected template ID remains in the URL, so visiting Settings for a missing API key does not require a private client-side template store.
