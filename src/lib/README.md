# Client helpers

This directory contains small client-safe helpers shared by pages and components: model catalog presentation, safe error copy, formatting, and run status helpers. None of these hold secrets or perform authorization; they shape data that Convex functions already validated.

To find the model catalog with labels, blurbs, and per-model reasoning efforts visit [models.ts](file:///C:/Hackathons/Parallex/src/lib/models.ts).

To find the mapping from server error codes to safe user-facing messages visit [errors.ts](file:///C:/Hackathons/Parallex/src/lib/errors.ts).

To find relative time, byte size, and schedule time formatting visit [format.ts](file:///C:/Hackathons/Parallex/src/lib/format.ts).

To find run status classification and product-visible stage labels visit [runStatus.ts](file:///C:/Hackathons/Parallex/src/lib/runStatus.ts).

The backend model validation connection can be found in [models.ts](file:///C:/Hackathons/Parallex/src/lib/models.ts) mirrored by [models.ts](file:///C:/Hackathons/Parallex/convex/lib/models.ts), where the server enforces the same catalog.

## Architectural decisions

- Error copy is centralized and maps a closed set of server codes to actionable text; anything unrecognized collapses to a generic message so raw provider or internal errors never reach the screen.
- The client model catalog mirrors the server catalog for presentation, while the server copy remains the enforcement point. Display can never widen what the backend accepts.
- Run status helpers encapsulate the notion of an active run in one place so the composer, banner, and activity feed agree on when a run is live.
