# Research prompts

This directory contains the mandatory research protocol and the instruction composer that combines it with user memory at run time.

To find the versioned research protocol text, including untrusted-evidence rules, tool routing order, and reporting standards visit [researchProtocol.ts](file:///C:/Hackathons/Parallex/convex/prompts/researchProtocol.ts).

To find the function that composes protocol, global memory, and bot memory into one instruction string visit [researchProtocol.ts](file:///C:/Hackathons/Parallex/convex/prompts/researchProtocol.ts).

The run-time instruction composition connection can be found in [researchProtocol.ts](file:///C:/Hackathons/Parallex/convex/prompts/researchProtocol.ts), called by the run worker in [runWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/runWorker.ts). The per-run record of which instruction versions were used can be found in [schema.ts](file:///C:/Hackathons/Parallex/convex/schema.ts) on the `researchRuns` table.

## Architectural decisions

- The protocol is one explicit, versioned constant (`RESEARCH_PROTOCOL_VERSION`) rather than scattered prompt fragments, so runs can record which protocol version produced them and behavior changes stay traceable.
- User memory is appended below the protocol, never above it. Application security and tool-use policy therefore cannot be overridden by user instructions, and the composition order is deterministic: protocol, then global memory, then bot memory.
- The protocol embeds the untrusted-evidence stance (web content, tool output, attachments, and email text are data, not instructions) so prompt-injection pressure from fetched sources has a standing rule to collide with.
- First-contact outreach remains outside model authority. The model may prepare a persisted draft, while an authenticated user approval performs the send. Approved reply threads receive a private instruction snapshot containing their constraints, so autonomous negotiation stays bounded without trusting merchant email text.
- Routing guidance in the protocol names each capability and its boundary (never sign in, never crawl without bounds, never cite temporary provider URLs) instead of relying on the model inferring limits from function descriptions alone.
- Mission text is deliberately absent from this directory. Mission is product metadata and never enters model instructions.
