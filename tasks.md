# Templates and shared email implementation plan

## Confirmed product decisions

- Add a protected `/templates` route with about twenty curated templates across everyday shopping, software development, AI, and hardware.
- A template opens into an overview before deployment. The overview shows the bot name, mission, full private memory, and schedule definitions.
- The overview is read-only by default. An Edit control enables changes to the basic template fields.
- Deployment uses a persistent bottom action bar so the primary action remains visible while reviewing long instructions.
- The user selects an existing AgentMail address or creates a new address before `Confirm and deploy` becomes available.
- New addresses accept a user-selected prefix and display the fixed AgentMail default-domain suffix separately.
- Users may create unlimited bots, but each owner may provision at most three distinct AgentMail inboxes. Any inbox may be assigned to multiple bots. Failed provisioning attempts do not consume an address slot because they never created a provider inbox.
- A missing OpenAI and Zhipu API key blocks deployment and shows the existing Settings redirect flow.
- The browser IANA timezone is captured during deployment and included in schedule bootstrap instructions.
- Scheduled templates check the bot's existing schedules on the first conversation run, create only missing schedules, and never duplicate a matching schedule.
- Extreme-ranking requests such as best, cheapest, strongest, or fastest return at most five ranked results with direct URLs.
- External outreach starts as a visible draft that identifies the recipient and complete email body. The user approves selected drafts before the first send.
- Replies inside an approved outreach thread may continue autonomously within the user-approved constraints.
- Inbound AgentMail messages without a known application thread are ignored. No model-based routing is used.
- The optional SaaS UX psychology framework is not used.

## Architecture

### Template catalog

- Keep curated templates in typed source data rather than database rows.
- Copy the selected template's mission and detailed memory into the bot's immutable instruction-version history at deployment.
- Append deployment-specific schedule bootstrap instructions and the detected timezone to the copied memory.
- Keep each template ID stable so links such as `/templates?template=smart-product-shopping` remain durable.

Tradeoff: source-controlled templates require a release to edit, but avoid an admin CMS, public write surface, and runtime catalog migrations for the first curated set.

### Template deployment

- Reuse the authenticated bot creation mutation for ownership, instruction versioning, avatar defaults, and inbox provisioning.
- Extend bot creation with an explicit email identity choice: assign an owned active inbox or request a new username.
- Check provider credential status in the client before deployment and preserve the selected template in the URL when routing to Settings.
- Redirect successful deployment to the new bot workspace.

Tradeoff: template deployment remains a client-orchestrated mutation rather than a separate template table transaction. This keeps the catalog read-only and avoids duplicating bot lifecycle logic.

### Shared email identities

- Treat each `agentMailInboxes` row as one owner-scoped email identity that can be referenced by multiple bots.
- Add an optional inbox reference to bots for compatibility with existing bot-owned inbox rows.
- Resolve a bot's inbox through the explicit reference first and the legacy `by_bot` index second.
- Enforce the limit against distinct active or provisioning inbox rows, not bot count.
- Permit unlimited bot rows and expose owner-scoped inbox choices to bot creation surfaces.
- Route known replies by `emailThreads.botId` and `emailThreads.chatId`; ignore messages without a known thread.

Tradeoff: the legacy inbox `botId` remains as the provisioning anchor while bots gain an explicit shared reference. This supports existing data without a destructive migration.

### Schedule bootstrap

- Add a read-only `list_research_schedules` model tool scoped to the current owned bot.
- Return bounded schedule summaries sufficient for semantic duplicate checks.
- Require scheduled template memory to call the list tool before `create_research_schedule` on the first run.
- Keep creation idempotency in the backend and add bot-level semantic duplicate protection where required.

Tradeoff: schedules are created on the first actual user run instead of spending model credits immediately when a bot is deployed. This matches the requirement while preserving explicit user initiation of model work.

### Approved outreach

- Add persisted outreach drafts tied to owner, bot, chat, run, recipient, constraints, and originating inbox.
- Let the model prepare drafts but not send new external email directly.
- Render drafts in the chat run artifacts with an explicit approval action.
- On approval, transactionally mark the draft, create the outbound email record, and schedule one provider send.
- Bind the resulting provider thread to the originating bot and chat.
- Store negotiation constraints on the thread so follow-up email runs receive trusted instructions separate from untrusted merchant content.

Tradeoff: a structured approval record adds schema and UI surface, but provides a real authorization boundary that prompt-only confirmation cannot guarantee.

## Execution checklist

### Phase 1: templates route and catalog

- [x] Add typed template categories, schedule definitions, and twenty detailed template records.
- [x] Add `/templates` route protection and main navigation entry.
- [x] Build searchable category tabs covering software plus AI overlap.
- [x] Build template cards, overview, edit mode, email step, and fixed deployment bar.
- [x] Add missing-key state with a Settings button.
- [x] Capture browser timezone safely with a UTC fallback only when browser detection fails.
- [x] Add route and component folder documentation.

### Phase 2: schedule introspection

- [x] Add `list_research_schedules` to the schema tool-name union, definitions, registry, and handler.
- [x] Add an owner-checked, bounded internal schedule query for the current tool call.
- [x] Add bot-level duplicate prevention for equivalent active or paused schedules.
- [x] Document schedule bootstrap behavior and tool routing.

### Phase 3: shared email identities and unlimited bots

- [x] Add the compatible bot-to-inbox reference and required indexes.
- [x] Add an owner-scoped inbox listing query for creation forms and dashboard filters.
- [x] Change creation limits from three bots to three distinct inboxes.
- [x] Support assigning an existing active inbox or provisioning a new requested username.
- [x] Update manual bot creation to use the same email identity selector.
- [x] Resolve shared inboxes in bot summaries, report delivery, retries, and known-thread inbound routing.
- [x] Ignore inbound messages that do not map to an existing application thread.
- [x] Add dashboard filtering by email address.

### Phase 4: approved merchant outreach

- [x] Add outreach draft and approval persistence with owner and thread indexes.
- [x] Add a model tool that prepares, but cannot send, a complete outreach draft.
- [x] Render draft recipient, subject, body, constraints, and approval controls in chat.
- [x] Send approved drafts idempotently from the bot's assigned inbox.
- [x] Create a bot/chat thread mapping from the accepted provider response.
- [x] Include trusted thread constraints in follow-up run instructions.
- [x] Permit autonomous replies only on approved outreach threads.
- [x] Keep the top-five rule and missing-contact disclosure in relevant template memories.

### Phase 5: documentation and verification

- [x] Update root and folder documentation for templates, shared inboxes, and outreach approval.
- [x] Update the project structure map and current MVP boundaries.
- [x] Run the repository formatter if one is configured (none configured; lint clean).
- [x] Run `pnpm typecheck` (passing).
- [x] Run `pnpm lint` (passing).
- [x] Run `pnpm test` without adding new tests unless separately requested (36 pass, 2 skipped, 2 stale failures documented below).
- [x] Run `pnpm build` to verify the static route export (passing, `/templates` exported).
- [x] Review the final diff for overlap with concurrent work and avoid unrelated changes.
- [x] Refresh the two stale test assertions (22-tool list; unthreaded inbound run) pending user approval, since test edits were not requested. Updated with approval: the tool-surface test now expects twenty-four names, and the webhook replay test seeds a known provider thread before replay.

## Acceptance criteria

- `/templates` loads on desktop and mobile and exposes twenty useful templates with category filtering.
- A user can inspect all copied instructions and schedules before deployment and can edit them only after selecting Edit.
- Deployment cannot proceed without an active model-provider key and provides a direct Settings action.
- A user can assign one of up to three existing email identities or create a new identity with a chosen prefix.
- More than three bots can exist when they share no more than three inboxes.
- The dashboard can filter bots by assigned email address.
- Scheduled templates list existing schedules before creating a missing first-run schedule.
- Smart shopping produces no more than five ranked picks with direct URLs and flags missing merchant contacts.
- A new external message cannot be sent until the user approves its persisted draft.
- Approved merchant replies return to the originating bot conversation and continue under the approved constraints.
- Unknown unthreaded inbound messages cause no bot run and no model call.
