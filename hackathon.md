# Parallex: Convex All Gas Hackathon

> Persistent research bots that keep working after the browser closes, deliver evidence-backed reports by email, and continue the same conversation when the user replies.

Parallex is an entry for the [Convex All Gas Hackathon sponsored by OpenAI, Firecrawl, and AgentMail](https://luma.com/convex-allgas-hackathon). It is a new full-stack application built during the eligible hackathon period with Convex as its complete backend.

## Submission links

| Item | Link |
| --- | --- |
| Live application | **TBD before submission: add the public `convex.site` URL** |
| Video demo | **TBD before submission: add the public video URL, under 3 minutes** |
| Public repository | [github.com/AlphaTechini/parallex](https://github.com/AlphaTechini/parallex) |
| Social post | **TBD before submission: add the X or LinkedIn post URL** |
| Hackathon page | [luma.com/convex-allgas-hackathon](https://luma.com/convex-allgas-hackathon) |
| Submission portal | [vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit](https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit) |

## Executive summary

Research assistants are often tied to a browser tab. A long task can be interrupted by a refresh, the result is trapped inside one chat, and converting the research into a useful report or follow-up workflow is still manual.

Parallex turns research into a durable service instead of a temporary chat session. A user creates a research bot, gives it a mission and private instructions, and submits a research request. Convex persists the request before work starts, runs a recoverable agent state machine in the cloud, streams truthful progress to every connected client, stores a cited Markdown and PDF report, and sends the result from the bot's own AgentMail inbox. The user can close the browser at any point. The run continues, and a reply to the email returns to the original website conversation.

The product is designed for ordinary research work rather than developer tooling. Example uses include:

- comparing products, vendors, pricing, or travel options;
- monitoring a policy, regulation, competitor page, or public website for changes;
- preparing a business case or executive decision brief;
- collecting and synthesizing academic, market, legal, or technical evidence;
- scheduling a recurring brief that arrives by email;
- turning an approved research finding into a controlled external inquiry.

## What was built

### Persistent research bots

Each bot has a name, mission, optional avatar, private memory, report recipient, and optional AgentMail identity. Global instructions apply across a user's bots, while bot memory carries specialized behavior. The exact instruction versions used by each run are recorded so completed work remains explainable after settings change.

Users can create bots manually, deploy one of twenty curated templates, or ask an existing agent to prepare a structured private template draft for review. Templates cover everyday research, shopping, business decisions, academic work, software, AI, hardware, vendor evaluation, and regulatory monitoring.

### Browser-independent research

A submitted prompt is first committed through a Convex mutation. Only then does the interface display its receipt. The browser observes the run through realtime queries but does not own the provider stream, so closing the tab, refreshing, or switching devices does not interrupt the work.

One run is active per chat. Additional prompts enter a visible queue, keeping provider usage predictable and preserving a clear conversation order.

### Evidence-first web investigation

The agent selects from fifteen bounded Firecrawl capabilities rather than sending every request through one generic search endpoint. It can:

- search the public web, academic sources, or developer sources;
- scrape one page or a known batch of pages;
- map a site before selecting relevant pages;
- perform a bounded crawl;
- parse uploaded or public documents;
- extract structured data or media when the request requires it;
- interact with a public page or use a bounded browser session;
- delegate open-ended collection to Firecrawl Agent only when simpler tools do not fit;
- compare a page with its previous version for website monitoring.

Important claims are grounded in fetched source content, not search snippets alone. Sources used by a run are persisted in Convex and become the allowlist for links that may appear in the final report.

### Reports that leave the chat

Deep research can produce both Markdown and PDF artifacts. Parallex stores the Markdown in Convex File Storage first, records its content hash, then renders and stores the PDF. Email delivery cannot reference a report until that report exists in application-owned storage.

The chat keeps the executive summary prominent while offering downloadable artifacts. If PDF rendering fails, the Markdown report remains available. If email fails, the report remains complete and can be resent without repeating the research.

### A real inbox for every research identity

AgentMail is not used as a decorative transactional-email integration. It is a second product interface.

- The backend provisions an AgentMail inbox with collision handling and idempotency.
- Multiple bots may share one of an owner's three available email identities.
- A completed report is sent from the assigned bot identity.
- Delivery events update the UI only after the provider reports them.
- A verified inbound reply is deduplicated and mapped through its provider thread to one owned chat.
- The reply starts a new durable research run, and the answer appears in both email and the website.
- Unknown senders and unknown unthreaded messages cannot enter another user's conversation.

### Scheduled research and website monitoring

The agent can create one-time or recurring research schedules conversationally. Convex scheduled functions claim each occurrence idempotently, create a fresh bounded run, and schedule the next occurrence. Users can pause, resume, or delete schedules.

Parallex also includes direct single-URL website monitors. A monitor has a dedicated locked chat, runs daily or every three days, and may include a specific change rule. Its execution boundary permits only Firecrawl change comparison against the stored canonical URL. No-change checks remain quiet.

### Approval-gated outreach

An agent may prepare a draft with the exact recipient, subject, body, and operating constraints, but it cannot send the first external message. Only an authenticated user approval mutation can authorize that send. Replies on the resulting known thread can continue under the approved constraints.

This keeps human authorization at the real-world side-effect boundary while still allowing useful follow-through.

## Sponsor stack

The four sponsor technologies perform essential product work in the main user journey.

### Convex

Convex is the application platform, not an auxiliary database. It provides:

- the complete typed data model and owner-prefixed indexes;
- authenticated queries and mutations;
- realtime subscriptions for messages, run state, activity, reports, schedules, and email status;
- Node actions for model, Firecrawl, and AgentMail calls;
- durable scheduled functions and watchdog recovery;
- HTTP actions for Convex Auth, AgentMail webhooks, and the static application;
- file storage for avatars, research uploads, Markdown reports, and PDF reports;
- the static-hosting component for the exported Next.js frontend.

The browser only presents and submits state. Convex remains the authorization, persistence, execution, synchronization, scheduling, storage, and hosting boundary.

### OpenAI

OpenAI powers the primary research-agent path through the Responses API:

- background responses allow model work to outlive the browser connection;
- streaming events are consumed in bounded server-side slices;
- saved response identifiers and sequence cursors support recovery;
- strict function schemas let the model select Firecrawl and product capabilities;
- tool results return to the model for evidence-based synthesis;
- the final response produces a concise cited answer and can publish a full report;
- agent-assisted development used the Convex plugin guidance and repository-specific Convex rules.

### Firecrawl

Firecrawl is the evidence layer for the product. Its APIs perform search, extraction, mapping, crawling, parsing, interaction, browsing, media retrieval, structured extraction, open-ended gathering, and page-change comparison. Long-running provider jobs are recorded in Convex and resumed by pollers instead of being tied to a client request.

Every target passes public-URL and DNS checks before a provider call. Returned content is treated as untrusted evidence, normalized, bounded, and linked to source records before the model uses it.

### AgentMail

AgentMail provides persistent inbox identities, report delivery, delivery lifecycle events, and inbound conversation continuation. Provisioning and sends use stable idempotency identities. Svix-signed webhook events are timestamp-checked, deduplicated, mapped to an internal owner and thread, and processed only after sender authorization.

## Convex depth

| Convex capability | How Parallex uses it | Implementation |
| --- | --- | --- |
| Schema and indexes | Owner-scoped records for bots, chats, messages, runs, events, sources, reports, email, schedules, credentials, uploads, templates, and provider mappings | [`convex/schema.ts`](convex/schema.ts) |
| Queries | Reactive, owner-checked views of dashboards, chats, activity, reports, schedules, templates, and settings | [`convex/`](convex/) |
| Mutations | Atomic message acceptance, queueing, ownership checks, state transitions, approvals, and lifecycle controls | [`convex/messages.ts`](convex/messages.ts), [`convex/workers/runMutations.ts`](convex/workers/runMutations.ts) |
| Actions | OpenAI model turns, Firecrawl operations, AgentMail provisioning and delivery, PDF generation | [`convex/workers/`](convex/workers/), [`convex/tools/`](convex/tools/) |
| Realtime sync | Live status, activity, partial output, report state, email state, and cross-device recovery | [`src/components/chat/ChatExperience.tsx`](src/components/chat/ChatExperience.tsx) |
| Authentication | Email and password sessions through Convex Auth, with server-derived identity on every public operation | [`convex/auth.ts`](convex/auth.ts), [`convex/auth.config.ts`](convex/auth.config.ts) |
| Scheduling | Run continuations, watchdogs, provider polling, recurring research, and monitor occurrences | [`convex/schedules.ts`](convex/schedules.ts), [`convex/scheduleOccurrenceWorker.ts`](convex/scheduleOccurrenceWorker.ts) |
| File Storage | Avatars, user research uploads, canonical Markdown reports, and rendered PDFs | [`convex/attachments.ts`](convex/attachments.ts), [`convex/reports.ts`](convex/reports.ts) |
| HTTP actions | Auth routes, verified AgentMail webhooks, clean static routes, and application hosting | [`convex/http.ts`](convex/http.ts), [`convex/webhooks.ts`](convex/webhooks.ts), [`convex/staticSite.ts`](convex/staticSite.ts) |
| Components | Convex static hosting serves the complete frontend from the deployment domain | [`convex/convex.config.ts`](convex/convex.config.ts) |

## Architecture

```text
Browser: Next.js 16 + React 19
  |
  | authenticated mutations and realtime queries
  v
Convex
  |-- database and owner-prefixed indexes
  |-- Convex Auth
  |-- resumable research-run state machine
  |-- tool registry and durable provider jobs
  |-- scheduled functions and watchdog recovery
  |-- File Storage for uploads and reports
  |-- AgentMail webhook HTTP action
  |-- static-hosting component
  |
  |-- OpenAI Responses API
  |-- Firecrawl APIs
  +-- AgentMail inboxes, messages, and webhooks
```

### Durable run model

Convex actions have a finite execution window, so Parallex does not hold one action open for an arbitrarily long model stream. A run advances through short actions and transactional mutations:

1. A mutation stores the message, creates the run, and schedules work.
2. A worker claims a lease and creates or resumes the provider response.
3. The worker consumes a bounded stream slice and checkpoints progress.
4. Requested tools become durable rows with stable idempotency keys.
5. Convex executes the tools only after revalidating run state and ownership.
6. Tool output is persisted before it returns to the model.
7. The worker requeues itself, waits for a provider job, or finalizes the answer.
8. A watchdog can re-drive an abandoned lease without duplicating side effects.

This design costs more explicit state than a browser-owned stream, but it delivers the central product promise: accepted work survives browser closure and recoverable worker interruptions.

### Source of truth

Convex owns the product state. OpenAI response identifiers, Firecrawl job identifiers, AgentMail inbox and thread identifiers, and storage identifiers are metadata associated with internal owner-scoped records. No provider identifier is accepted as proof of authorization.

## Reliability and safety

- Every public function derives the user from Convex Auth and checks ownership of the requested graph.
- Every application table is owner-scoped directly or through an owner-checked parent.
- Model-provider credentials supplied by users are encrypted with AES-256-GCM and never returned to the browser.
- Firecrawl and AgentMail deployment credentials stay in server-side Convex environment variables.
- Provider errors are reduced to safe codes before entering chat-visible state.
- Web targets are checked against private, loopback, and unsafe addresses before Firecrawl calls.
- Model-facing tools never accept a user ID, credential, or authorization decision as an argument.
- Tool output, scraped pages, inbound email, and generated Markdown are treated as untrusted input.
- Report HTML is stripped and links are restricted to source URLs recorded for the run.
- The client independently sanitizes rendered Markdown and restricts URL protocols.
- Uploads use owner-bound, single-use claims and type and size validation.
- Inbox creation, tool execution, report publication, email delivery, and schedule creation are idempotent.
- Partial success is retained. A failed email does not erase a report, and a failed PDF does not erase Markdown.

## Product walkthrough

### Primary research flow

1. Sign up with email and password.
2. Create a bot or select a curated template.
3. Assign an existing email identity or provision a new AgentMail inbox.
4. Save an OpenAI key in Settings. Only encrypted server-side material is persisted.
5. Open the bot chat and ask a real research question.
6. Watch Convex realtime updates show actual Firecrawl operations and run status.
7. Close or refresh the browser while research continues.
8. Return to the same chat and open the completed cited answer.
9. Download the Markdown or PDF report.
10. Confirm that AgentMail delivered the report from the bot's inbox.
11. Reply to the email and see the follow-up appear in the same website conversation.

### Recurring value flow

1. Ask the bot to prepare a recurring brief, or create a one-URL website monitor.
2. Confirm the schedule and timezone in the schedules view.
3. Let Convex claim the occurrence and start a fresh research run.
4. Receive only a meaningful result, with quiet handling for unchanged monitor checks.
5. Pause, resume, or delete the schedule without losing completed reports.

## Suggested video demo

The submission video must stay under three minutes and should click through the real product rather than spend time on slides.

| Time | Demonstration |
| --- | --- |
| 0:00 to 0:20 | State the problem: long web research should not depend on an open browser tab. Show the bot dashboard and available templates. |
| 0:20 to 0:45 | Open a prepared bot, show its mission, memory, and AgentMail address, then submit a practical research request. |
| 0:45 to 1:20 | Show the persisted receipt, realtime activity, and real Firecrawl calls. Refresh or close and reopen the chat to prove browser-independent execution. |
| 1:20 to 1:55 | Open the completed cited summary and download the generated PDF report. Show the corresponding email from the bot inbox. |
| 1:55 to 2:25 | Reply to the email, then show the reply and resulting run in the original website chat. |
| 2:25 to 2:45 | Show a recurring schedule or website monitor and explain that Convex owns every occurrence. |
| 2:45 to 3:00 | Close on the stack: Convex runs it, Firecrawl feeds it evidence, OpenAI reasons over it, and AgentMail gives it a persistent inbox. |

## Judging criteria alignment

| Criterion | Parallex evidence |
| --- | --- |
| Everyday usefulness | Turns open-ended research into a persistent, cited report and email workflow for shopping, business, academic, legal, market, and monitoring tasks. |
| Creativity | Combines a website and a two-way agent inbox into one durable conversation, including scheduled research and page-change monitoring. |
| Convex depth | Uses queries, mutations, realtime subscriptions, actions, auth, scheduler, file storage, HTTP actions, and static-hosting components as one backend. |
| OpenAI contribution | Runs background Responses with function calling, bounded streaming, recovery checkpoints, evidence synthesis, and report generation. |
| Firecrawl contribution | Uses fifteen intent-specific capabilities for real discovery, extraction, parsing, verification, and change detection. |
| AgentMail contribution | Provisions inboxes, sends reports, tracks delivery, verifies inbound events, and continues the originating conversation by email. |
| Live application | **TBD before submission: public `convex.site` URL** |
| Social proof | **TBD before submission: X or LinkedIn post URL tagging Convex, OpenAI, Firecrawl, and AgentMail** |
| Video demo | **TBD before submission: public video URL under 3 minutes** |

## Build log

Repository history records the application being built after the August 25 eligibility date.

### September 19: secure foundation and complete first workflow

- Initialized the Next.js, React, Tailwind, Convex, Convex Auth, and pnpm stack.
- Designed the owner-scoped schema and isolated backend core.
- Implemented the resumable OpenAI run engine with leases, checkpoints, queueing, and watchdog recovery.
- Integrated Firecrawl research, source persistence, report generation, AgentMail delivery, inbound replies, and research schedules.
- Built the complete authenticated research workspace UI.
- Added isolation, idempotency, lifecycle, instruction, upload, routing, and regression tests.
- Hardened response recovery, Firecrawl output bounds, PDF table pagination, email lifecycle state, storage ownership, and live activity behavior.

### September 20: durable execution hardening

- Expanded OpenAI model selection and model-specific reasoning controls.
- Hardened the OpenAI Responses path and provider validation diagnostics.
- Documented the durable research architecture.

### September 21: Convex hosting and integration hardening

- Added the Convex static-hosting component and target-aware Next.js export.
- Preserved clean auth and webhook HTTP routes alongside the static-site fallback.
- Added an Auth key generator and documented production deployment.
- Normalized tool arguments for OpenAI strict schemas.
- Improved chat activity, run persistence, stored-report retries, direct status messages, email failure codes, and provider validation diagnostics.
- Reworked bot detail into focused chat, schedules, and settings views.

### September 22: practical automation and final polish

- Added twenty curated bot templates, shared AgentMail identities, and approval-gated external outreach.
- Added single-URL website monitors with constrained change detection and quiet no-change runs.
- Added agent-created structured template drafts with review, editing, private reuse, and safe deployment.
- Added a collapsible conversation sidebar.
- Hardened AgentMail provisioning, provider idempotency keys, and schedule timezone and epoch handling.
- Simplified the activity surface to show verifiable execution state instead of model reasoning summaries.

## Verification

The repository includes automated coverage for the highest-risk application invariants:

- tenant ownership and cross-account denial;
- side-effect idempotency;
- run, queue, schedule, and report lifecycle transitions;
- immutable instruction versions;
- avatar and upload claims;
- Firecrawl routing and tool contracts;
- integration regressions across model, report, email, and schedule flows.

The available verification commands are:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Provider-backed behavior has a separate manual acceptance plan in [`docs/demo-checklist.md`](docs/demo-checklist.md). It requires checking Convex records and provider results rather than accepting UI copy as proof.

## Hackathon requirement checklist

| Requirement | Status |
| --- | --- |
| New application started on or after August 25 | Met. Repository implementation history begins September 19. |
| Convex is the backend | Met. Database, functions, realtime sync, auth, scheduling, storage, HTTP routes, and hosting use Convex. |
| Built with an agent and the Convex plugin | Met. The repository includes and follows the generated Convex agent guidance. |
| OpenAI, Firecrawl, and AgentMail do real product work | Met. Each sponsor is part of the primary end-to-end workflow. |
| Frontend hosted on `convex.site` or `chatgpt.site` | Implementation complete; **public URL must be added above before submission**. |
| Public GitHub repository | Met: [github.com/AlphaTechini/parallex](https://github.com/AlphaTechini/parallex). |
| Root `hackathon.md` build log | Met by this document. |
| Video demo under 3 minutes | **TBD before submission**. |
| X or LinkedIn post tagging sponsors | **TBD before submission**. |
| Submit before September 22 at 12:00 PM PT | Must be completed through the [official submission portal](https://vibeapps.dev/judging/convex-all-gas-hackathon-openai/submit). |

## Intentional boundaries

The hackathon build deliberately keeps several boundaries visible:

- It is a research product, not a general autonomous agent with unrestricted real-world actions.
- New external outreach always requires explicit approval.
- Public web research cannot access private accounts or internal network addresses.
- AgentMail custom-domain setup is outside the build.
- Reports are Markdown and PDF rather than a broad office-document suite.
- Convex and AgentMail free-plan constraints are accepted for the demonstration.
- OpenAI usage is supplied by the user and encrypted at rest; the project does not claim hackathon-provided OpenAI API credits.

These constraints trade breadth for a safer, more coherent product that can be demonstrated end to end.

## Repository guide

- [`README.md`](README.md): product overview, setup, deployment, security model, and current feature list.
- [`structure.md`](structure.md): folder tree and high-level logic map.
- [`convex/schema.ts`](convex/schema.ts): complete data model and indexes.
- [`convex/workers/runWorker.ts`](convex/workers/runWorker.ts): resumable OpenAI Responses worker.
- [`convex/workers/runMutations.ts`](convex/workers/runMutations.ts): transactional run state machine.
- [`convex/tools/definitions.ts`](convex/tools/definitions.ts): strict model-facing tool contracts.
- [`convex/tools/firecrawl/`](convex/tools/firecrawl/): fifteen narrow Firecrawl capability handlers.
- [`convex/reports.ts`](convex/reports.ts): storage-first reports, sanitization, and authorized downloads.
- [`convex/webhooks.ts`](convex/webhooks.ts): verified AgentMail webhook handling.
- [`convex/schedules.ts`](convex/schedules.ts): schedule lifecycle and durable occurrence setup.
- [`convex/staticSite.ts`](convex/staticSite.ts): static application routing on Convex.
- [`src/components/chat/ChatExperience.tsx`](src/components/chat/ChatExperience.tsx): realtime research conversation UI.
- [`docs/demo-checklist.md`](docs/demo-checklist.md): automated and provider-backed acceptance checks.

## Why this project fits All Gas

The hackathon asks for a real full-stack application where Convex runs the product, Firecrawl feeds it data, AgentMail gives it an inbox, and the sponsor stack performs meaningful work.

Parallex makes those technologies one continuous user experience. Convex accepts and preserves the request, OpenAI decides how to investigate it, Firecrawl retrieves the evidence, Convex turns the execution into durable realtime state and stored artifacts, and AgentMail carries the result into an ongoing conversation outside the app. The result is not a thin hosted frontend or a sponsor checklist. It is a research workflow that a real person can start, leave, receive, reply to, and schedule again.
