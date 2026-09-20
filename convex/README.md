# Convex backend

This directory contains the Convex Auth wiring, application schema, OpenAI and Zhipu research workers, Firecrawl provider integration, AgentMail delivery and webhook handling, report persistence, and schedule execution.

The authentication boundary can be found in [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts). The authentication provider configuration can be found in [auth.config.ts](file:///C:/Hackathons/Parallex/convex/auth.config.ts). HTTP route registration can be found in [http.ts](file:///C:/Hackathons/Parallex/convex/http.ts). The schema boundary can be found in [schema.ts](file:///C:/Hackathons/Parallex/convex/schema.ts). Convex compiler settings can be found in [tsconfig.json](file:///C:/Hackathons/Parallex/convex/tsconfig.json).

To find Firecrawl source persistence and durable provider jobs visit [sources.ts](file:///C:/Hackathons/Parallex/convex/sources.ts), [firecrawlJobs.ts](file:///C:/Hackathons/Parallex/convex/firecrawlJobs.ts), and [firecrawlJobPoller.ts](file:///C:/Hackathons/Parallex/convex/firecrawlJobPoller.ts).

To find report storage, Markdown sanitization, and private download authorization visit [reports.ts](file:///C:/Hackathons/Parallex/convex/reports.ts) and [reportRenderer.ts](file:///C:/Hackathons/Parallex/reportRenderer.ts).

To find AgentMail outbound, inbound, and webhook handling visit [emails.ts](file:///C:/Hackathons/Parallex/convex/emails.ts), [emailSender.ts](file:///C:/Hackathons/Parallex/convex/workers/emailSender.ts), [inboundEmailProcessor.ts](file:///C:/Hackathons/Parallex/convex/inboundEmailProcessor.ts), and [webhooks.ts](file:///C:/Hackathons/Parallex/convex/webhooks.ts).

To find schedule creation, recurrence calculation, occurrence execution, and user controls visit [schedules.ts](file:///C:/Hackathons/Parallex/convex/schedules.ts), [scheduleOccurrenceWorker.ts](file:///C:/Hackathons/Parallex/convex/scheduleOccurrenceWorker.ts), and [recurrence.ts](file:///C:/Hackathons/Parallex/convex/lib/recurrence.ts).

To find prompt submission, receipt, duplicate protection, and chat queueing visit [messages.ts](file:///C:/Hackathons/Parallex/convex/messages.ts) and [runs.ts](file:///C:/Hackathons/Parallex/convex/runs.ts).

To find bot creation, inbox provisioning state, and the email bot limit visit [bots.ts](file:///C:/Hackathons/Parallex/convex/bots.ts) and [inboxes.ts](file:///C:/Hackathons/Parallex/convex/inboxes.ts).

To find owner-bound upload validation for avatars and research attachments visit [attachments.ts](file:///C:/Hackathons/Parallex/convex/attachments.ts) and the upload mutations in [bots.ts](file:///C:/Hackathons/Parallex/convex/bots.ts).

To find encrypted OpenAI and Zhipu credential storage visit [credentials.ts](file:///C:/Hackathons/Parallex/convex/credentials.ts).

The Convex database and authentication connection can be found in [auth.ts](file:///C:/Hackathons/Parallex/convex/auth.ts), [auth.config.ts](file:///C:/Hackathons/Parallex/convex/auth.config.ts), and [http.ts](file:///C:/Hackathons/Parallex/convex/http.ts). The AgentMail webhook connection can be found in [webhooks.ts](file:///C:/Hackathons/Parallex/convex/webhooks.ts) and [http.ts](file:///C:/Hackathons/Parallex/convex/http.ts).

Subsystem folders: [lib/](file:///C:/Hackathons/Parallex/convex/lib/README.md), [prompts/](file:///C:/Hackathons/Parallex/convex/prompts/README.md), [tools/](file:///C:/Hackathons/Parallex/convex/tools/README.md), [workers/](file:///C:/Hackathons/Parallex/convex/workers/README.md).

## Architectural decisions

- Convex is the entire backend: database, realtime layer, auth, actions, scheduler, and file storage. No second server exists, so ownership checks live in one place and the realtime UI subscribes to the same state the workers write. The tradeoff is tight coupling to Convex limits (action duration, bandwidth, storage).
- Every application table carries `ownerId` with owner-prefixed indexes, and public functions derive the user from Convex Auth rather than trusting arguments. This costs a predictable amount of repetitive checking code but makes tenant isolation structural instead of per-feature.
- Provider identifiers (OpenAI conversation and response identifiers, Zhipu completion identifiers, Firecrawl job identifiers, AgentMail inbox, thread, and message identifiers) are stored as backend metadata with internal ownership context. They speed up provider operations but never authorize anything on their own.
- One active run per chat is enforced through `chats.activeRunId`, with queued runs promoted by a follow-up mutation. This serializes provider spend and keeps the activity feed unambiguous at the cost of within-chat throughput.
- Long work is split across short Node actions with lease and generation counters plus a delayed watchdog, because a single action cannot outlast the Convex execution limit. OpenAI checkpoints stream cursors, while Zhipu checkpoints complete Chat Completions turns and tool barriers. The run can therefore survive interruptions and browser closure, but the state machine has more explicit checkpoints than a naive implementation.
- Side effects (tool execution, report storage, email send, schedule creation, inbox creation) are idempotent through derived keys, so worker retries never duplicate external operations.
- Email sending, inbox provisioning, and provider calls live in `"use node"` actions because their SDKs need the Node runtime; state transitions stay in mutations so each provider call is preceded and followed by transactional bookkeeping.

## Next 16 + Convex Auth spike

The pinned `@convex-dev/auth@0.0.95` package does not export `@convex-dev/auth/nextjs/client`. The working client provider export is `ConvexAuthNextjsProvider` from `@convex-dev/auth/nextjs`, used by [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx).

Next 16 uses the `proxy.ts` file convention. The compatibility implementation is in [proxy.ts](file:///C:/Hackathons/Parallex/src/proxy.ts) and uses `convexAuthNextjsMiddleware()` with the documented static matcher. `pnpm build` recognized the file as `Proxy (Middleware)` and completed successfully, so no `middleware.ts` fallback was needed.

The build can run before a Convex deployment is provisioned. [providers.tsx](file:///C:/Hackathons/Parallex/src/app/providers.tsx) leaves the provider unmounted when `NEXT_PUBLIC_CONVEX_URL` is absent, and [signin/page.tsx](file:///C:/Hackathons/Parallex/src/app/signin/page.tsx) shows a configuration state instead of evaluating auth hooks. The user must run `pnpm convex:dev` once and provide the generated environment values before using authentication.

Convex Auth exports `authTables` as a named export in the pinned package, so [schema.ts](file:///C:/Hackathons/Parallex/convex/schema.ts) uses the named import. The package requires an `@auth/core` peer in the `0.41.x` range. The docs reference `0.41.1`, but the root manifest pins patched `0.41.3` after the audit identified vulnerabilities in `0.41.1`.

The generated Convex API and data model files are maintained by `pnpm exec convex codegen` and should remain synchronized with the backend exports.
