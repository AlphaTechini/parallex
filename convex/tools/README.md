# Convex tool execution

This directory contains the model-facing tool registry, argument contracts, and provider/product handlers. Tool execution stays behind internal Convex functions so ownership, run liveness, idempotency, and provider credentials are never supplied by the browser.

To find the exact model function schemas and validation logic visit [definitions.ts](file:///C:/Hackathons/Parallex/convex/tools/definitions.ts).

To find the stored-report listing tool that exposes prior chat reports with their email delivery state visit [listStoredReports.ts](file:///C:/Hackathons/Parallex/convex/tools/listStoredReports.ts). To find the stored-report reader that returns bounded markdown content for one report visit [readStoredReport.ts](file:///C:/Hackathons/Parallex/convex/tools/readStoredReport.ts).

To find tool dispatch and handler registration visit [registry.ts](file:///C:/Hackathons/Parallex/convex/tools/registry.ts).

To find the shared executor contract visit [types.ts](file:///C:/Hackathons/Parallex/convex/tools/types.ts).

The model run connection can be found in [toolExecutor.ts](file:///C:/Hackathons/Parallex/convex/workers/toolExecutor.ts), [runWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/runWorker.ts), and [zhipuRunWorker.ts](file:///C:/Hackathons/Parallex/convex/workers/zhipuRunWorker.ts).

## Architectural decisions

- Each capability has one narrow handler instead of one generic provider function.
- Provider results are normalized before they are persisted or returned to the model.
- Side effects revalidate the owning run and tool call immediately before mutation or provider use.
- Stored reports are first-class retry inputs. `list_stored_reports` and `read_stored_report` expose owned prior results with their latest email delivery state, and `send_research_email` accepts a `reportId` so a new run can resend an earlier stored report without recreating it. Each resend uses a fresh idempotency key derived from the current run and report.
- Direct test or status emails use `send_direct_message`, which delivers a short message with no report or attachment and its own idempotency key. The report gate applies only to `send_research_email`, and a stored `reportId` argument satisfies it when the report belongs to the same owner and chat.
- AgentMail rejections persist a sanitized failure code on the email row and run event, so retries are diagnosable without exposing provider detail.
- Chat Completions providers may omit nullable fields even when they receive the OpenAI-strict schema. Validation fills only omitted nullable properties, including nested objects, before applying the same type and bounds checks. For web search, empty domain arrays become absent filters and a non-empty include allowlist takes precedence over a conflicting exclude list.
