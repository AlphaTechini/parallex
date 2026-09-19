# Convex tool execution

This directory contains the model-facing tool registry, argument contracts, and provider/product handlers. Tool execution stays behind internal Convex functions so ownership, run liveness, idempotency, and provider credentials are never supplied by the browser.

To find the exact model function schemas and validation logic visit [definitions.ts](file:///C:/Hackathons/Parallex/convex/tools/definitions.ts).

To find tool dispatch and handler registration visit [registry.ts](file:///C:/Hackathons/Parallex/convex/tools/registry.ts).

To find the shared executor contract visit [types.ts](file:///C:/Hackathons/Parallex/convex/tools/types.ts).

The OpenAI run connection can be found in [toolExecutor.ts](file:///C:/Hackathons/Parallex/convex/workers/toolExecutor.ts) and [runWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/runWorker.ts).

## Architectural decisions

- Each capability has one narrow handler instead of one generic provider function.
- Provider results are normalized before they are persisted or returned to the model.
- Side effects revalidate the owning run and tool call immediately before mutation or provider use.
