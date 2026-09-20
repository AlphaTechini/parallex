# Convex workers

This directory contains the server-side execution layer: OpenAI and Zhipu research workers, shared run state mutations, the OpenAI stream consumer, the tool dispatch action, the AgentMail email sender, and the inbox provisioner. Workers have no browser session; they load owned records, revalidate state, and only then touch provider APIs or secrets.

To find the run state machine mutations (run claiming, leases, checkpoints, tool barriers, response intents, finalization, failure, and queue promotion) visit [runMutations.ts](file:///C:/Hackathons/Parallex/convex/workers/runMutations.ts).

To find the run driver that creates or resumes OpenAI background responses, consumes stream slices, and schedules continuation visit [runWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/runWorker.ts).

To find the Zhipu Chat Completions driver that rebuilds bounded message history, validates finish reasons, executes the full tool loop, and checkpoints complete turns visit [zhipuRunWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/zhipuRunWorker.ts).

To find Zhipu turn intents, transcript loading, completion persistence, and provider-neutral tool barriers visit [zhipuRunMutations.ts](file:///C:/Hackathons/Parallex/convex/workers/zhipuRunMutations.ts).

To find the normalization of OpenAI stream events into a small closed set of event kinds visit [streamConsumer.ts](file:///C:/Hackathons/Parallex/convex/workers/streamConsumer.ts).

To find the action that loads validated tool context and dispatches to the tool registry visit [toolExecutor.ts](file:///C:/Hackathons/Parallex/convex/workers/toolExecutor.ts).

To find outbound email sending with idempotency, attachment loading, acceptance and failure marking, retry, and the email reply path visit [emailSender.ts](file:///C:/Hackathons/Parallex/convex/workers/emailSender.ts).

To find AgentMail inbox provisioning with username collision retry and idempotency visit [inboxProvisioner.ts](file:///C:/Hackathons/Parallex/convex/workers/inboxProvisioner.ts).

The OpenAI Responses API connection can be found in [runWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/runWorker.ts) and [openaiClient.ts](file:///C:/Hackathons/Parallex/convex/lib/openaiClient.ts). The Zhipu Chat Completions connection can be found in [zhipuRunWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/zhipuRunWorker.ts) and [zhipuClient.ts](file:///C:/Hackathons/Parallex/convex/lib/zhipuClient.ts). The AgentMail send and reply connection can be found in [emailSender.ts](file:///C:/Hackathons/Parallex/convex/workers/emailSender.ts) and [agentmailClient.ts](file:///C:/Hackathons/Parallex/convex/lib/agentmailClient.ts). The tool registry connection can be found in [toolExecutor.ts](file:///C:/Hackathons/Parallex/convex/workers/toolExecutor.ts) and [registry.ts](file:///C:/Hackathons/Parallex/convex/tools/registry.ts). The run and chat state connection can be found in [runMutations.ts](file:///C:/Hackathons/Parallex/convex/workers/runMutations.ts).

## Architectural decisions

- The run is a state machine of short Node actions and internal mutations. Stream consumption is sliced well below the action time limit, the last provider sequence number is checkpointed, and a delayed watchdog re-drives stalled runs. This makes runs survive interruptions, but recovery correctness depends on the lease and generation counters being respected at every entry point.
- Every worker entry revalidates the full ownership graph (run, chat, bot, trigger and assistant messages share one owner and consistent references) before doing work. Invalid graphs fail closed with an ownership error instead of proceeding on partial trust.
- Workers never trust provider success prose. Model-side tool calls become durable `toolCalls` rows with idempotency keys, and only structured execution results advance state.
- Tool phases order side effects: discovery and product tools run before report publication, and publication must complete before email. This prevents email referencing a report that does not exist yet.
- The email sender treats provider acceptance as its terminal success state and lets webhooks advance delivery status later, so the run never waits on final delivery.
- Inbox provisioning tries the desired username plus a bounded candidate list, keyed by an idempotency value tied to the internal bot, so retries cannot create duplicate inboxes.
- Failure reporting is sanitized at the boundary: raw provider errors become safe codes and safe messages before storage, keeping secrets and stack detail out of chat-visible state.
- Provider routing is derived from the persisted model and optional provider field. Existing runs without a provider field remain OpenAI-compatible because the model catalog is the migration fallback.
- Zhipu uses non-streaming Chat Completions within the bounded worker action. Each request intent and completed turn is durable, but a network loss after provider completion and before the transaction can repeat model generation. Tool side effects remain idempotent because they begin only after the turn and namespaced call identifiers are stored.
