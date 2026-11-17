# Update 1.2 plan: financial data integrity, Noor field registry, support platform completion, IVR and contact center

Source spec: `docs/planner.md`. Continues the Update 1.0 / 1.1 plan (Phases 1–16, all shipped by 14 Nov 2026) and the three follow-up commits of 16 Nov (`0df3b5b`, `ec36074`, `3e3a870`).
Written 17 Nov 2026 against branch `codex/cms-live-controls-kiosk-theme`.

Phases here are numbered **1.2-1 to 1.2-10** so they do not collide with "Phase 17" in `ROADMAP.md` (KRAs and KPIs).

**How this plan was made.** I read the code, schema and commit history. I did not run the test suite and I could not call the live Chapa or Noor systems, so every statement about their real responses is marked as something the first task of its phase must confirm.

**The spec file is cut off.** `docs/planner.md` ends mid-word at line 900 (section 8.4, "Cancel"). The sections on IVR, call queues, recordings, administration and analytics are missing. Phases 1.2-8 to 1.2-10 are planned from the objective list in section 1 of the spec and must be checked against the full text when you supply it.

---

## Status

| Phase | State | Notes |
|---|---|---|
| 1.2-1 Chapa sync | Built 17 Nov 2026, not committed, **not yet run against the live Chapa API** | `src/server/chapa-sync.ts`, `src/server/sync-runs.ts`, Finance › Chapa › Sync and reconcile. Tests: `tests/server/chapa-sync.test.ts`, `tests/e2e/update-1-2-chapa.e2e.mjs` |
| 1.2-2 Chapa transactions screen | Built 17 Nov 2026, not committed | `src/components/app/finance/chapa/chapa-transactions.tsx`, `chapaTxPage` in `chapa-hub.ts`, `src/lib/date-presets.ts`. Column resize and reorder are not built (show and hide is) |
| 1.2-3 to 1.2-10 | Not started | |

Decisions taken (17 Nov 2026, recommended and free options): D1 browser-to-browser calls with TURN, no media server. D2 a request record linked to a department task. D3 IVR inside the Mini App and widget. D4 keep reading Noor's admin pages. D5 recordings kept 90 days, for support leads and Admin. D6 is still open: the spec text after line 900 is needed before Phase 1.2-8.

**To confirm on the live system after deploy:** in Finance › Chapa › Settings press *Check API* for each business (it now reports whether Chapa applies the date range, the paging, the row order and the date zone), then in *Sync and reconcile* run *Full sync* and *Reconcile* for the last 3 days. The reconciliation table is the proof: "At Chapa" and "Stored now" must be equal per status.

---

## 1. What exists today

| Area | State in the code | Verdict |
|---|---|---|
| Chapa businesses, keys, webhook, pending re-check, follow-up, money actions | `src/server/chapa-hub.ts` (1,030 lines), `chapa_accounts`, `chapa_transactions`, `chapa_operations`, `chapa_beneficiaries` | Keep |
| Chapa transaction sync | `syncChapaBusiness` (`chapa-hub.ts:344`) | **Rebuild** (section 2) |
| Chapa transactions screen | `src/components/app/finance/chapa/chapa-hub.tsx:351-440` | **Rebuild**: filters and paging run in the browser |
| Noor CMS reading | Scrapes Noor's Filament admin through Livewire (`src/lib/cms-livewire.ts`, `src/server/cms-range.ts`). Noor has no API in this codebase. Seven fixed tables (`src/lib/legacy-cms.ts:10`) | Extend |
| Noor columns and filters | Columns are read from each table's snapshot per request (`tableColumnsOf`, `cms-livewire.ts:76`) but never stored. Only filters Noor itself offers are usable | **Build** the field registry |
| Support desk, queues, SLAs, routing, help menu | `src/server/support-desk.ts`, `support-help.ts`, `sup_*` tables | Keep |
| Support chat | Bubbles, replies, reactions, typing, read ticks, files, voice notes, internal notes, priority (`components/app/support/desk.tsx`, `desk-live.tsx`), live through server-sent events (`api/support/live`) | Extend |
| Desk layout | Two columns: inbox and ticket (`app/(app)/support/page.tsx:63`). Views: Mine, Unassigned, All open, Late, per queue, Solved | **Rebuild** to three columns |
| Message context menu, forwarding, edit, delete, message search in support | Not present. Team chat has forwarding (`forwardPlain`, `chat-extras.ts:300`); `components/ui/context-menu.tsx` exists | **Build** |
| Telegram bot, Mini App, bot manager | Buttons, Amharic and English, per-system bots, content library, forms, feedback, Mini App sign-in with `initData` (`support-channels.ts`, `bot-manager.ts`, `support-widget/widget.tsx`) | Extend |
| Content manager | Texts, categories, articles and bot content are edited in four places. Articles have a published flag. No drafts for texts, no version history, no preview-then-publish | **Build** on top of the existing readers |
| Internal requests | `/requests` creates a department task with `request_state` pending, accepted or declined (`work-extras.ts:317`) | Extend: the 11-status workflow, approval chains and customer links are missing |
| Calls | Browser-to-browser WebRTC. Signalling is rows in `sup_calls` (offer, answer, ICE) read by polling. TURN settings exist (`calls.ts` `turnSettings`, `api/calls/ice`). Hold, transfer, conference through the agent's browser, call-backs (`support-calls.ts`) | Extend |
| Call states | `ringing, answered, ended, missed, declined, transferred, callback` | **Rebuild** as one server-side state machine with the spec's states |
| Recording | Recorded in the agent's browser with `MediaRecorder` and uploaded at the end (`call-center.tsx:159`). If the agent's tab closes, the recording is lost. No retention rule | Extend, see decision D1 |
| IVR | A single waiting message or audio file with hold music and queue position (`IvrConfig`, `src/lib/support.ts:17`). No menu tree | **Build** |
| Call queue | Ringing widens from the ticket's agent to the queue, then an overflow queue (`ring_stage`). No skills, no per-queue wait rules | Extend |

---

## 2. The Chapa bug: why 39 of 89 shows

I could not reproduce it without the live keys. The code has these faults, most likely first. Task 1.2-1.1 confirms which ones apply by logging one real sync.

1. **The sync pages with parameters Chapa does not document.** It asks for `/v1/transactions?page=N&per_page=100` (`chapa-hub.ts:347`, `:380`). The Update 1.0 plan said to ask one day at a time with `from_date` and `to_date`; that was never built (no `from_date` anywhere in the file). If Chapa ignores `page`, page 2 repeats page 1, the "all rows already seen" check (`:362`) ends the loop, and the business is marked fully backfilled. One response's worth of rows is all that is ever stored. This fits the numbers best.
2. **A false "complete".** In that case `reachedEnd` is true, so `backfilled_at` is set and the screen reports a healthy sync (`:388`).
3. **The incremental stop assumes newest-first order.** `if (since && oldest < since) break` (`:378`). If Chapa returns oldest first, every later sync stops after its first page.
4. **A silent cap of 500 pages** (`:353`).
5. **Wrong dates move rows out of the range.** A missing or unreadable date becomes "now" (`parseChapaDate`, `:276`). A date with no zone is assumed to be Addis time (`:281`); if Chapa sends UTC, rows shift three hours across midnight. `created_at` is never corrected on later syncs.
6. **Status mapping.** `/success|paid|complete/` also matches "unpaid" and "incomplete" (`src/lib/chapa.ts:15`).
7. **Rows without `tx_ref` are dropped**, and the fallback chain (`tx_ref ?? trans_id ?? reference ?? ref_id ?? id`, `:293`) can give two payments the same key.
8. **The screen.** The default range is seven days, the query stops at 2,000 rows (`:554`), the table shows 100 and the header prints the number of rows loaded, not the total. Sorting and paging are in the browser.
9. **Failures are hidden.** `scheduledChapa` swallows sync errors (`:993`). There is no log of sync runs.
10. `raw_json` is cut at 20,000 characters, which can leave invalid JSON (`:321`).

---

## 3. Rules for all the work

These come from how the code is already written.

- **Next.js 16.4.3.** `AGENTS.md` requires reading the relevant guide in `node_modules/next/dist/docs/` before writing code.
- **Server code** in `src/server/*.ts`, using `all`, `get`, `run`, `tx` from `db.ts`; errors as `WorkflowError`; every change through `audit()`.
- **Schema** only in `src/server/schema.ts`, additive and repeatable (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). Postgres in production, PGlite locally.
- **Outgoing calls** through `trackedFetch` so they appear in the call monitor. **Schedules** through `/api/cron/checks` with a lease from `ops.ts`.
- **Live updates** through `sseResponse` (`src/server/sse.ts`). No page refresh loops.
- **Screens** on `page-kit.tsx` (`PageTabs`, `Toolbar`, `ViewSwitcher`, `StatusStrip`), shadcn and Radix components, Lucide icons, the six themes, phone width without sideways scrolling.
- **Text** in English and Amharic. No emojis (`tests/server/no-emoji.test.ts` enforces it).
- **Days** are Addis Ababa days (UTC+3).
- **Tests** for every phase: server tests in `tests/server`, browser tests in `tests/e2e`, run with `npm run test:all` and `npm run typecheck`.
- **No new service** unless a decision below says so.

---

## 4. Phases

Sizes: S is up to a day, M is two to three days, L is about a week, for one developer working with Claude.

### Phase 1.2-1: Chapa sync that fetches everything (P0)

| # | Task | Size | Where |
|---|---|---|---|
| 1.1 | **Diagnose on the live API.** Extend `probeChapaBusiness` to record, for one business and the last three days: the raw paging fields, row order, whether `page`, `per_page`, `from_date`, `to_date` and `status` change the response, the row cap, date format and zone, and every status string seen. Save the result and show it to Admin. This decides the paging method in 1.3 | S | `chapa-hub.ts:477` |
| 1.2 | **Sync run log shared by Chapa and Noor.** New `sync_runs` (source, account or table, kind: full, incremental, manual, reconcile; window; cursor; status; started, finished, duration; discovered, inserted, updated, skipped, failed; error) and `sync_errors` (run, request, status, message). Runs are resumable from the saved cursor | M | `schema.ts`, new `src/server/sync-runs.ts` |
| 1.3 | **Sync engine v2.** Walk the range in day windows with `from_date` and `to_date`; inside a window follow whatever paging 1.1 proved; if a window returns the cap, split it into hours. End only when the provider says so or a window is empty. No fixed page cap. Never stop on row order. Mark a business backfilled only when every window finished | L | `chapa-hub.ts:344-398` |
| 1.4 | **Correct upserts.** Update amount, method, type, customer fields, `created_at` and raw data when they change; keep status history; store full raw JSON; add `provider_updated_at`. Rows with no stable reference go to `sync_errors`, not the floor | M | `chapa-hub.ts:313` |
| 1.5 | **Dates and statuses.** Fix the zone rule from 1.1; never default a missing date to "now" (store null and flag it); anchor the status patterns; keep the provider's original status string in a column | S | `chapa-hub.ts:275`, `src/lib/chapa.ts:13` |
| 1.6 | **Modes of sync.** Incremental on the schedule (overlap window, per business interval), full sync for Admin as a background job with progress and Stop, retry queue with backoff for failed windows, last successful sync time per business. Stop swallowing errors | M | `chapa-hub.ts:984`, `jobs.ts` |
| 1.7 | **Reconciliation.** For a chosen range: provider count and amount per status against local count and amount, missing references, duplicates, last sync, run status. A nightly reconcile for the last seven days alerts Admin on any gap. If Chapa cannot list history fully, the screen says so in plain words | M | new `reconcileChapa`, Chapa hub "Reconcile" tab |
| 1.8 | **Tests.** A fake Chapa server for: paging ignored, ascending order, capped day, 429 and 5xx, interrupted run resumed, duplicate rows, status change, UTC and Addis dates | M | `tests/server/chapa-sync.test.ts` |

Done when: for a three-day range the provider count, the local count and the screen's count are equal, per status, on the live account.

### Phase 1.2-2: Chapa financial operations screen

| # | Task | Size | Where |
|---|---|---|---|
| 2.1 | **Server-side list.** `listChapaTx` takes page, page size, sort column and direction, returns the true total. Indexes on (account, created_at) and (account, status, created_at) | M | `chapa-hub.ts:552` |
| 2.2 | **Date presets.** All 13 from the spec (All time to Custom range, with start and end time) in one shared helper used by Chapa and Noor, in Addis days. Extends `CMS_DATE_PRESETS` (`src/lib/cms-filters.ts:76`) | S | new `src/lib/date-presets.ts` |
| 2.3 | **Filters that work together.** Status, method, currency, customer, reference, search, type, business. One filter object drives the table, the cards, the charts, the export and the paging | M | `chapa-hub.tsx` |
| 2.4 | **Eight summary cards** computed in SQL for the current filter: total, successful, successful amount, pending, failed, refunded, average value, success rate | S | `chapaOverview` |
| 2.5 | **Table columns** from the spec, shown only when Chapa supplies the field (decided from 1.1). Column show and hide, saved per person | M | `chapa-hub.tsx`, existing `saved_views` table |
| 2.6 | **Saved filter presets** per person, with Admin defaults | S | `saved_views` |
| 2.7 | **Detail drawer**: all metadata, verify now, provider response, webhook history, related customer and Noor record. Needs a new `chapa_webhook_events` table (today only `webhook_at` is stored) | M | `chapaTxDetail`, `chapaWebhook` |
| 2.8 | **Export** CSV and Excel of the whole filtered set (streamed, not the loaded page), logged | S | `api/finance/chapa/export` |
| 2.9 | **States**: empty, loading, error, partial sync (a banner whenever the range includes a window that has not finished syncing) | S | `chapa-hub.tsx` |

### Phase 1.2-3: Noor CMS complete collection and field registry

| # | Task | Size | Where |
|---|---|---|---|
| 3.1 | **Discover what Noor exposes.** Crawl the Filament navigation with the saved login and list every resource, not only the seven fixed ones. Admin switches each on or off. Nothing is invented: only resources found are offered | M | `legacy-cms.ts`, `src/lib/legacy-cms.ts:10` |
| 3.2 | **Field registry.** New `cms_fields` (table, name, label, type, filterable, searchable, sortable, exportable, nullable, relationship, sensitive, source, first and last seen). Filled from each table's snapshot columns, its Noor filters, and types inferred from sampled values (string, integer, decimal, boolean, date, datetime, enum, JSON, relationship, currency, status). Admin can correct label, type and sensitivity | L | `cms-livewire.ts:76`, new `src/server/cms-fields.ts` |
| 3.3 | **Complete mirror.** Sync every enabled table fully into `legacy_cms_records` with hidden columns switched on, through `sync_runs` from 1.2. Replace the silent limits (`MAX_ROWS` 50,000, `MAX_PAGES` 2,000, `MAX_DAYS` 366 at `cms-range.ts:67-69`) with resumable runs that report when they are partial | L | `cms-range.ts`, `syncLegacyCms` |
| 3.4 | **Incremental and reconcile.** Newest-first incremental by id or created date; nightly comparison of Noor's own total ("Showing x to y of z") with the local count per table; updated-record detection by row hash | M | `cms-range.ts` |
| 3.5 | **Tests** against recorded Noor pages in `tests/fixtures` | M | `tests/server` |

Limit to state on the screen: Noor is read through its admin pages, so a field Noor's admin never shows cannot be collected. If Noor's team can give an API or a read-only database user, 3.1 to 3.4 become simpler and faster (decision D4).

### Phase 1.2-4: Noor filtering and table customization

| # | Task | Size | Where |
|---|---|---|---|
| 4.1 | **Filter engine on the mirror.** Conditions are (field, operator, value) with AND and OR groups. Field names are looked up in `cms_fields`; anything not registered is refused. SQL is built with parameters only, never from user text | L | new `src/server/cms-query.ts` |
| 4.2 | **Filter builder** screen: add and remove conditions, groups, operator by field type, value input by field type, save, load, reset | L | `components/app/legacy-cms` |
| 4.3 | **Fixed filters** from the spec (entity, status, customer, user, organization, department, payment method, amount range, currency, created, updated, related record) appear when the registry has a matching field | M | same |
| 4.4 | **Table customization**: show, hide, reorder, resize, pin, sort; personal views in `saved_views`; sensitive fields hidden by role | M | `live-view.tsx` |
| 4.5 | **Record detail** with related records, and export of the filtered set | M | `relations.tsx`, `cms-reports.ts` |

### Phase 1.2-5: Support content manager and Telegram bot completion

| # | Task | Size | Where |
|---|---|---|---|
| 5.1 | **One versioned content store.** `sup_content` (key, kind, system, language, parent, order, enabled, draft body, published body, published at) and `sup_content_versions`. Kinds: welcome, command, menu label, button, FAQ, category, automated reply, offline, queue, call notice, policy, terms, escalation, closing | L | `schema.ts`, new `src/server/support-content.ts` |
| 5.2 | **Move the existing readers onto it.** `telegramTexts`, `helpCategories` and the bot menu read published content; existing texts are migrated once. No second copy remains | M | `support-channels.ts`, `support-help.ts`, `bot-manager.ts` |
| 5.3 | **Content Manager screen**: create, edit, delete, enable, disable, reorder, translate, preview (Telegram and Mini App frames), draft, publish, version history with restore | L | `components/app/support` |
| 5.4 | **Default content on migration**: the welcome text, the eight menu entries and seven categories from spec section 5.2, in English and Amharic | S | seed in `schema.ts` |
| 5.5 | **Bot capability audit and gaps.** Check each of the 20 capabilities in spec 5.1 against the bot. Known gaps to build: language choice at start, queue position and wait messages, agent availability message, transfer to another category by the customer, close and reopen, request tracking | L | `support-channels.ts`, `bot-manager.ts` |
| 5.6 | **Mini App screens**: conversations, history, requests and their status, help articles, notifications, in the Telegram theme | M | `support-widget/widget.tsx` |

### Phase 1.2-6: Support chat at team-chat level

| # | Task | Size | Where |
|---|---|---|---|
| 6.1 | **Three-column desk.** Conversations, conversation, customer panel. On phones: list, then conversation, with the customer panel as a sheet | L | `support/page.tsx`, `desk.tsx` |
| 6.2 | **Conversation views**: All, Mine, Unassigned, Assigned to me, Waiting in queue, Active, Pending, Resolved, Archived, Escalated, with search and filters. Adds `archived_at` and `escalated_at` to `sup_tickets` | M | `support-desk.ts:696` |
| 6.3 | **Customer panel**: identity, Telegram ID, account, contacts, subscription and payment history (from the Noor mirror and Chapa by phone and email, already matched in `customer-records.ts`), previous conversations, agent, priority, notes, tags, related requests | M | `desk.tsx` |
| 6.4 | **Missing message features**: edit own, delete by permission, forward, save, report, message search, delivery state, video attachments, file previews. Shared pieces are lifted out of `chat-client.tsx` and `chat-extras.tsx` into components both chats use, so there is one message bubble, one composer and one menu | L | `app/(app)/chat`, `components/app/support` |
| 6.5 | **Context menu** on right-click, and a long-press sheet on phones: Reply, Forward, Copy, React, Save, View details, Report, Delete | M | `components/ui/context-menu.tsx` |
| 6.6 | **Forwarding to configured targets.** `sup_forward_targets` (person, department, department head; who may use it; approval needed; include attachments; include customer details; link the conversation). Forwarding creates an audited internal message in team chat or a request (Phase 1.2-7). Customer details are removed unless the target allows them | L | new `src/server/support-forward.ts` |

### Phase 1.2-7: Customer Support Requests and approvals

| # | Task | Size | Where |
|---|---|---|---|
| 7.1 | **Request record.** `sup_requests` (reference, type, title, description, destination department and member, priority, customer, ticket, Chapa transaction, requested action, error details, due date, status), `sup_request_events` (status history and discussion), `sup_request_approvals`. Files reuse `sup_files`. When the destination accepts, a linked department task is created through the existing `createRequest`, so the work appears in that department's own workspace and there is no second task system | L | `schema.ts`, new `src/server/support-requests.ts` |
| 7.2 | **The 11 statuses** as a server-side state machine with allowed moves per role | M | same |
| 7.3 | **Customer Support Requests page**: create from a ticket, a customer or a transaction; my requests; progress and updates through SSE and notifications | L | `app/(app)/support` new tab |
| 7.4 | **Receiving side**: each department sees its requests in its workspace (`dept-requests.tsx`) | M | `components/app/dept-requests.tsx` |
| 7.5 | **Developer approval workflow**: the Developer Team Head assigns, comments, asks for information, approves, rejects with a reason, escalates, sends for further approval, resolves and returns the result | M | `support-requests.ts`, `dev-studio.ts` |
| 7.6 | **Approval chains** set by Admin per destination and type. Nobody approves their own request unless an exception is configured, and every use of an exception is audited | M | `support-requests.ts` |
| 7.7 | **Destinations** switched on by Admin for a department or for chosen members | S | Support settings |

### Phase 1.2-8: Calling

| # | Task | Size | Where |
|---|---|---|---|
| 8.1 | **One call state machine on the server**: initiated, ringing, accepted, connecting, connected, on hold, transferring, completed, declined, missed, failed, cancelled (and any others in the missing part of the spec). Every change is one guarded update with a `sup_call_events` row. Existing statuses are mapped across | L | `support-calls.ts`, `support-desk.ts` |
| 8.2 | **Pre-call checks** in order: customer reachable (Mini App open, or a Telegram message can be sent), agent permission, agent available, call settings for the system; then the session is created and the customer is notified | M | `dialCustomer`, `support-calls.ts:139` |
| 8.3 | **Incoming-call screen in the Mini App**: support identity, agent or department, Accept, Decline, time left, ring and vibration. Never connects without Accept. When the Mini App is closed, the bot sends a message with a button that opens it on the call | M | `support-widget/calls.tsx` |
| 8.4 | **Signalling over SSE** in place of polling `sup_calls`, with short-lived signed call tokens for both sides | M | `api/support/live`, `support-desk.ts` |
| 8.5 | **TURN made mandatory for production**: a setup check that fails loudly when no TURN server is set, short-lived TURN credentials, a connection test for Admin | S | `calls.ts` `turnSettings`, `api/calls/ice` |
| 8.6 | **Call from everywhere**: conversation, customer profile, request, call center, customer record | S | `desk.tsx`, `call-center.tsx` |
| 8.7 | **Telegram limits stated on screen**: microphone access inside Telegram's in-app browser varies by device; when it is refused the customer is offered "open in browser" or a call-back | S | `support-widget/calls.tsx` |

Media stays as WebRTC audio between the two browsers through STUN and TURN. Whether to add a media server depends on decision D1.

### Phase 1.2-9: IVR, queues and recordings

| # | Task | Size | Where |
|---|---|---|---|
| 9.1 | **IVR menu tree.** `sup_ivr_flows` and `sup_ivr_nodes` (prompt text or audio per language, options, actions: go to node, join queue, play message, request call-back, leave a voice message, hours check). Versioned and published like content | L | `schema.ts`, new `src/server/support-ivr.ts` |
| 9.2 | **IVR player** in the Mini App and widget: plays the prompts and shows a keypad; each choice is sent to the server, which decides the next step. The existing waiting message becomes the default one-node flow | L | `support-widget/calls.tsx` |
| 9.3 | **IVR builder** for Admin with a test call | L | Support settings |
| 9.4 | **Call queues**: per-queue strategy (longest idle, least busy, round robin, skills), agent capacity and wrap-up time, maximum wait, overflow, position and reliable wait estimates, call-back offer | L | `support-desk.ts` `autoAssign`, `ring_stage` logic |
| 9.5 | **Recordings**: consent prompt, upload in chunks during the call so a closed tab loses seconds not the call, retention period per system with a scheduled purge, playback with speed and download by permission, access log, legal hold | L | `call-center.tsx:159`, `saveRecording` |
| 9.6 | **Supervisor view**: live queue board, waiting callers, agent states | M | `call-center.tsx`, `live-dashboard.ts` |

### Phase 1.2-10: Administration, permissions, analytics, hardening

| # | Task | Size | Where |
|---|---|---|---|
| 10.1 | **Permissions** for every new action (sync, reconcile, export, field sensitivity, content publish, forward targets, request approval, call, listen to recordings, IVR edit) in the existing role and page-access system | M | `page-access.ts`, support settings |
| 10.2 | **Analytics**: sync health; support volume, response and resolution; requests by department and time in each status; calls answered, abandoned, wait and talk time; IVR option use | L | `monitor`, `live-dashboard.ts` |
| 10.3 | **Assistant and help text** updated for the new pages | S | `assistant-ops.ts`, `src/lib/help.ts` |
| 10.4 | **Browser tests** for each phase's main path in light, dark and phone width; update `RUNBOOK.md` and `SUPPORT-SDK.md` | M | `tests/e2e`, `docs` |

---

## 5. Order and dependencies

1. **1.2-1** first and alone: it is a money-accuracy fault. **1.2-2** follows directly.
2. **1.2-3** then **1.2-4**; they reuse `sync_runs` and the date presets from the Chapa phases.
3. **1.2-5** and **1.2-6** can run in either order. **1.2-7** needs the forwarding targets from 6.6.
4. **1.2-8** before **1.2-9**. Both wait on decision D1.
5. **1.2-10** permissions are added phase by phase; analytics and hardening close the update.

Rough total: 11 to 13 weeks for one developer with Claude. Phases 1.2-1 and 1.2-2 take about two weeks.

---

## 6. New tables

`sync_runs`, `sync_errors`, `chapa_webhook_events`, `cms_fields`, `sup_content`, `sup_content_versions`, `sup_forward_targets`, `sup_requests`, `sup_request_events`, `sup_request_approvals`, `sup_call_events`, `sup_ivr_flows`, `sup_ivr_nodes`.

New columns: `chapa_transactions` (provider status, provider updated at, date flag), `sup_tickets` (archived at, escalated at), `sup_calls` (state, token, queue fields, retention), `sup_queues` (call strategy, wrap-up, maximum wait). Saved views and filter presets reuse `saved_views`.

---

## 7. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Media server.** Today calls go browser to browser and the agent's browser records. Server-side recording, calls that survive an agent's tab closing, and conferences beyond a few people need a media server such as LiveKit, which must run on your own server (the VPS in `DEPLOY.md`; it cannot run on Netlify or Vercel) | Keep browser-to-browser with TURN for this update and make recording upload in chunks. Add LiveKit only if you need server-side recording or group customer calls |
| D2 | **Where requests live.** A new `sup_requests` record linked to a department task, or extending department tasks themselves | The linked record: the 11 statuses and approval chain do not fit departments' configurable task statuses |
| D3 | **IVR scope.** Telegram's Bot API cannot place or receive voice calls, so IVR runs inside the Mini App and the web widget (spoken prompts plus keypad). Phone-number IVR would need a telephony provider | In-app IVR now; telephony later if wanted |
| D4 | **Noor access.** Keep reading Noor's admin pages, or ask Noor's team for an API or read-only database access | Ask. Keep the page reader as the fallback |
| D5 | **Recording retention** period and who may listen | 90 days; support leads and Admin |
| D6 | **The rest of the spec.** `docs/planner.md` stops at line 900 | Send the full text before Phase 1.2-8 starts |

---

## 8. Risks

| Risk | Handling |
|---|---|
| Chapa's list endpoint cannot return full history, or caps without saying so | Task 1.1 measures it. Reconciliation shows the gap. The screen states the limit instead of reporting success |
| Noor throttles or changes its admin pages | Capped concurrency and backoff already exist; recorded-page tests catch markup changes; partial runs are reported as partial |
| Filter builder as an injection path | Field names come only from `cms_fields`; values are always parameters; covered by tests with hostile input |
| Microphone blocked in Telegram's in-app browser on some phones | Detect, explain, offer open-in-browser or a call-back |
| Calls fail on mobile networks without TURN | TURN required in production, with a setup check |
| Customer data reaching other departments through forwarding and requests | Per-target switches for attachments and customer details, default off; every forward audited |
| Lifting shared chat components breaks team chat | Done behind the existing chat browser tests, one component at a time |
| Large files (`support-desk.ts` 118 KB, `schema.ts` 130 KB) | New work goes in new modules; no rewrite of working code |
