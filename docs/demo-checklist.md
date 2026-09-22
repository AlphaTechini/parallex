# Demo and acceptance checklist

This checklist maps each product acceptance family to either an automated command or a manual, provider-backed check. It is intended for use against a fully configured deployment: Convex provisioned, all environment variables set, an OpenAI key saved in Settings, and Firecrawl plus AgentMail keys active. No check may be considered passing until the backing provider or database state confirms it, not just the UI text.

Automated commands available in this repository:

| Command | Verifies |
| --- | --- |
| `pnpm lint` | ESLint passes with the Next.js TypeScript configuration. |
| `pnpm typecheck` | The whole project type checks with `tsc --noEmit`. |
| `pnpm build` | The static production export completes. |
| `pnpm deploy:static` | Builds against the selected Convex dev deployment and publishes static assets to its `.convex.site` URL. |
| `pnpm test` | Runs the committed ownership, idempotency, state, instruction, upload, routing, and integration-regression suites with `convex-test` provider boundaries. |

The Convex dashboard is the backing-state inspector for the manual checks: confirm the actual rows (`bots`, `researchRuns`, `researchSources`, `reports`, `reportArtifacts`, `emailMessages`, `webhookEvents`, `researchSchedules`, `scheduleOccurrences`) rather than trusting screen copy.

## 1. Authentication

Acceptance family: email and password sign-up and sign-in work with no external auth prerequisites; unauthenticated callers cannot touch product data.

| Check | Method |
| --- | --- |
| A new account can sign up and sign in with email and password. | Manual: sign up from `/signin`, expect redirect to `/dashboard`, confirm the `users` and `authTables` rows exist in the Convex dashboard. Requires no Google Cloud credentials, no OTP mailer, and no email verification step. |
| Unauthenticated access is blocked. | Manual plus automated: `pnpm build` confirms the static export compiles; then sign out and open `/dashboard`, `/schedules`, and `/settings`, expecting the client guard to redirect to `/signin`. In a scratch browser, attempt `api.bots.listBots` from the Convex dashboard function runner without a session and expect `UNAUTHENTICATED`. |
| Static route behavior is correct. | Manual plus HTTP check: run `pnpm deploy:static`, open `/signin`, confirm the form renders, and confirm a nonexistent path returns the exported 404 page. Open a prior `/bots/<id>` or `/chats/<id>` link and confirm its permanent redirect preserves the identifier as `botId` or `chatId`. |
| Sign-out returns to the sign-in page and stays signed out. | Manual: use the header control, then reload `/dashboard`. |

## 2. Empty dashboard

Acceptance family: a new account starts with an empty bot dashboard and a direct create action.

| Check | Method |
| --- | --- |
| A brand-new account sees the empty state, not a default bot. | Manual: create a fresh account and confirm the dashboard shows the empty state with a single create call to action, and that no `bots` rows exist for the new owner in the Convex dashboard. |
| Creating the first bot navigates to a populated dashboard. | Manual: create one bot and confirm the card grid replaces the empty state. |

## 3. Bot creation and inbox provisioning

Acceptance family: bot input rules, mission semantics, avatar rules, the three-inbox demo cap, and recoverable AgentMail provisioning.

| Check | Method |
| --- | --- |
| A mission over 500 characters is rejected. | Manual: attempt creation with a 501-character mission, expect the inline error; confirm no `bots` row was written. |
| Mission is display metadata, never a model instruction. | Manual plus inspection: set a mission containing a distinctive instruction-like phrase, run research, then confirm the phrase appears in neither the run's stored instruction version rows nor the provider request payload visible in run records. |
| Global and bot memory reach the model in the defined order, per-run versioned. | Manual plus inspection: set distinct global and bot memory markers in Settings and bot detail, start a run, and confirm the run row references the current global and bot instruction version identifiers. |
| Default avatar colors follow the seven-color loop per user. | Manual: create seven bots without uploads on one account and confirm the palette order repeats from the first color on bot eight. |
| An uploaded avatar survives logout and another-device sign-in. | Manual: upload an avatar, sign out, sign in on a second browser profile, and confirm the image resolves from Convex storage. |
| The bot shows the provider-confirmed address only after provisioning. | Manual: watch the bot card and detail page while provisioning; the address must appear only after the inbox row is `active` with a confirmed address. |
| At most three email-enabled bots can be created. | Manual: attempt a fourth email-enabled bot, expect the limit error; confirm the count of `provisioning` plus `active` bots never exceeds three. |
| Provisioning is recoverable and idempotent. | Manual (forced failure): revoke the AgentMail key or use an invalid key, create a bot, confirm the bot row survives with a retryable provisioning state, restore the key, use the retry action on the bot, and confirm exactly one inbox row advances to `active` with one provider inbox identifier. |
| Address collision handling. | Manual: create two bots with the same name and confirm the second receives a suffixed confirmed address and both inbox rows stay distinct. |

## 4. Model key setup

Acceptance family: the user-supplied OpenAI key gates model access and is never exposed.

| Check | Method |
| --- | --- |
| Research is blocked until a key exists. | Manual: on an account without a key, confirm the composer shows the settings notice instead of the input, and that direct submission is rejected server-side. |
| Only a non-secret hint is visible after saving. | Manual: save the OpenAI key, confirm Settings shows the configured state and short display hint, and that no query response contains the full key. Inspect `openaiCredentials` for ciphertext only. |
| Replacing and deleting the key behaves. | Manual: replace the key and confirm its hint updates; delete it and confirm the composer returns to the Settings notice while existing chats, messages, and reports remain accessible. |
| OpenAI model policy is enforced. | Manual: with an OpenAI key configured, confirm GPT-5.6 Luna, GPT-5.6 Terra, GPT-5.6 Sol, and GPT-6 Astra appear. Confirm the GPT-5.6 models expose none, low, medium, high, xhigh, and max effort, while GPT-6 Astra exposes low, medium, high, xhigh, and max. |
| Encryption is active. | Automated plus inspection: `pnpm typecheck` covers configuration; in the Convex dashboard confirm the stored credential row contains ciphertext and an initialization vector, never plaintext. |

## 5. Research persistence

Acceptance family: save before work, browser independence, resumable streaming, and respect for action time limits.

| Check | Method |
| --- | --- |
| The prompt is persisted before the receipt appears. | Manual: submit a research request and confirm the user message and run rows exist in the Convex dashboard the moment `✓✓` renders; the run starts in `accepted`. |
| Closing the browser does not stop a run. | Manual: start a long research request, close the tab entirely, wait, reopen the chat, and confirm the run advanced or completed; the `researchRuns` row must show progress timestamps written while no browser was connected. |
| Another device shows the current state. | Manual: while the run from the previous check is active, open the same chat on a second device or profile and confirm status, activity history, and partial output match the database. |
| Streaming resumes from the saved cursor. | Manual plus inspection: for a run that survives a worker restart (kill `pnpm convex:dev` mid-run, restart it), confirm the run row keeps its last provider sequence number and the worker continues from that cursor without duplicating visible events. |
| No single action exceeds the execution limit. | Automated plus inspection: `pnpm typecheck` and `pnpm lint` pass; during a long run confirm in the Convex dashboard logs that worker slices stay short and requeue rather than one long-lived action. |
| Duplicate submission protection. | Manual: resubmit the same prompt after a network hiccup (or replay the mutation with the same submission identifier) and confirm the original message and run identifiers are returned instead of a second run. |
| Per-prompt activity ordering. | Manual: submit a research prompt and confirm its live tool timeline appears directly below that prompt, the final assistant response follows it, and the cancel control disappears at terminal state. |
| Model-driven email retry. | Manual: after a failed research email, ask the bot in chat to retry sending. Confirm the model lists stored reports, then calls `send_research_email` with the stored `reportId`, and the new email attempt appears under the retrying run. |
| Email failure codes are visible. | Manual plus inspection: when AgentMail rejects a send, confirm the email row stores a sanitized `failureCode`, the run event includes the code, and the chat email status shows it. |

## 6. Tool visibility

Acceptance family: real Firecrawl activity, truthful email status, failures distinguishable from model prose, no secret exposure.

| Check | Method |
| --- | --- |
| The UI shows real Firecrawl activity when Firecrawl is called. | Manual: run a research request that requires search or scrape, confirm the activity feed shows the query event starting and completing, and confirm the `runEvents` and `toolCalls` rows carry matching statuses. |
| Email shows sent only after provider acceptance. | Manual: confirm the email activity is pending until the `emailMessages` row reaches `accepted`, and that a delivery webhook later moves it to `delivered`; the model requesting the send must never be enough. |
| Tool failures are distinguishable from model prose. | Manual: force a tool failure (private URL for scrape, unreachable domain for crawl) and confirm the activity card shows a failed status while the assistant message contains no fabricated success claim. |
| No key or secret appears in activity details. | Manual plus inspection: review `runEvents.safeDetail`, activity cards, and message content for any key material, provider identifiers, or raw function arguments; expect none. |

## 7. Report artifacts

Acceptance family: deep research produces Markdown and PDF, stored before email, professionally laid out, with a concise chat summary.

| Check | Method |
| --- | --- |
| A deep research run can produce Markdown and PDF. | Manual: run a substantial research request, confirm a `reports` row and two `reportArtifacts` rows (markdown, pdf) with content hashes, then download both from the chat. |
| The report is stored before email references it. | Manual plus inspection: confirm the artifact rows and the `ready` report status predate the outbound `emailMessages` row in creation timestamps for the same run. |
| The PDF is readable and well laid out. | Manual: open the PDF and check title, executive summary, section headings, citations near claims, a compact source section, page numbers, no clipped tables or URLs, and no large blank areas from forced breaks. |
| The chat summary stays concise. | Manual: confirm the final assistant message is an executive summary with citations and a download action, not a full duplicate of the report body. |
| Citation links point to original sources. | Manual: confirm report links resolve to source pages recorded in `researchSources`, not provider job or scrape URLs. |
| Owner-scoped downloads. | Manual: in a second account, attempt the download URL of the first account's report and confirm it does not resolve through that account's queries. |

## 8. Email delivery

Acceptance family: the report arrives from the bot's own inbox at the configured recipient, with truthful status.

| Check | Method |
| --- | --- |
| Delivery from the bot inbox to the configured recipient. | Manual: complete a run with email enabled and confirm the recipient inbox receives a message whose sender is the bot's confirmed address, with the report attached and a subject tied to the chat. |
| Status transitions are recorded. | Manual plus inspection: confirm the `emailMessages` row moves `pending` to `accepted`, then `delivered` when the provider delivery event arrives; bounced or rejected events must move it to `failed`. |
| Failure does not erase the report. | Manual (forced failure): revoke the AgentMail key before the send stage, confirm the run still completes, the report remains downloadable, the email shows failed, and the retry action sends the same logical email exactly once (one idempotency key, no duplicate send after retry). |
| Attachment size fallback. | Manual plus inspection: with an oversized report artifact, confirm the send still completes and the email body states the report was not attached, while the artifact remains downloadable in the app. |

## 9. Inbound email reply

Acceptance family: authorized replies continue the right conversation; nothing else can.

| Check | Method |
| --- | --- |
| A reply from the authorized recipient maps to the correct chat. | Manual: reply to the research email from the configured recipient address, confirm the `webhookEvents` row is `processed`, a new run starts in the original chat, and the inbound message appears with the email-origin badge. |
| The bot's answer appears in both surfaces. | Manual: confirm the reply email lands in the same email thread and the same content is stored in the website chat. |
| Duplicate events are deduplicated. | Manual plus inspection: replay the same webhook event identifier and confirm the processor returns the duplicate path with no second run, verified against `webhookEvents`. |
| An unmapped inbox thread gets a new chat, never an arbitrary one. | Manual: send a fresh email to the bot inbox from the authorized address with no prior thread and confirm a new chat is created under that bot. |
| An unknown sender gains nothing. | Manual: send from an address that is not the configured recipient and confirm the event is rejected with the sender-unauthorized code and no run starts. |
| Signature enforcement. | Manual: POST a fabricated payload to the webhook route without a valid Svix signature and expect HTTP 400 and a rejected event row; confirm unsigned or stale-timestamp events never process. |

## 10. Schedules

Acceptance family: conversational creation with semantic validation, lifecycle controls, and idempotent occurrences.

| Check | Method |
| --- | --- |
| A valid recurring request creates a schedule through chat. | Manual: ask a bot for a recurring brief, confirm a `researchSchedules` row appears with recurrence data, timezone, and a scheduled Convex function identifier. |
| An invalid recurring request is not saved. | Manual: ask for a recurring schedule about information that cannot change, and confirm the model does not call the schedule function or the row count stays unchanged. |
| No manual form bypasses the model path. | Manual: confirm the schedules pages expose only pause, resume, and delete, with no create or edit form. |
| Pause, resume, and delete work. | Manual: pause a schedule and confirm the scheduled function is canceled and status is `paused`; resume and confirm a new future time; delete and confirm no further occurrences. |
| Each occurrence creates its own idempotent run. | Manual plus inspection: let an occurrence fire (or trigger the occurrence worker against a due time) and confirm one `scheduleOccurrences` row keyed by the occurrence key, one run, and exactly one next occurrence scheduled for recurring schedules. |
| Occurrence runs stay bounded. | Manual plus inspection: confirm an occurrence run receives compact prior context, not an ever-growing conversation, by inspecting the run's stored instruction composition. |

## 11. Tenant isolation

Acceptance family: ownership is verified everywhere; identifiers alone grant nothing.

| Check | Method |
| --- | --- |
| Every public operation verifies the authenticated owner. | Manual plus inspection: in a second account, attempt to open the first account's chat, bot, run, schedule, and report by identifier (URL manipulation). Each must render not-found rather than data. Spot-check the require-owned helpers in `convex/lib/authHelpers.ts` coverage across public functions. |
| Provider identifiers grant nothing. | Manual: with account B signed in, present account A's OpenAI conversation identifier or AgentMail thread identifier through any public path and confirm no data is returned. |
| Webhook and worker entry points map tenants server-side. | Manual plus inspection: confirm `webhookEvents` and occurrence rows carry owner references resolved from provider identifiers, not from payload-supplied owner data. |
| Data remains isolated end to end. | Manual: browse both accounts' dashboards, chats, schedules, and reports and confirm zero cross-account visibility. |

## 12. Upload parsing

Acceptance family: owner-bound uploads parse through the document tool and cite the document.

| Check | Method |
| --- | --- |
| Allowed types and sizes only. | Manual: attach a supported PDF and a supported spreadsheet under the size cap and confirm both upload; then attempt an unsupported type and an oversized file and confirm rejection before submission. |
| Attachments bind to the message and run. | Manual plus inspection: submit a prompt with attachments and confirm the `messageAttachments` rows move from `uploaded` to `bound` with the message and run references, and that reuse of the same attachment in a second submission is rejected. |
| An uploaded document routes to parse and returns findings. | Manual: submit a question that requires the attached PDF and confirm the `firecrawl_parse_document` tool call executes against the attachment, the attachment row reaches `parsed`, and the answer cites the document by name. |
| Parse failure is visible and honest. | Manual: attach a corrupted file that fails parsing, confirm the attachment row reaches `failed` and the activity feed shows the failed tool status while the run continues with remaining evidence. |
| Uploads are owner-bound. | Manual: confirm a storage identifier from account A's upload cannot be attached by account B; the claim token and owner check must reject it. |

## 13. Failure and partial success

Acceptance family: partial outcomes are represented honestly and completed work survives failures.

| Check | Method |
| --- | --- |
| Research complete, email failed. | Covered in the email delivery section: the run completes, the report stays downloadable, the failed email is retryable. |
| Report stored, PDF rendering failed. | Manual plus inspection: force a PDF failure (for example by temporarily breaking font retrieval in the renderer) and confirm the report row becomes `partial`, the Markdown artifact downloads, and the tool output states the warning. Restore the renderer afterwards. |
| One failed source among sufficient successes. | Manual: run research where one target page is blocked and confirm the failed source is marked `failed` or `rejected` in `researchSources` while the answer still cites the successful ones. |
| Schedule saved but next occurrence delayed. | Manual plus inspection: after a reschedule or pause, confirm the schedule row and occurrence states reflect reality rather than a silently dropped occurrence. |
| Failed runs stay readable. | Manual: force a run failure with an invalid OpenAI key and confirm the failure category renders, prior messages and reports remain accessible, and retry does not repeat completed side effects. |

## 14. Firecrawl routing checks

Each expected routing decision is verified with a prompt shaped to the intent, then confirmed against the executed tool call in `toolCalls` and the activity feed. These expectations come from the product's routing rules; the model must choose the capability, and the backend must enforce the bounds.

| Routing expectation | Check |
| --- | --- |
| A known single URL routes to scrape, not broad search. | Manual: prompt "read and summarize this page" with one URL; confirm `firecrawl_scrape_page`. |
| A known domain with unknown pages routes to map before selective scraping. | Manual: ask what a known site says about a topic; confirm `firecrawl_map_site` then selective scraping (`firecrawl_batch_scrape` or individual scrapes). |
| A bounded site-wide request can route to crawl with explicit limits. | Manual: ask for a bounded docs section sweep; confirm `firecrawl_crawl_site` with a page limit, path scope, or depth recorded in the tool arguments. |
| A list of known independent URLs routes to batch scrape. | Manual: provide three URLs to compare; confirm one `firecrawl_batch_scrape` call. |
| An uploaded document or public document URL routes to parse. | Manual: attach a PDF or link a public PDF; confirm `firecrawl_parse_document`. |
| Academic and developer questions use specialized search paths. | Manual: prompt for studies on a topic and for library behavior; confirm `firecrawl_search_research` and `firecrawl_search_developer` respectively. |
| Time-sensitive queries use freshness controls. | Manual: ask for the latest news on a topic; confirm the search call carries a time filter and the answer distinguishes publication from event time. |
| Independent calls can run in parallel. | Manual: ask a question with two independent subquestions (for example two organizations' pricing) and confirm parallel discovery calls in the activity feed. |
| Dependent calls run sequentially. | Manual: confirm search results feed a later scrape, and that email never runs in parallel with report publication; check the tool sequence in `toolCalls`. |
| Search snippets are not the only evidence when pages can be fetched. | Manual: for a consequential claim, confirm a follow-up scrape or batch scrape of the underlying pages appears in the run's sources. |
| Interaction tools stay within approved public behavior. | Manual: prompt interaction against a public paginated listing and confirm `firecrawl_interact_page` with a bounded goal; attempt a prompt asking the bot to log into a private account and confirm refusal and no credential handling. |
| Browser research is bounded and cleaned up. | Manual: prompt a multi-step public workflow; confirm `firecrawl_browser_research` uses a public starting URL and the job row ends `closed` rather than lingering. |
| Media extraction is intent-driven. | Manual: ask about a video's page description first and confirm page scraping suffices; only a request depending on the media itself should produce `firecrawl_extract_media`, and citations must point to the original video URL, not the temporary signed URL. |
| Firecrawl Agent is not the default. | Manual: ordinary questions must route to search or scrape; only a genuinely unknown-location dataset prompt should produce `firecrawl_agent_gather`, followed by verification of key sources. |
| Schedules remain owned by the app scheduler even when change tracking is used. | Manual: create a what-changed weekly schedule and confirm the app schedules occurrences while the run uses `firecrawl_compare_page_change` as evidence. |
| UI activity reflects actual execution. | Manual: for any of the above, cross-check the activity feed against `toolCalls` statuses; the feed must never show success for a call that failed in the database. |
| Social platforms do not promise private access. | Manual: prompt for a social profile and confirm any answer states public-access limits and contains no harvested personal contact claims. |

## 15. Mobile and contrast review

Acceptance family: the product remains usable and readable on small screens, and every text pairing stays readable.

| Check | Method |
| --- | --- |
| Core flows work at mobile widths. | Manual: at a 390 pixel viewport, complete sign-in, bot creation, chat submission, activity expansion, report download, and schedule pause or resume. Confirm the app shell nav, composer, and artifact links remain reachable and no content overflows horizontally. |
| Contrast passes for all states. | Manual: walk every surface (buttons, badges, cards, forms, nav links, activity statuses, disabled states, focus rings) in both resting and hover or focus states and confirm text and icons keep readable contrast against their backgrounds, including the light wordmark on the sign-in panel and status badges on cards. Flag any pairing that relies on color alone. |
| Focus and control states are visible. | Manual: tab through the chat page and settings forms; confirm visible focus indicators and that disabled buttons (empty composer, sending state) are distinguishable. |
| Reduced-motion and live regions behave. | Manual: confirm the message list announces updates politely and the typing shimmer and live orb do not obstruct reading. |

## Sign-off

Record the date, deployment URL, and checker for each section. Any failed manual check needs a corresponding database observation in the Convex dashboard before the failure is accepted as real, and any fix must repeat the failing check plus the automated commands above.
