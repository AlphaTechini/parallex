# Convex backend

This directory contains the Convex Auth wiring, application schema, resumable research workers, Firecrawl provider integration, AgentMail delivery and webhook handling, report persistence, and schedule execution.

The authentication boundary can be found in [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts). The authentication provider configuration can be found in [auth.config.ts](file:///C:/Hackathons/Parallex/convex/auth.config.ts). HTTP route registration can be found in [http.ts](file:///C:/Hackathons/Parallex/convex/http.ts). The schema boundary can be found in [schema.ts](file:///C:/Hackathons/Parallex/convex/schema.ts). Convex compiler settings can be found in [tsconfig.json](file:///C:/Hackathons/Parallex/convex/tsconfig.json).

To find Firecrawl source persistence and durable provider jobs visit [sources.ts](file:///C:/Hackathons/Parallex/convex/sources.ts), [firecrawlJobs.ts](file:///C:/Hackathons/Parallex/convex/firecrawlJobs.ts), and [firecrawlJobPoller.ts](file:///C:/Hackathons/Parallex/convex/firecrawlJobPoller.ts).

To find report storage and private download authorization visit [reports.ts](file:///C:/Hackathons/Parallex/convex/reports.ts) and [reportRenderer.ts](file:///C:/Hackathons/Parallex/reportRenderer.ts).

To find AgentMail outbound, inbound, and webhook handling visit [emails.ts](file:///C:/Hackathons/Parallex/convex/emails.ts), [emailSender.ts](file:///C:/Hackathons/Parallex/convex/workers/emailSender.ts), [inboundEmailProcessor.ts](file:///C:/Hackathons/Parallex/convex/inboundEmailProcessor.ts), and [webhooks.ts](file:///C:/Hackathons/Parallex/convex/webhooks.ts).

To find schedule creation, recurrence calculation, occurrence execution, and user controls visit [schedules.ts](file:///C:/Hackathons/Parallex/convex/schedules.ts), [scheduleOccurrenceWorker.ts](file:///C:/Hackathons/Parallex/convex/scheduleOccurrenceWorker.ts), and [recurrence.ts](file:///C:/Hackathons/Parallex/convex/lib/recurrence.ts).

The Convex database and authentication connection can be found in [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts), [auth.config.ts](file:///C:/Hackathons/Parallex/convex/auth.config.ts), and [http.ts](file:///C:/Hackathons/Parallex/convex/http.ts).

## Next 16 + Convex Auth spike

The pinned `@convex-dev/auth@0.0.95` package does not export `@convex-dev/auth/nextjs/client`. The working client provider export is `ConvexAuthNextjsProvider` from `@convex-dev/auth/nextjs`, used by [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx).

Next 16 uses the `proxy.ts` file convention. The compatibility implementation is in [proxy.ts](file:///C:/Hackathons/Parallex/src/proxy.ts) and uses `convexAuthNextjsMiddleware()` with the documented static matcher. `pnpm build` recognized the file as `Proxy (Middleware)` and completed successfully, so no `middleware.ts` fallback was needed.

The build can run before a Convex deployment is provisioned. [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx) leaves the provider unmounted when `NEXT_PUBLIC_CONVEX_URL` is absent, and [signin/page.tsx](file:///C:/Hackathons/Parallex/src/app/signin/page.tsx) shows a configuration state instead of evaluating auth hooks. The user must run `pnpm convex:dev` once and provide the generated environment values before using authentication.

Convex Auth exports `authTables` as a named export in the pinned package, so [schema.ts](file:///C:/Hackathons/Parallex/convex/schema.ts) uses the named import. The package requires an `@auth/core` peer in the `0.41.x` range. The docs reference `0.41.1`, but the root manifest pins patched `0.41.3` after the audit identified vulnerabilities in `0.41.1`.

The generated Convex API and data model files are maintained by `pnpm exec convex codegen` and should remain synchronized with the backend exports.
