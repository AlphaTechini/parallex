# Convex workers

This directory contains the server-side execution layer: the OpenAI research worker, shared run state mutations, the OpenAI stream consumer, the tool dispatch action, the AgentMail email sender, and the inbox provisioner. Workers have no browser session; they load owned records, revalidate state, and only then touch provider APIs or secrets.

To find the run state machine mutations (run claiming, leases, checkpoints, tool barriers, response intents, finalization, failure, and queue promotion) visit [runMutations.ts](file:///C:/Hackathons/Parallex/convex/workers/runMutations.ts).

To find the run driver that creates or resumes OpenAI background responses, consumes stream slices, and schedules continuation visit [runWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/runWorker.ts).

To find the normalization of OpenAI stream events into a small closed set of event kinds visit [streamConsumer.ts](file:///C:/Hackathons/Parallex/convex/workers/streamConsumer.ts).

To find the action that loads validated tool context and dispatches to the tool registry visit [toolExecutor.ts](file:///C:/Hackathons/Parallex/convex/workers/toolExecutor.ts).

To find outbound email sending with idempotency, attachment loading, acceptance and failure marking, retry, and the email reply path visit [emailSender.ts](file:///C:/Hackathons/Parallex/convex/workers/emailSender.ts).

To find the provider action that sends only authenticated, approved outreach drafts and records their provider thread visit [outreachSender.ts](file:///C:/Hackathons/Parallex/convex/workers/outreachSender.ts).

To find AgentMail inbox provisioning with username collision retry and idempotency visit [inboxProvisioner.ts](file:///C:/Hackathons/Parallex/convex/workers/inboxProvisioner.ts).

The OpenAI Responses API connection can be found in [runWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/runWorker.ts) and [openaiClient.ts](file:///C:/Hackathons/Parallex/convex/lib/openaiClient.ts). The AgentMail send and reply connection can be found in [emailSender.ts](file:///C:/Hackathons/Parallex/convex/workers/emailSender.ts) and [agentmailClient.ts](file:///C:/Hackathons/Parallex/convex/lib/agentmailClient.ts). The tool registry connection can be found in [toolExecutor.ts](file:///C:/Hackathons/Parallex/convex/workers/toolExecutor.ts) and [registry.ts](file:///C:/Hackathons/Parallex/convex/tools/registry.ts). The run and chat state connection can be found in [runMutations.ts](file:///C:/Hackathons/Parallex/convex/workers/runMutations.ts).

## Architectural decisions

- The run is a state machine of short Node actions and internal mutations. Stream consumption is sliced well below the action time limit, the last provider sequence number is checkpointed, and a delayed watchdog re-drives stalled runs. This makes runs survive interruptions, but recovery correctness depends on the lease and generation counters being respected at every entry point.
- Every worker entry revalidates the full ownership graph (run, chat, bot, trigger and assistant messages share one owner and consistent references) before doing work. Invalid graphs fail closed with an ownership error instead of proceeding on partial trust.
- Workers never trust provider success prose. Model-side tool calls become durable `toolCalls` rows with idempotency keys, and only structured execution results advance state.
- Tool phases order side effects: discovery and product tools run before report publication, and publication must complete before email. This prevents email referencing a report that does not exist yet.
- The email sender treats provider acceptance as its terminal success state and lets webhooks advance delivery status later, so the run never waits on final delivery.
- The outreach sender cannot create or approve a draft. It accepts only a persisted draft already moved to `sending` by the authenticated approval mutation, then binds the provider thread to the originating bot and chat.
- Inbox provisioning tries readable numbered usernames before a deterministic bot-ID suffix, recognizes AgentMail's structured collision errors, and verifies the returned address before activation. The create request remains keyed to the internal bot, so retries cannot create duplicate inboxes.
- Internal email idempotency identities remain stable database keys. The sender hashes them into AgentMail's documented header character set at the provider boundary, which keeps old failed rows retryable without changing internal record identity.
- Failure reporting is sanitized at the boundary: raw provider errors become safe codes and safe messages before storage, keeping secrets and stack detail out of chat-visible state.
- Provider routing is derived from the persisted OpenAI model and optional provider field. Existing runs without a provider field remain compatible because the model catalog is the migration fallback.
