# Shared backend helpers

This directory contains small, dependency-light helpers used across Convex functions: authentication guards, cryptography, provider clients, model policy, normalization, and formatting utilities. Nothing here owns product state; helpers are called from the functions that do.

To find the authentication guard and the owner-verification helpers used by every public function visit [authHelpers.ts](file:///C:/Hackathons/Parallex/convex/lib/authHelpers.ts).

To find AES-256-GCM encryption and decryption of user-supplied model-provider keys visit [crypto.ts](file:///C:/Hackathons/Parallex/convex/lib/crypto.ts). The deployment secret it derives from is `OPENAI_KEY_ENCRYPTION_SECRET`; that existing name is retained for deployment compatibility.

To find the OpenAI Responses API client factory visit [openaiClient.ts](file:///C:/Hackathons/Parallex/convex/lib/openaiClient.ts).

To find the Zhipu Coding Plan Chat Completions client factory and HTTPS endpoint validation visit [zhipuClient.ts](file:///C:/Hackathons/Parallex/convex/lib/zhipuClient.ts).

To find the Firecrawl client factory, public URL and SSRF checks, provider format and timeout clamps, and safe provider error mapping visit [firecrawlClient.ts](file:///C:/Hackathons/Parallex/convex/lib/firecrawlClient.ts).

To find the AgentMail client factory, provider-safe idempotency key hashing, inbox creation, outbound send with attachment, and thread reply helpers visit [agentmailClient.ts](file:///C:/Hackathons/Parallex/convex/lib/agentmailClient.ts).

To find the supported model catalog and reasoning effort validation visit [models.ts](file:///C:/Hackathons/Parallex/convex/lib/models.ts).

To find provider-aware encrypted credential lookup visit [providerCredentials.ts](file:///C:/Hackathons/Parallex/convex/lib/providerCredentials.ts). To find provider-aware worker dispatch visit [runScheduling.ts](file:///C:/Hackathons/Parallex/convex/lib/runScheduling.ts).

To find shared run ownership loading and provider-neutral tool-call persistence visit [runGraph.ts](file:///C:/Hackathons/Parallex/convex/lib/runGraph.ts) and [toolCallPersistence.ts](file:///C:/Hackathons/Parallex/convex/lib/toolCallPersistence.ts).

To find email normalization, bot username derivation, URL canonicalization, hashing, idempotency key construction, and error code sanitization visit [normalize.ts](file:///C:/Hackathons/Parallex/convex/lib/normalize.ts).

To find recurrence normalization, timezone validation, and next-occurrence calculation visit [recurrence.ts](file:///C:/Hackathons/Parallex/convex/lib/recurrence.ts).

To find the mapping from internal run statuses to the smaller product-visible stage set visit [stageMap.ts](file:///C:/Hackathons/Parallex/convex/lib/stageMap.ts).

The OpenAI provider connection can be found in [openaiClient.ts](file:///C:/Hackathons/Parallex/convex/lib/openaiClient.ts). The Zhipu provider connection can be found in [zhipuClient.ts](file:///C:/Hackathons/Parallex/convex/lib/zhipuClient.ts). The Firecrawl provider connection can be found in [firecrawlClient.ts](file:///C:/Hackathons/Parallex/convex/lib/firecrawlClient.ts). The AgentMail provider connection can be found in [agentmailClient.ts](file:///C:/Hackathons/Parallex/convex/lib/agentmailClient.ts). The database ownership check connection can be found in [authHelpers.ts](file:///C:/Hackathons/Parallex/convex/lib/authHelpers.ts).

## Architectural decisions

- Ownership checking is centralized in `requireOwned*` helpers so every public function reads the record and compares `ownerId` in one consistent way. Repetition at call sites is accepted in exchange for a greppable, auditable authorization pattern.
- Provider client factories throw configuration errors at call time instead of module import time, so a missing deployment key never breaks function registration and errors surface where they are sanitized.
- URL canonicalization and hashing live beside the idempotency key builders because deduplication depends on exact canonical forms; ad hoc string comparison is never used for identity decisions.
- Error sanitization converts provider failures into a small closed set of categories before anything reaches the UI, keeping stack traces, provider payloads, and infrastructure details out of chat state.
- Recurrence math is a pure function of recurrence data, timezone, and a timestamp, which keeps schedule occurrence calculation testable and free of database access.
