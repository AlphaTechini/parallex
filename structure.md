# Project structure

This file maps the Parallex repository: the folder tree, where each area of logic lives, and links to the README for every folder. The product overview and setup instructions are in [README.md](README.md).

## Folder tree

```
Parallex/
|-- README.md               Product overview, setup, security model
|-- structure.md            This file
|-- tasks.md                Templates and shared-email implementation ledger
|-- package.json            Scripts and pinned dependencies (pnpm)
|-- pnpm-lock.yaml          Authoritative lockfile
|-- pnpm-workspace.yaml     pnpm build approvals and release-age exceptions
|-- next.config.ts          Next.js configuration
|-- tsconfig.json           Root TypeScript configuration
|-- eslint.config.mjs       ESLint with Next.js core-web-vitals and TypeScript presets
|-- postcss.config.mjs      PostCSS pipeline for Tailwind CSS v4
|-- .env.example            Environment variable schema (names only)
|-- shared/                 Runtime-neutral contracts shared by client and backend
|   |-- templateFramework.ts  Comprehensive intake, evaluation, pricing, and ranking framework
|-- scripts/                Cross-platform deployment helpers
|-- llm.txt                 Official documentation references per technology
|-- reportRenderer.ts       Markdown-to-PDF renderer used by report publication
|-- convex/                 Convex backend (schema, functions, workers, tools)
|   |-- convex.config.ts    Static-hosting component registration
|   |-- staticSite.ts       Next export route-to-asset HTTP adapter
|   |-- lib/               Shared backend helpers (auth, crypto, providers, normalization)
|   |-- prompts/           Research protocol and instruction composition
|   |-- tools/             Model-facing tool registry and product handlers
|   |   |-- firecrawl/    Fifteen Firecrawl capability handlers
|   |-- workers/           Run worker, run mutations, email, inbox, stream, tool execution
|   |-- _generated/        Convex codegen output (generated, do not edit)
|-- src/                    Next.js application
|   |-- app/               App Router pages and providers
|   |   |-- templates/    Curated template catalog route
|   |-- components/        UI components by category
|   |   |-- templates/    Catalog, overview, editor, and deployment UI
|   |-- lib/               Client-safe helpers (models, errors, formatting, run status)
|-- docs/                   Documentation: index and acceptance checklist
|-- tests/                  Test suite location (Vitest runner configured)
```

`convex/_generated/` is maintained by `pnpm exec convex codegen` and is excluded from linting and from these docs.

## High-level logic map

- Data model and ownership indexes: [convex/schema.ts](convex/schema.ts). Every application table carries an `ownerId` and owner-prefixed indexes.
- Authentication boundary: [convex/auth.ts](convex/auth.ts), [convex/auth.config.ts](convex/auth.config.ts), and HTTP route registration in [convex/http.ts](convex/http.ts).
- Static-site hosting: component registration in [convex/convex.config.ts](convex/convex.config.ts), Next asset resolution in [convex/staticSite.ts](convex/staticSite.ts), and the static upload script in [package.json](package.json).
- Target-aware static export: [scripts/build-static.mjs](scripts/build-static.mjs) bridges the hosting CLI's resolved deployment URL to Next's `NEXT_PUBLIC_CONVEX_URL` before the frontend build.
- Bot lifecycle and inbox provisioning state: [convex/bots.ts](convex/bots.ts), [convex/inboxes.ts](convex/inboxes.ts), [convex/workers/inboxProvisioner.ts](convex/workers/inboxProvisioner.ts).
- Template catalog and deployment: [src/components/templates/templateCatalog.ts](src/components/templates/templateCatalog.ts), [src/components/templates/TemplateDashboard.tsx](src/components/templates/TemplateDashboard.tsx), and [src/app/templates/page.tsx](src/app/templates/page.tsx).
- Agent-created template drafts: structured persistence, validation, and compiled memory in [convex/templateDrafts.ts](convex/templateDrafts.ts) and [convex/lib/templateFramework.ts](convex/lib/templateFramework.ts); the model tool in [convex/tools/createTemplateDraft.ts](convex/tools/createTemplateDraft.ts); review and autosave editing in [src/components/templates/TemplateDraftEditor.tsx](src/components/templates/TemplateDraftEditor.tsx); the chat review button in [src/components/chat/TemplateDraftArtifacts.tsx](src/components/chat/TemplateDraftArtifacts.tsx); the shared decision framework in [shared/templateFramework.ts](shared/templateFramework.ts).
- Prompt submission, receipt, duplicate protection, and queueing: [convex/messages.ts](convex/messages.ts).
- Run state machine: lease, checkpoints, tool barriers, and finalization in [convex/workers/runMutations.ts](convex/workers/runMutations.ts); OpenAI streaming and continuation in [convex/workers/runWorker.ts](convex/workers/runWorker.ts); event normalization in [convex/workers/streamConsumer.ts](convex/workers/streamConsumer.ts); dispatch in [convex/workers/toolExecutor.ts](convex/workers/toolExecutor.ts).
- Tool surface: schemas and validation in [convex/tools/definitions.ts](convex/tools/definitions.ts), dispatch in [convex/tools/registry.ts](convex/tools/registry.ts), contracts in [convex/tools/types.ts](convex/tools/types.ts).
- Firecrawl evidence: source persistence in [convex/sources.ts](convex/sources.ts), durable provider jobs in [convex/firecrawlJobs.ts](convex/firecrawlJobs.ts), polling in [convex/firecrawlJobPoller.ts](convex/firecrawlJobPoller.ts), URL and SSRF guards in [convex/lib/firecrawlClient.ts](convex/lib/firecrawlClient.ts).
- Reports: storage-first publication, Markdown sanitization, and owner-scoped downloads in [convex/reports.ts](convex/reports.ts); PDF rendering in [reportRenderer.ts](reportRenderer.ts).
- Email: outbound graph and delivery status in [convex/emails.ts](convex/emails.ts), provider calls in [convex/workers/emailSender.ts](convex/workers/emailSender.ts), webhook verification and routing in [convex/webhooks.ts](convex/webhooks.ts), inbound reply mapping in [convex/inboundEmailProcessor.ts](convex/inboundEmailProcessor.ts).
- Approved external outreach: draft authorization and thread persistence in [convex/outreach.ts](convex/outreach.ts), provider sending in [convex/workers/outreachSender.ts](convex/workers/outreachSender.ts), and approval UI in [src/components/chat/OutreachDrafts.tsx](src/components/chat/OutreachDrafts.tsx).
- Schedules: lifecycle controls in [convex/schedules.ts](convex/schedules.ts), direct one-URL monitor creation in [convex/siteMonitors.ts](convex/siteMonitors.ts), occurrence claiming and next-occurrence scheduling in [convex/scheduleOccurrenceWorker.ts](convex/scheduleOccurrenceWorker.ts), recurrence math in [convex/lib/recurrence.ts](convex/lib/recurrence.ts), and exact monitor tool enforcement in [convex/firecrawlJobs.ts](convex/firecrawlJobs.ts).
- Uploads: owner-bound claim tokens and validation in [convex/attachments.ts](convex/attachments.ts) and [convex/bots.ts](convex/bots.ts).
- Credentials: encrypted OpenAI key storage in [convex/credentials.ts](convex/credentials.ts) and [convex/lib/crypto.ts](convex/lib/crypto.ts).
- Model policy: catalog and effort validation in [convex/lib/models.ts](convex/lib/models.ts), research protocol composition in [convex/prompts/researchProtocol.ts](convex/prompts/researchProtocol.ts).
- Route protection: [src/components/layout/AuthGuard.tsx](src/components/layout/AuthGuard.tsx) redirects after client auth hydration; Convex functions enforce access independently.
- Chat experience: composition in [src/components/chat/ChatExperience.tsx](src/components/chat/ChatExperience.tsx), submission in [src/components/chat/Composer.tsx](src/components/chat/Composer.tsx), activity and artifacts in [src/components/chat/ActivityFeed.tsx](src/components/chat/ActivityFeed.tsx) and [src/components/chat/RunArtifacts.tsx](src/components/chat/RunArtifacts.tsx).
- Acceptance verification: [docs/demo-checklist.md](docs/demo-checklist.md).

## Folder READMEs

| Folder | README |
| --- | --- |
| Repository root | [README.md](README.md) |
| `shared/` | [shared/README.md](shared/README.md) |
| `docs/` | [docs/README.md](docs/README.md) |
| `tests/` | [tests/README.md](tests/README.md) |
| `convex/` | [convex/README.md](convex/README.md) |
| `convex/lib/` | [convex/lib/README.md](convex/lib/README.md) |
| `convex/prompts/` | [convex/prompts/README.md](convex/prompts/README.md) |
| `convex/tools/` | [convex/tools/README.md](convex/tools/README.md) |
| `convex/tools/firecrawl/` | [convex/tools/firecrawl/README.md](convex/tools/firecrawl/README.md) |
| `convex/workers/` | [convex/workers/README.md](convex/workers/README.md) |
| `src/` | [src/README.md](src/README.md) |
| `src/app/` | [src/app/README.md](src/app/README.md) |
| `src/app/bots/` | [src/app/bots/README.md](src/app/bots/README.md) |
| `src/app/chats/` | [src/app/chats/README.md](src/app/chats/README.md) |
| `src/app/dashboard/` | [src/app/dashboard/README.md](src/app/dashboard/README.md) |
| `src/app/schedules/` | [src/app/schedules/README.md](src/app/schedules/README.md) |
| `src/app/settings/` | [src/app/settings/README.md](src/app/settings/README.md) |
| `src/app/signin/` | [src/app/signin/README.md](src/app/signin/README.md) |
| `src/app/templates/` | [src/app/templates/README.md](src/app/templates/README.md) |
| `src/components/` | [src/components/README.md](src/components/README.md) |
| `src/components/auth/` | [src/components/auth/README.md](src/components/auth/README.md) |
| `src/components/bots/` | [src/components/bots/README.md](src/components/bots/README.md) |
| `src/components/chat/` | [src/components/chat/README.md](src/components/chat/README.md) |
| `src/components/layout/` | [src/components/layout/README.md](src/components/layout/README.md) |
| `src/components/schedules/` | [src/components/schedules/README.md](src/components/schedules/README.md) |
| `src/components/settings/` | [src/components/settings/README.md](src/components/settings/README.md) |
| `src/components/templates/` | [src/components/templates/README.md](src/components/templates/README.md) |
| `src/components/ui/` | [src/components/ui/README.md](src/components/ui/README.md) |
| `src/lib/` | [src/lib/README.md](src/lib/README.md) |
| `scripts/` | [scripts/README.md](scripts/README.md) |

## Key tradeoffs

### Convex source of truth versus provider state

Provider identifiers (OpenAI conversation and response identifiers, Firecrawl job identifiers, AgentMail inbox, thread, and message identifiers) are stored alongside internal ownership references, and every lookup resolves an external identifier to one owned record before data moves. The cost is schema surface and explicit mapping tables; the benefit is that authorization never depends on a provider identifier the client may have seen, and recovery does not depend on provider retention.

### One active run per chat

`chats.activeRunId` points at the single nonterminal run. A second submission while a run is active creates a queued run that a promotion mutation starts when the active run reaches a terminal state. The cost is serialized throughput inside one conversation; the benefit is predictable provider usage, a simple cancel story, and an unambiguous activity feed.

### Response lineage

Runs record the OpenAI response identifier, parent response identifier for tool continuations, conversation identifier, and the last processed stream sequence number. Responses are stored as rows (`openaiResponses`) so a continuation can be traced to the response that requested a tool call. The cost is extra bookkeeping per turn; the benefit is auditable lineage and safe resumption after interruptions.

### Storage-first reports

Report publication stores Markdown and PDF bytes in Convex File Storage with hashes and owner-scoped metadata before any email references them. Provider-internal files are never the only copy. A PDF rendering failure marks the report partial while the Markdown artifact remains available, so completed research is never lost to a rendering problem.

### Backend-owned email replies

Inbound email is accepted only after signature verification, event deduplication, inbox lookup, thread mapping, and sender authorization against the bot's configured recipient. The reply creates a run in the mapped chat, or a new chat when no mapping exists. The cost is a strict pipeline in the webhook; the benefit is that a reply can never reach another user's conversation.

### Sanitized Markdown

Report Markdown is sanitized server-side: HTML tags are stripped, Markdown links and bare URLs are kept only when they match canonical source URLs recorded for the run, and results are length-bounded. The client renders through a sanitizing Markdown renderer with a protocol allowlist. Two layers exist because stored artifacts and rendered chat content have different consumers.

### Owner-bound uploads

Avatar and research uploads use single-use claim tokens created under the authenticated user, validated storage metadata (type and size), and binding to a bot or message before use. Orphaned uploads never become data. The cost is a two-phase upload flow in the client; the benefit is that storage identifiers alone grant nothing.

### Schedule conversation bounding

Each schedule occurrence claims an idempotent occurrence key and creates a fresh run. A compact prior report summary may be included so a run can describe change, but no occurrence continues one unbounded conversation. The cost is less conversational memory across occurrences; the benefit is bounded token use and independent, retryable runs.

### Static route guards are not an authorization boundary

`src/components/layout/AuthGuard.tsx` redirects unauthenticated page navigation and the sign-in page redirects authenticated users after client auth hydration. This static-export-friendly routing exists for experience only. Every Convex function independently derives the authenticated user and verifies ownership, so bypassing or misconfiguring the client guard grants no data access.
