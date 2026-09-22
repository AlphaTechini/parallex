# Convex tool execution

This directory contains the model-facing tool registry, argument contracts, and provider/product handlers. Tool execution stays behind internal Convex functions so ownership, run liveness, idempotency, and provider credentials are never supplied by the browser.

To find the exact model function schemas and validation logic visit [definitions.ts](file:///C:/Hackathons/Parallex/convex/tools/definitions.ts).

To find the stored-report listing tool that exposes prior chat reports with their email delivery state visit [listStoredReports.ts](file:///C:/Hackathons/Parallex/convex/tools/listStoredReports.ts). To find the stored-report reader that returns bounded markdown content for one report visit [readStoredReport.ts](file:///C:/Hackathons/Parallex/convex/tools/readStoredReport.ts).

To find the owner-scoped schedule introspection used by first-run template automation visit [listResearchSchedules.ts](file:///C:/Hackathons/Parallex/convex/tools/listResearchSchedules.ts). Schedule creation and bot-level duplicate protection can be found in [createResearchSchedule.ts](file:///C:/Hackathons/Parallex/convex/tools/createResearchSchedule.ts).

To find the model capability that persists a complete external outreach draft without sending it visit [prepareOutreachDraft.ts](file:///C:/Hackathons/Parallex/convex/tools/prepareOutreachDraft.ts). Authenticated approval and provider-thread binding can be found in [outreach.ts](file:///C:/Hackathons/Parallex/convex/outreach.ts).

To find tool dispatch and handler registration visit [registry.ts](file:///C:/Hackathons/Parallex/convex/tools/registry.ts).

To find the shared executor contract visit [types.ts](file:///C:/Hackathons/Parallex/convex/tools/types.ts).

The model run connection can be found in [toolExecutor.ts](file:///C:/Hackathons/Parallex/convex/workers/toolExecutor.ts) and [runWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/runWorker.ts).

## Architectural decisions

- Each capability has one narrow handler instead of one generic provider function.
- Provider results are normalized before they are persisted or returned to the model.
- Side effects revalidate the owning run and tool call immediately before mutation or provider use.
- Stored reports are first-class retry inputs. `list_stored_reports` and `read_stored_report` expose owned prior results with their latest email delivery state, and `send_research_email` accepts a `reportId` so a new run can resend an earlier stored report without recreating it. Each resend uses a fresh idempotency key derived from the current run and report.
- Direct test or status emails use `send_direct_message`, which delivers a short message with no report or attachment and its own idempotency key. The report gate applies only to `send_research_email`, and a stored `reportId` argument satisfies it when the report belongs to the same owner and chat.
- AgentMail rejections persist a sanitized failure code on the email row and run event, so retries are diagnosable without exposing provider detail.
- Template automation lists current bot schedules before creation. Creation also checks stable semantic reasons and equivalent recurrence definitions across prior runs, so provider retries or repeated first-run instructions cannot duplicate automation.
- Schedule creation requires an IANA timezone. The model contract resolves regional names directly and fixed GMT or UTC offsets to the reversed-sign `Etc/GMT` form before tool execution, so user-friendly input such as `GMT+1` becomes `Etc/GMT-1`.
- Schedule start times are Unix epoch milliseconds. The tool schema enforces a 13-digit minimum, the executor canonicalizes stray second-based epochs before mutation, and a stale or second-based timestamp surfaces as an explicit `schedule_not_future` failure instead of the generic safety message.
- `prepare_outreach_draft` deliberately has no send path. It creates reviewable data tied to the current owner, run, bot, chat, and inbox; the browser approval mutation is the only first-contact authorization boundary.
- Validation fills only omitted nullable properties, including nested objects, before applying the same type and bounds checks. For web search, empty domain arrays become absent filters and a non-empty include allowlist takes precedence over a conflicting exclude list.
