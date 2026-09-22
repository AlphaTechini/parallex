# Parallex

Parallex is a web application for persistent research bots. A bot investigates the web with Firecrawl, keeps working in the cloud after the browser tab closes, produces a polished Markdown and PDF report, emails the result from its own AgentMail inbox, and continues the same conversation when the owner replies by email.

The product promise is that a long research task is independent of the browser. Once the server accepts a prompt, the user can close the tab, switch devices, and return later without stopping or losing the run.

## Product value

- Durable research identity: every bot has a name, mission, private memory, a report recipient, and, when email is enabled, a dedicated email address.
- Cloud-persistent execution: research runs are server-controlled state machines, not browser-owned streaming connections.
- Evidence-first answers: the agent searches, scrapes, maps, crawls, parses, and compares sources through bounded Firecrawl tools, then writes a cited professional summary.
- Real deliverables: reports are stored in Convex File Storage before any email references them, and downloads are owner-scoped.
- Two-way email: replies from the authorized recipient re-enter the original website conversation through a verified webhook.
- Scheduled research: recurring and one-time research is created conversationally and executed by the backend scheduler.

## Features

- Email and password authentication through Convex Auth.
- An initially empty bot dashboard with direct paths to manual creation or twenty curated templates.
- Bot creation with name, mission (500 character limit), per-bot memory, recipient email, shared email identity selection, and optional uploaded avatar or deterministic default avatar.
- Automatic AgentMail inbox provisioning with idempotent, retryable state. Accounts may create unlimited bots that share up to three distinct email addresses.
- A protected template catalog for everyday, shopping, software, AI, and hardware workflows, including review-first deployment and optional first-run schedules.
- Global custom instructions and per-bot custom instructions, versioned per run.
- Four supported OpenAI models: GPT-5.6 Luna, GPT-5.6 Terra, GPT-5.6 Sol, and GPT-6 Astra, each with model-appropriate reasoning effort levels.
- One active run per chat with visible queueing for follow-up requests.
- Fifteen Firecrawl research tools plus chat title generation, report publication, email delivery, schedule introspection and creation, and approval-gated outreach drafts.
- Live research activity, reasoning summaries where supported, report status, and truthful email status in the chat UI.
- Markdown and PDF report artifacts with sanitized Markdown, allowed-URL citation enforcement, and a layout-versioned PDF renderer.
- Inbound email replies mapped back to the originating chat through provider thread identifiers.
- External merchant outreach with a visible recipient, subject, body, and constraint draft that requires authenticated user approval before the first send.
- Recurring and one-time schedules with pause, resume, and delete lifecycle controls.
- Per-bot website monitors for one exact public URL, with daily or every-three-days checks, optional change rules, and quiet no-change runs.
- Strict per-user isolation of bots, chats, messages, runs, sources, artifacts, schedules, and email records.

## Architecture

Parallex is a statically exported Next.js 16 App Router frontend backed and hosted by Convex. Convex is the database, realtime subscription layer, authentication provider, action runtime, durable scheduler, file store, and static-site host. No additional backend service is required.

```
Browser (React 19, Next 16)
  |  Convex realtime queries and mutations
  v
Convex backend
  |-- Public queries and mutations (owner-checked)
  |-- Run worker state machine (Node actions, short slices)
  |-- Tool registry and handlers (Firecrawl, reports, email, schedules)
  |-- Job pollers and durable scheduled functions
  |-- HTTP actions (Convex Auth routes, AgentMail webhook, static site)
  |-- File Storage (avatars, reports, research uploads)
  |
  +--> OpenAI Responses API (background responses, streaming)
  +--> Firecrawl v2 (search, scrape, map, crawl, parse, interact, browser, agent)
  +--> AgentMail (inboxes, outbound email, inbound webhooks)
```

The full folder tree, logic map, and links to every folder README are in [structure.md](structure.md).

### Key design decisions and tradeoffs

- Convex is the source of truth, not provider state. OpenAI conversation identifiers, Firecrawl job identifiers, and AgentMail thread identifiers are stored with internal ownership context and never treated as authorization. The cost is deliberate duplication of display state; the benefit is recovery, audit, and owner-scoped access that survives provider retention limits.
- One active run per chat. A chat holds a single active run reference and follow-up submissions queue. This keeps provider spend predictable and the UI honest, at the cost of throughput within a single conversation.
- The run is a resumable state machine. Short stream slices stay under the Convex action time limit, a lease plus generation counter prevents split-brain workers, and a delayed watchdog resumes stalled runs. The tradeoff is more moving parts than one long-lived action, in exchange for runs that survive interruptions and browser closure.
- User prompts show `✓✓` only after the server transaction has stored the message, created its run, and scheduled background handling. Research activity stays attached to that prompt and updates independently of the browser tab.
- Reports are storage-first. Markdown and PDF bytes are stored in Convex File Storage with content hashes before email can reference them. A PDF rendering failure downgrades the report to partial instead of failing completed research.
- Email replies are backend-owned. The webhook verifies the provider signature, deduplicates events, maps the provider thread to an internal chat, and checks the authorized sender before starting a run.
- Report Markdown is sanitized on the server. HTML tags are stripped and links or bare URLs are rewritten or removed unless they match canonical source URLs recorded for the run. The client additionally renders Markdown through a sanitizing renderer.
- Uploads are owner-bound through single-use claim tokens. Files are validated by type and size before an attachment record exists, and attachments bind to a message and run at submission time.
- Schedule conversation bounding. Each schedule occurrence creates a fresh run with optional compact prior context instead of one unbounded conversation.
- Website monitors use a dedicated locked chat and a canonical target URL. Their tool boundary permits only provider page-change comparison on that URL, preventing discovery, crawls, and cross-site fetches during a monitor run.
- Shared email identity routing. Several bots may send from one AgentMail inbox, while provider thread records route every known reply back to one originating bot and chat. Unknown unthreaded inbound messages are ignored without a model call.
- Outreach approval is transactional. The model may prepare a draft but cannot send it; only the authenticated approval mutation schedules the first external email. Approved thread constraints are copied into a private per-run instruction snapshot for autonomous replies.
- OpenAI durability. Runs use background Responses with stream cursor recovery, allowing a delayed watchdog to resume work after an interruption without depending on the browser.
- Tool normalization. OpenAI-strict schemas keep nullable optional fields explicit. Empty domain filters are treated as absent; when both non-empty include and exclude filters arrive, the narrower include allowlist wins.
- The static export uses a client-side auth guard rather than a Next.js request proxy. This allows the frontend to live on Convex storage; every Convex function still derives the authenticated user independently and verifies record ownership.
- Static hosting keeps existing auth and webhook paths at the deployment root. A small adapter maps Next's `route/index.html` export layout to clean route URLs before the static-hosting component applies its SPA fallback.

## Security model

- Secrets are deployment or server-side values only. User OpenAI keys are encrypted with AES-256-GCM before storage and decrypted only inside authorized server execution. Only a non-secret display hint is ever returned to the client.
- Every public query and mutation derives the current user from Convex Auth, loads the requested record, and verifies its stored owner before returning data or performing side effects. External identifiers never replace the ownership check.
- Provider webhooks are authorized by Svix signature verification with a timestamp tolerance window, then deduplicated by provider event identifier, then mapped through provider identifiers to one owned record.
- Scheduled workers have no inherited user session. They receive internal identifiers only and revalidate the user, bot, schedule, and credential state before using secrets or sending email.
- Model-facing functions use strict schemas, reject unknown fields, and never accept owner identifiers or credentials as model-controlled arguments. Tool outputs are treated as untrusted evidence.
- Web content, email bodies, and attachment contents are untrusted data. Server-side sanitization constrains report links to recorded sources, and the client renders Markdown through sanitization with a safe URL transform.
- Firecrawl targets are validated as public URLs, including DNS resolution checks against private and loopback ranges, before provider calls. Browser interaction tools accept bounded public goals, never arbitrary code, and never sign into private accounts.
- Provider errors are reduced to safe error categories before display. Activity events store safe summaries only.

## Prerequisites

- Node.js (current LTS) and pnpm as the package manager.
- A Convex account and the Convex CLI (installed as a dev dependency and run through pnpm scripts).
- An OpenAI API key supplied per user inside the product; the app does not ship model-provider credentials.
- A Firecrawl API key for the deployment.
- An AgentMail API key and webhook signing secret for the deployment.

## Setup

From the repository root:

```sh
pnpm install
```

Provision the Convex development deployment and generate the client configuration:

```sh
pnpm convex:dev
```

The first provisioning run generates the deployment name and client URL values referenced by the environment variables below. The app intentionally renders a configuration state until `NEXT_PUBLIC_CONVEX_URL` is present, so `pnpm build` works before Convex exists.

Create a `.env.local` file using `.env.example` as the schema reference, then set deployment-scoped secrets on the Convex deployment with `pnpm exec convex env set` or the Convex dashboard.

Run the app and the Convex dev process together during development:

```sh
pnpm dev
pnpm convex:dev
```

Publish a smoke-test build to the selected Convex development deployment:

```sh
pnpm deploy:static
```

The site is served at `https://<deployment>.convex.site`. The uploaded static build uses the Convex deployment URL already present in `.env.local`.

Sign up with email and password, add an OpenAI API key in Settings, then create the first bot.

## Environment variables

Variable names only, matching `.env.example`. Values are never committed.

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Next.js client | URL of the Convex deployment used by the browser client and auth provider setup. |
| `CONVEX_DEPLOYMENT` | Convex CLI | Deployment name selected by the local Convex CLI tooling. |
| `JWT_PRIVATE_KEY` | Convex server | RS256 private signing key for Convex Auth. Generate it together with `JWKS` using `node scripts/generate-auth-keys.mjs`; never expose it. |
| `JWKS` | Convex server | Public JSON Web Key Set matching `JWT_PRIVATE_KEY`, used to verify Convex Auth tokens. |
| `FIRECRAWL_API_KEY` | Convex server | Server-side credential for all Firecrawl provider calls. |
| `AGENTMAIL_API_KEY` | Convex server | Server-side credential for inbox provisioning and email send or reply. |
| `AGENTMAIL_WEBHOOK_SECRET` | Convex server | Svix signing secret used to verify inbound webhook signatures. |
| `OPENAI_KEY_ENCRYPTION_SECRET` | Convex server | Base64-encoded 32 byte key for AES-256-GCM encryption of user-supplied OpenAI keys. |
| `CONVEX_SITE_URL` | Convex server | Convex HTTP actions URL used as the Convex Auth provider domain. |

## AgentMail webhook route

Inbound email and delivery events arrive at a Convex HTTP action:

```
POST https://<deployment>.convex.site/agentmail/webhook
```

Route registration is in [convex/http.ts](convex/http.ts) and the handler is in [convex/webhooks.ts](convex/webhooks.ts). The handler enforces a request body size cap, verifies the Svix signature against `AGENTMAIL_WEBHOOK_SECRET` with a timestamp tolerance, deduplicates events by provider event identifier, routes `message.received` to inbound processing, and routes delivery lifecycle events to email status updates. Register this URL in the AgentMail dashboard for the deployment.

## Scripts

| Script | Command | Description |
| --- | --- | --- |
| Dev server | `pnpm dev` | Starts the Next.js development server. |
| Production build | `pnpm build` | Builds the Next.js app; works before Convex provisioning. |
| Lint | `pnpm lint` | Runs ESLint with the Next.js TypeScript configuration. |
| Type check | `pnpm typecheck` | Runs `tsc --noEmit` across the project. |
| Tests | `pnpm test` | Runs Vitest in run mode. |
| Convex dev | `pnpm convex:dev` | Syncs Convex functions and connects to a deployment. |
| Convex dashboard | `pnpm convex:dashboard` | Opens the Convex dashboard for the selected deployment. |
| Target-aware static build | `pnpm build:static` | Builds `out/` using the hosting CLI's target URL, or the current `NEXT_PUBLIC_CONVEX_URL` outside that CLI. |
| Static-site smoke test | `pnpm deploy:static` | Builds `out/` and uploads it to the selected Convex development deployment. |
| Production static deploy | `pnpm deploy:static:prod` | Atomically deploys Convex backend code and a static build to the production deployment. |

## Testing

`pnpm test` runs the committed Vitest and `convex-test` suite. Coverage includes tenant ownership, idempotency, run and schedule state transitions, immutable instruction versions, avatar and upload rules, Firecrawl routing contracts, and integration-review regressions. Provider-backed behavior that cannot be proven in the local test runtime remains listed as a manual check in [docs/demo-checklist.md](docs/demo-checklist.md).

## Deployment

- Convex: run `pnpm exec convex deploy` (or promote through the dashboard) to push functions to a production deployment. Set the server-scoped environment variables from the table above on the deployment, including the webhook secret and encryption key.
- Static site: run `pnpm deploy:static:prod`. The static-hosting CLI resolves the production deployment first, then [build-static.mjs](scripts/build-static.mjs) maps that URL into Next's `NEXT_PUBLIC_CONVEX_URL` before the upload. `pnpm deploy:static` is the equivalent smoke-test command for the selected dev deployment.
- Provider configuration: register the production `https://<deployment>.convex.site/agentmail/webhook` URL with AgentMail, and confirm Firecrawl and AgentMail deployment keys are set.
- Client navigation redirects unauthenticated visitors after auth state resolves. Convex functions remain the authorization boundary for all data and side effects.

## Current MVP boundaries

The current build intentionally excludes the following, and these exclusions are product decisions rather than gaps:

- Google sign-in, email OTP sign-in, and mandatory email verification.
- AgentMail custom domain verification and any DNS editor.
- More than three distinct AgentMail inboxes per account. Bot count itself is not limited.
- Unapproved outreach, contact harvesting, bulk messaging, or messaging channels beyond the product and email surfaces.
- Manual schedule creation or freeform schedule editing; schedules are created conversationally and managed only through pause, resume, and delete.
- DOCX and spreadsheet report formats; reports are Markdown and PDF.
- Raw model chain-of-thought display; only provider reasoning summaries, when supported, are shown.
- A separate transactional email provider; AgentMail is the single email surface.
- Public or user-authored template publishing, a bot marketplace, and per-user model spend management.

Free-plan constraints on Convex (file storage, database bandwidth, action duration) and AgentMail (inbox count) are accepted engineering constraints for this stage.

## Documentation map

- [structure.md](structure.md): folder tree, high-level logic map, and links to every folder README.
- [docs/README.md](docs/README.md): documentation index and writing conventions.
- [docs/demo-checklist.md](docs/demo-checklist.md): acceptance checklist mapping each product family to an automated command or a manual provider-backed check.
- [llm.txt](llm.txt): curated official documentation references for every integrated technology.
