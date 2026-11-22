# Transaction Verify software requirements specification

> [!NOTE]
> Requirements as built, written from the code at commit `3435810` (20 November 2026), following the IEEE 830 and ISO/IEC/IEEE 29148 outline. Priorities use MoSCoW: (Must), (Should), (Could), (Won't). (Won't) means "not in this release". Each requirement has an "Acceptance:" line that a tester can check. Test cases that cover them are in the [test plan](TEST-PLAN.md).

## 1. Introduction

### 1.1 Purpose

This document states what Transaction Verify does today, so that the Myseed Dev team can test it, change it safely and plan what is next.

### 1.2 Scope

Transaction Verify (shown to users as MySeed Verify) confirms payments made through Ethiopian banks, wallets and gateways against the provider's own record, and reports the outcome to the business. The same deployment also contains a staff console, a cashier, platform administration, billing, a storefront and shopper marketplace, and a Creative Studio.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| Organization | A customer business on the platform. Data is isolated per organization |
| Platform organization | The MySeed Verify team's own organization, which runs the platform |
| Payment request | A bill created by an integrating backend or the cashier, with items, amounts and a deadline |
| Submission | One piece of evidence for a request: a file, QR text, link or reference |
| Observation | One provider lookup result |
| Acceptance | The single successful claim of a provider transfer by one request |
| Method | A bank, wallet or gateway definition, with templates and a connector |
| Pilot | A method that reads the bank's own page but sends every payment to a person |
| Relay | A device on a local connection that fetches bank pages for its organization |
| Minor units | Integer amounts in the smallest currency unit (cents) |

### 1.4 References

- [Product overview](PRODUCT-OVERVIEW.md), [architecture](ARCHITECTURE.md), [decisions](DECISIONS.md)
- [Decision log](../existing/docs/decisions.md), [master roadmap v5](../existing/docs/master-roadmap-v5.md), [build roadmap](../existing/docs/roadmap.md)
- API contract `contracts/openapi.v1.json` (OpenAPI 3.1.0, version `0.6.0-draft`)

## 2. Overall description

### 2.1 Product perspective

A multi-tenant web service with a public REST API, signed webhooks, a hosted payment page, a React web app, background workers, two Android shells, a browser extension relay and a local control panel. It runs on one PostgreSQL 17 database.

### 2.2 Users

| User class | Main needs |
| --- | --- |
| Payer | Pay and prove payment quickly on a phone; clear result and retry guidance |
| Organization admin | Set up accounts, people, roles, branches, keys; see and reconcile payments |
| Reviewer | Decide unclear payments with the evidence and the provider record |
| Cashier | Check a payer's receipt at the counter in seconds |
| Developer | Create requests and receive signed webhooks; test in a sandbox |
| Platform team | Approve organizations, manage methods, billing, support and operations |
| Shopper | Browse stores, order, pay and track orders |

### 2.3 Operating environment

- Server: Node.js 24, PostgreSQL 17, Docker on Ubuntu 24.04 (Hostinger VPS), HTTPS through Caddy.
- Clients: current Chrome, Edge, Safari and Firefox on phones and computers; installed PWA; Android 13 or newer for the cashier app features listed in its README.
- Networks: Ethiopian mobile and fixed networks. Some bank pages answer only inside Ethiopia.

### 2.4 Constraints

- Banks and wallets provide no common API. Most checks read official receipt pages, which can change without notice.
- No method is accepted automatically until certified with real receipts.
- Money must be exact; no floating point.
- No emoji in the interface or the repository.
- The web app keeps nothing in browser storage.
- Evidence must stay on the deployment's own storage; OCR is self-hosted.

### 2.5 Assumptions and dependencies

- The VPS and Myseed's Caddy are available.
- Email (SMTP) and SMS (AfroMessage or an HTTPS endpoint) credentials are set on the server for messages to be sent.
- Organizations supply their own gateway keys (Chapa, ArifPay, YaYa) and AI keys.

## 3. Functional requirements

### 3.1 Payment requests and intake

**FR-1 (Must)** An integrating backend creates a payment request with a server key, giving items, currency, fixed or open amounts, an optional deadline (default 72 hours) and an optional `Idempotency-Key`. The request freezes the receiving accounts it may be paid into and remembers the key's environment.
Acceptance: `POST /v1/payment-requests` returns the request and a submission token; repeating it with the same `Idempotency-Key` returns the same request.

**FR-2 (Must)** Each request has short-lived submission tokens with the scopes `submit` and `status` (default 15 minutes, 1 minute to 24 hours per organization), never valid past the request deadline, renewable by the backend.
Acceptance: a token for one request is refused on another; an expired token is refused; `POST .../submission-token` returns a new token without moving the deadline.

**FR-3 (Must)** The payer reserves an upload and sends the receipt file to private storage. Files are limited by `MAX_UPLOAD_MB` (1 to 25, default 8) and their type is checked from their first bytes.
Acceptance: `POST .../uploads` returns a reservation; an oversized file or an unsupported type is refused; a file outside its reservation is refused.

**FR-4 (Must)** The payer submits evidence as an upload, QR text, a provider link or a typed reference. Evidence from a channel the organization does not accept is refused.
Acceptance: `POST .../submissions` records the submission and its first job; a refused channel returns `channel_not_accepted`.

**FR-5 (Must)** The backend and the payer read the status of a request and a submission, with safe feedback and retry guidance and no other payer's details.
Acceptance: `GET /v1/payment-requests/{requestId}` and `GET .../submissions/{submissionId}` return the status and reason code; the payer view shows no account numbers beyond the last four digits.

**FR-6 (Should)** Batch intake accepts up to 100 payments per call with link, QR or reference evidence, six calls a minute per key, resumable by `Idempotency-Key`, with per-item errors. Batch jobs run after single payments within an organization.
Acceptance: `POST /v1/batches` with 101 items is refused; a repeated call with the same key returns the same batch; `GET /v1/batches/{batchId}` shows each item's result.

**FR-7 (Must)** The backend reports fulfillment per allocation and action, idempotently.
Acceptance: `PUT .../allocations/{allocationId}/fulfillment/{action}` repeated with the same revision changes nothing.

**FR-8 (Should)** Organization settings and accepted channels can be read and changed through the API.
Acceptance: `GET` and `PUT /v1/organization/settings`, `GET /v1/channels` and `PUT /v1/channels/{providerId}` work with a server key; invalid values are refused with a problem response.

**FR-9 (Must)** API calls are rate limited per operation (defaults in `apps/api/src/operations.ts`): 120 payment requests a minute per server key, 10 uploads and 10 submissions a minute per request, 120 status reads a minute per request for submission tokens.
Acceptance: the 11th submission in a minute on one request gets status 429.

> [!NOTE]
> Packages also store `apiRequestsPerMinute` (Starter 120, Growth 300, Enterprise 1,200 in migration 010). The code reads it into entitlements, but no check of it on API calls was found. To confirm whether it should be enforced.

### 3.2 Evidence reading

**FR-10 (Must)** The worker reads QR codes from images, provider links, PDF text layers and telebirr's base64 QR content before trying OCR.
Acceptance: the synthetic receipt fixture and the receipt fixtures in `packages/provider-connectors/test` are read to the expected reference and amount.

**FR-11 (Should)** Image-only receipts are read with Tesseract (English and Amharic), with bounded concurrency and time.
Acceptance: with `OCR_NATIVE_TEST=1` the native OCR test reads the synthetic receipt; a run over `OCR_TIMEOUT_MS` is stopped.

**FR-12 (Must)** A reading never accepts a payment. It can refuse with `receipt_mismatch` only on a clear amount conflict with the provider record at OCR confidence 85 percent or more.
Acceptance: a readable receipt without a provider record never produces an acceptance.

**FR-13 (Must)** Only the last four digits of an account number read from a receipt are stored.
Acceptance: `receipt_readings` rows contain no full account number.

### 3.3 Provider verification and acceptance

**FR-14 (Must)** The worker confirms each submission with the provider's own record: an official receipt page through a template, a merchant API, or the synthetic bank in the sandbox.
Acceptance: a synthetic reference `SYN-1000` confirms ETB 1,000.00; `SYN-DOWN` is recorded as provider unavailable.

**FR-15 (Must)** A payment is accepted once, by `accept_payment`, only when amount, currency, recipient, payment date and request state pass and the transfer was not used before.
Acceptance: the same transfer submitted to two requests yields one acceptance and one `already_used`; `SYN-0800` is refused for amount.

**FR-16 (Must)** Money sent to an account the organization does not own is rejected with `recipient_mismatch`. A masked account matches only when exactly one of the organization's accounts at that provider ends with the same four digits; otherwise the case goes to review.
Acceptance: `SYN-WRONG` is rejected with `recipient_mismatch`; `SYN-NORCPT` goes to review.

**FR-17 (Must)** Pending or unavailable providers are retried on the organization's schedule (default 1, 5, 15 and 60 minutes), then the payment goes to staff review.
Acceptance: `SYN-PEND` is retried and lands in the review queue after the last step.

**FR-18 (Must)** Test keys reach only the sandbox bank, live requests never do (except on a sandbox deployment), and test payments never count toward usage, alerts or invoices.
Acceptance: a live request with a synthetic reference is not confirmed; `billable_acceptances` excludes test payments.

**FR-19 (Must)** A method moves from draft to pilot to certified. A provider admin runs Live check with a real receipt, can start a pilot (every payment goes to review with `provider_pilot`), then certifies the template and switches the connector on.
Acceptance: a pilot method never calls `accept_payment` directly; a reviewer's confirm runs the normal acceptance checks.

**FR-20 (Should)** A failing provider is paused by a circuit breaker (5 failures, then 1 to 15 minutes), and each connected bank's receipt address is checked every 5 minutes; three failures in a row mark it down.
Acceptance: the connector tests and `tests/e2e/phone-relay-health.test.mjs` show the paused and down states.

**FR-21 (Should)** Banks that answer only inside Ethiopia are reached through the organization's relays (cashier phone app, browser extension or Node agent). A relay serves only its organization; an answer tagged with another receipt number is refused; a relay error hands the job to another online relay; "Verify with this phone" sends checks through a relay first for five minutes.
Acceptance: `tests/e2e/relay-receipt-tags.test.mjs` and `telebirr-relay.test.mjs` pass.

**FR-22 (Should)** Organizations store their own Chapa, ArifPay and YaYa keys, sealed, shown by the last four characters, and can run a read-only reference lookup that never accepts a bill.
Acceptance: saving a key and its audit record happen in one transaction; the diagnostic response says it did not accept a payment.

**FR-23 (Should)** The platform sets transfer routes per sending and receiving provider: automatic, always to a person, or not supported.
Acceptance: a route set to "person" sends a matching payment to review.

### 3.4 Webhooks and events

**FR-24 (Must)** Events are delivered from an outbox with an HMAC signature, timestamp and key ID, retried after 30 seconds, 2, 10 and 30 minutes, then 2, 6, 12 and 24 hours, then marked dead. Endpoints choose test, live or both; every event carries `environment`.
Acceptance: the e2e flow shows a redelivered event with the same ID; the SDK rejects a changed body.

**FR-25 (Should)** Staff with `deliveries.replay` can send a dead delivery again.
Acceptance: replay creates a new delivery of the same event ID.

**FR-26 (Must)** Refunds and reversals emit `payment.adjusted`.
Acceptance: `tests/e2e/money.test.mjs` shows the event after an adjustment.

### 3.5 Hosted payment page

**FR-27 (Must)** `/pay/` shows the payment summary and accepted channels, offers Upload, Scan QR and Paste link, shows progress, and shows every result state with what to do next.
Acceptance: `apps/hosted/test/build.test.mjs` passes; each synthetic reference shows its state.

**FR-28 (Should)** The page adapts to the device: touch devices start on the camera (BarcodeDetector, else jsQR loaded as `/pay/scan.js`); computers get a drop zone that also takes paste.
Acceptance: on a phone the camera opens first; on a computer a pasted image is accepted.

**FR-29 (Could)** The payer can pay with Chapa from the payment page using the organization's Chapa key; the returned reference is verified like a typed one.
Acceptance: `POST /pay/chapa/start` returns a Chapa checkout address; the callback submits the reference.

### 3.6 Staff console

**FR-30 (Must)** Staff see payments as a list, board or table, and each payment's checks in order with what was found.
Acceptance: the payment page lists reason, bank reference, confirmed amount and time, account reached and check ID.

**FR-31 (Must)** Reviewers decide review cases with the evidence side by side; a decision references the evidence and runs the normal acceptance. Cases can be assigned, decided in bulk and discussed with comments and mentions.
Acceptance: `POST /console/api/review/:id/decision` accepts through `accept_payment`; a confirm of a transfer already used is refused.

**FR-32 (Should)** A review case escalates when its due time passes or after the organization's waiting time (default 24 hours, 1 to 720, can be turned off), once per basis, with one notice without names or amounts.
Acceptance: `tests/e2e/escalation.test.mjs` passes.

**FR-33 (Must)** Receiving account changes are proposed by one admin and approved by a second.
Acceptance: the proposer cannot approve their own change.

**FR-34 (Should)** Reconciliation by day and purpose, with CSV.
Acceptance: totals equal the sum of acceptances minus adjustments.

**FR-35 (Must)** Refunds and reversals are recorded with `record_adjustment`, never more than paid, idempotent by bank reference.
Acceptance: an adjustment over the remaining amount is refused.

**FR-36 (Could)** Bank statement import and matching (flag `statement_matching`, Growth and Enterprise).
Acceptance: a statement line matches its acceptance by reference and amount.

**FR-37 (Should)** In-app notifications and Web Push by category (review, mentions, assignments, alerts). Push messages carry no content.
Acceptance: a new review case raises the count; the push body is empty.

**FR-38 (Should)** Each person picks and orders home page cards; every number follows the person's branches.
Acceptance: a person limited to one branch sees only that branch's counts.

**FR-39 (Should)** Saved views of payment filters.
Acceptance: `POST /console/api/views` saves a view that `GET /console/api/views` lists.

**FR-40 (Must)** Sensitive actions are written to the audit log: account changes, decisions, approvals, key rotation, credential changes, support access.
Acceptance: each such action adds an `audit_events` row visible to `audit.view`.

**FR-41 (Should)** Personal appearance (theme, accent, density, text size, contrast) and organization branding from a logo, with a contrast gate.
Acceptance: a brand color that fails contrast is refused.

### 3.7 Cashier

**FR-42 (Must)** A cashier finds or creates a bill and checks the payer's receipt by camera QR, pasted link, typed transaction ID or upload.
Acceptance: `tests/e2e/cashier.test.mjs` passes.

**FR-43 (Must)** Scan QR without a bill: the bank is recognized from the QR (or chosen), the receiving account comes from the bank when clear, and a request for any amount (`SCAN-` reference, open for an hour) is checked at once.
Acceptance: `tests/e2e/cashier-scan.test.mjs` passes; a retry with the same attempt key is the same check.

**FR-44 (Should)** A shared counter device can be made a cashier terminal: cashier pages only, 15 idle minutes, no remembered two-step, the terminal's branch on bills, unlocked only by an admin.
Acceptance: `tests/e2e/terminal.test.mjs` passes.

**FR-45 (Should)** Checks that could not be sent wait in a Not sent queue in memory, are sent again with the same key, and warn before the page closes. They are never shown as paid.
Acceptance: with the network off, a check shows Not sent; after reconnecting it is sent once.

**FR-46 (Should)** Results show Paid, Not paid, Already used and the other states, each with Show details except Paid.
Acceptance: a transfer that paid another bill shows Already used with the earlier bill number only at the same branch.

**FR-47 (Should)** Each organization installs as its own app (`/m/<id>/manifest.webmanifest`), with share target for receipt links and an update notice that never reloads by itself.
Acceptance: the manifest carries the organization's name and icon.

**FR-48 (Could)** The cashier Android app can be the organization's phone relay, in a foreground service.
Acceptance: "Use this phone" creates a relay; "Stop on this phone" ends its token at once.

### 3.8 Organization administration

**FR-49 (Must)** Admins invite people, give roles (four built-in, up to 50 custom, from 20 permissions) and limit people to branches. Nobody grants a permission they lack or changes their own role.
Acceptance: a reviewer cannot give `people.manage`; a person limited to a branch sees only its payments.

**FR-50 (Must)** Staff sign in with a password, a passkey, or a password with optional two-step codes and recovery codes; the organization can require two-step and set remembered-device days (default 30, 0 to 90).
Acceptance: `tests/e2e/security.test.mjs` passes; a password reset forgets remembered devices.

**FR-51 (Could)** Enterprise organizations connect an OpenID Connect provider (code flow with PKCE); an email domain belongs to one organization; only existing people sign in; admins keep password sign-in.
Acceptance: `tests/e2e/sso.test.mjs` and `apps/api/test/sso.test.mjs` pass; an unknown email is refused.

**FR-52 (Should)** Branches and purposes with details, opening hours, own receiving accounts, installments, VAT and reference prefixes.
Acceptance: a purpose limited to branches is offered only at those branches.

**FR-53 (Should)** Organization settings: token lifetime, request deadline, provider retries, evidence retention, calendar, billing mode, accepted channels and `rejectUnlistedChannels`.
Acceptance: `tests/e2e/settings.test.mjs` passes.

**FR-54 (Could)** Automation rules route work and never decide: event, amount range, branch and bank, then assign or notify. Each rule acts once per check.
Acceptance: `tests/e2e/automation.test.mjs` passes; no rule can accept or reject.

**FR-55 (Should)** Payer and staff messages by email and SMS from one outbox, with plain-text templates checked on save, retried after 1, 5, 30, 120 and 360 minutes.
Acceptance: `tests/e2e/messages.test.mjs` passes; an unknown template variable is refused.

**FR-56 (Should)** CSV exports (byte-order mark, formula cells as text, live payments only, refunds as negative rows), download links valid 7 days, schedules at 06:00 Addis Ababa time.
Acceptance: a cell starting with `=` is written as text; an expired link is refused.

**FR-57 (Should)** The Data page shows counts, cleans up, removes test data with a typed phrase, backs up the organization's rows, and resets or imports payment data from a backup of the same migration version (16 MB compressed, 64 MB decompressed).
Acceptance: `tests/e2e/organization-data-wallets.test.mjs` passes; an import from another migration version is refused.

**FR-58 (Must)** The Developers page manages test and live server keys, webhooks and test payments.
Acceptance: `tests/e2e/developer.test.mjs` passes; a new key is shown once.

### 3.9 Platform administration

**FR-59 (Must)** Organizations sign up at `/signup` and wait for approval. Before a first approval, platform reviewers record six business verification checks; the organization gives legal name, trade license number, TIN (10 digits) and what it sells.
Acceptance: approval is refused while a check is missing.

**FR-60 (Must)** The platform approves, suspends, pauses (server keys get 403 `service_paused`), trashes (30 days), restores and deletes organizations. Deletion takes a safety backup and removes rows children first; `deleted_organizations` keeps the record.
Acceptance: `tests/e2e/organizations.test.mjs` passes; the platform organization cannot be paused.

**FR-61 (Must)** Packages, entitlements, overrides with reason and expiry, and feature flags.
Acceptance: an organization without the `cashier` flag gets sandbox bills only.

**FR-62 (Should)** Invoices with gap-free numbers (`PREFIX-YEAR-` and six digits), VAT in basis points (0 until finance sets it), add-ons, discounts, credits, paid through MySeed Verify, with billing and provider fee ledgers.
Acceptance: `tests/e2e/billing.test.mjs` passes; refunds never exceed what was paid.

**FR-63 (Must)** Banks and wallets are managed by provider admins: templates, Live check, pilot, certification, connector switch, logo upload (PNG, SVG, JPEG or WebP, 256 KB, type checked, SVG scripts refused), lookup network settings.
Acceptance: an SVG with a script is refused; logos are served with `nosniff`.

**FR-64 (Should)** Support access is granted and ended by the organization; a support desk takes tickets with first-answer targets per package (Starter 24 hours, Growth 8, Enterprise 4, half for urgent).
Acceptance: `tests/e2e/support.test.mjs` passes.

**FR-65 (Should)** Nine platform roles map to areas; a platform owner can change the mapping except owner, read and team.
Acceptance: `tests/e2e/platform-team.test.mjs` passes.

**FR-66 (Should)** Database tools for platform owners and engineers: overview with tenant wall check, vacuum, analyze, reindex, backups with verify, restore after a safety backup, sessions, read-only query (5 seconds, 500 rows, one statement), table export.
Acceptance: `tests/e2e/admin-tools.test.mjs` passes; `COMMIT; ...` in the query box cannot leave the read-only transaction.

**FR-67 (Should)** Onboarding measures, leads, and the public website content edited as data by owners, operations and content roles.
Acceptance: `tests/e2e/site.test.mjs` passes.

**FR-68 (Could)** Referral partners and resellers with codes, commission on paid invoices before VAT (default 10 percent, at most 50, for 12 months by default) and payouts that never exceed what is due.
Acceptance: `tests/e2e/partners.test.mjs` passes.

### 3.10 Operations

**FR-69 (Must)** `GET /health` and `GET /ready` report liveness and database readiness; `GET /metrics` gives Prometheus text with a bearer token.
Acceptance: `/ready` returns 503 when the database is down; `/metrics` without the token is refused.

**FR-70 (Must)** The worker raises alerts for queue age, backlog, connector failures, dead deliveries, silent workers, connections and backup age, and notifies once per opened problem.
Acceptance: `tests/e2e/operations.test.mjs` passes.

**FR-71 (Must)** Nightly whole-database backups into the sealed archive (newest 14 kept) and restore drills into a scratch database that a platform operator signs off.
Acceptance: a drill restores, migrates, counts every table and drops the scratch database; the live database is not touched.

**FR-72 (Should)** A public status page with five parts and incidents written by the platform team.
Acceptance: an open alert on webhooks shows the Webhooks part as degraded.

**FR-73 (Must)** Every 5xx answer is stored with its request ID, and the person sees the request ID.
Acceptance: a forced server error adds a `server_errors` row with the ID shown in the console.

**FR-74 (Must)** Evidence files move to the sealed archive after the hot period (default 90 days) and are deleted after retention (default 5 years); the records stay.
Acceptance: retention and archive tests in the worker and e2e suites pass.

### 3.11 SDKs and developer experience

**FR-75 (Should)** `@myseed-verify/server` creates requests and verifies webhooks.
Acceptance: `packages/sdk-server/test/sdk.test.mjs` passes; a tampered body fails verification.

**FR-76 (Should)** `@myseed-verify/web` uploads, submits and polls in the browser and mounts a payment component (`mountPayment`).
Acceptance: `packages/sdk-web/test/sdk-web.test.mjs` passes.

**FR-77 (Could)** `@myseed-verify/react-native` adapter and `@myseed-verify/academy` builders.
Acceptance: their package tests pass.

**FR-78 (Should)** SDKs publish without the private packages, from an `sdk-v*` tag only.
Acceptance: `npm run sdk:check` passes; the workflow refuses a tag that does not match the package versions.

**FR-79 (Should)** Breaking changes go to a new path; `Deprecation` and `Sunset` are at least six months apart, checked at start-up.
Acceptance: a deprecation entry with a shorter gap stops the API from starting.

### 3.12 Dedicated installs

**FR-80 (Could)** The platform issues a signed license and an install bundle; `DEPLOYMENT=dedicated` refuses to start without a valid license and checks in daily.
Acceptance: an install with a revoked license stops at its next check.

### 3.13 Storefront and commerce

**FR-81 (Could)** Store items with stock per branch and variant, units, weight pricing, modifiers, booking length, per-order limits and branches that sell them.
Acceptance: `tests/e2e/commerce.test.mjs` passes; a paid order takes its stock once.

**FR-82 (Could)** Orders with a full lifecycle, delivery zones, promotion codes, a customer book and orders handed to employees.
Acceptance: an order moves through paid, confirmed, preparing, ready and delivered.

**FR-83 (Could)** QR stands at `/q/<code>` open a store, the bill a cashier last put on the stand, or a purpose's payer page; scans are counted.
Acceptance: changing a stand's target in the console changes what the same printed QR opens.

**FR-84 (Could)** Store themes, UI styles in light and dark, a builder with a live preview of the unsaved design, landing pages and media folders with quotas per package.
Acceptance: `tests/e2e/store-media-styles.test.mjs` and `apps/web/test/design-builder.test.mjs` pass.

**FR-85 (Could)** Each store connects its own Telegram bot with one token: Mini App menu button, commands, webhook guarded by a secret, order messages.
Acceptance: `tests/e2e/storefront-telegram.test.mjs` passes; a webhook call without the secret is refused.

**FR-86 (Could)** Shopper accounts with phone or email and password, Google or Telegram; buying needs a verified phone; carts, follows and recently viewed items are kept on the account.
Acceptance: `tests/e2e/shop.test.mjs` passes.

**FR-87 (Could)** Ratings and reviews only from shoppers with a paid order; owners reply and hide.
Acceptance: a shopper without a paid order cannot review.

**FR-88 (Could)** Vouchers, memberships and auctions.
Acceptance: an expired voucher is refused at checkout.

**FR-89 (Could)** The MySeed Shop lists every listed store with search and filters, in the browser and the Android app.
Acceptance: `tests/e2e/store-browse.test.mjs` passes.

### 3.14 Creative Studio and website builder

**FR-90 (Could)** Creative Studio documents (flyers, posters, logos, menus, cards, video) with templates, brand kits and version history (at most one version every ten minutes, last 30 kept).
Acceptance: `tests/e2e/creative.test.mjs` passes; an older version can be restored.

**FR-91 (Could)** 3D scenes with lights, model import (SketchUp DAE, OBJ, FBX, STL, Sketchfab), motion effects, path animation, walk mode, camera shots, walkthrough recording and STL export.
Acceptance: an imported OBJ model appears in the scene and exports as STL.

**FR-92 (Could)** AI help with the organization's own Anthropic, OpenAI or Gemini key, with a three-step connection test and every run logged.
Acceptance: `tests/e2e/creative-ai.test.mjs` and `store-design-ai.test.mjs` pass; the key never reaches the browser.

**FR-93 (Should)** Public website (landing, guides, coverage, changelog, status, pricing from packages), with a visual website builder, drafts and revisions.
Acceptance: a content change by the content role appears on `/` after publishing.

**FR-94 (Could)** Financial analysis page for people with `payments.view`.
Acceptance: `/app/financial-analysis` is hidden from a person without `payments.view`.

### 3.15 Control panel

**FR-95 (Should)** A local control panel starts and stops services, runs builds, tests and migrations, manages backups and the sandbox, deploys to the VPS, and syncs with Render, Supabase and GitHub.
Acceptance: `npm run test:panel` passes.

### 3.16 Not in this release

**FR-96 (Won't)** SAML single sign-on.
Acceptance: not applicable; listed as open in Phase 12.

**FR-97 (Won't)** A dedicated database per organization inside the shared deployment (Phase 12 exit gate).
Acceptance: not applicable.

**FR-98 (Won't)** Custom domains and white label.
Acceptance: not applicable.

**FR-99 (Won't)** The Amharic console, cashier and payment page interface (Phase 13).
Acceptance: not applicable; Amharic texts stay a draft.

**FR-100 (Won't)** Automatic reassignment of escalated cases, and accounts created on single sign-on.
Acceptance: not applicable.

## 4. Non-functional requirements

### 4.1 Security

**NFR-1 (Must)** Organizations are isolated by query filters and by row-level security (`tenant_wall`).
Acceptance: the cross-organization tests in `tests/e2e/saas.test.mjs` and `security.test.mjs` pass; the Database page shows every tenant table walled.

**NFR-2 (Must)** Stored secrets are sealed with AES-256-GCM under `DATA_ENCRYPTION_KEY`; server keys, sessions and tokens are stored as digests.
Acceptance: no secret appears in clear in the database; the console shows only the last four characters.

**NFR-3 (Must)** Console calls need `X-Console: 1` and a matching Origin; cookies are HttpOnly and SameSite=Strict.
Acceptance: a call without the header is refused.

**NFR-4 (Must)** Outbound calls use https, approved hosts, public addresses only and no redirects.
Acceptance: the lookalike-host and private-address tests in `packages/provider-connectors/test` pass.

**NFR-5 (Must)** Sign-up and contact forms are limited per address (5 an hour by default); the query box and batches are rate limited.
Acceptance: the sixth sign-up in an hour from one address is refused.

**NFR-6 (Must)** Uploaded logos and media have their type checked from their bytes; SVG with scripts is refused; files are served with a sandboxing content policy and `nosniff`.
Acceptance: an SVG with an event handler is refused.

**NFR-7 (Should)** An outside penetration test before the first paying organizations go live, then yearly (`docs/security.md`).
Acceptance: a test report exists. Not found in the repository.

### 4.2 Privacy

**NFR-8 (Must)** Account numbers are kept as HMAC digests under `ACCOUNT_DIGEST_KEY` plus the last four digits.
Acceptance: no full payer account number in observations or readings.

**NFR-9 (Must)** Evidence retention and archive follow the organization's settings (defaults 5 years and 90 days); deleted organizations keep only a deletion record.
Acceptance: FR-74 and FR-60 tests pass.

**NFR-10 (Must)** Public pages, push messages, escalation notices and status incidents name no payer, organization or amount.
Acceptance: the push payload is empty; incident text has no author field.

**NFR-11 (Must)** The web app keeps nothing in browser storage.
Acceptance: a search of `apps/web/src` finds no `localStorage`, `sessionStorage` or `indexedDB` use. The hosted payment page is the one exception found: it keeps the payer's language choice (`tv-lang`) in `localStorage` (`apps/hosted/src/main.ts`). To confirm whether that is intended.

**NFR-12 (Should)** Sent message texts are cleared after 30 days; export tokens are stored as digests.
Acceptance: the message sweep clears texts older than 30 days.

### 4.3 Availability and reliability

**NFR-13 (Must)** Accepted submissions remain trackable through restarts and provider outages; workers stop without losing leases.
Acceptance: the lease recovery test in `tests/e2e/flow.test.mjs` passes.

**NFR-14 (Must)** Daily database backups exist and restore drills run monthly (`docs/runbooks.md`).
Acceptance: the `backup.stale` alert stays closed; a signed-off drill exists. The first drill on the VPS is not recorded in the repository.

**NFR-15 (Should)** A deploy keeps the current release serving while the image builds, and rollback starts the previous release.
Acceptance: `deploy.sh --rollback` restores the previous release and `/health` answers.

### 4.4 Performance

**NFR-16 (Should)** Provider lookups time out at 30 seconds, webhook deliveries at 10 seconds, and OCR is bounded by concurrency and time.
Acceptance: values in `apps/worker/src/context.ts` and the worker tests.

**NFR-17 (Should)** Response time and throughput targets are set from pilot traffic and provider limits.
Acceptance: To confirm; no targets are recorded in the repository.

### 4.5 Phones

**NFR-18 (Must)** Every console page fits the phone width without sideways scrolling; tables become labelled cards; the phone has a bottom tab bar.
Acceptance: browser fixtures at 320, 390 and 1280 pixels pass (`apps/web/test/*.browser.mjs`).

**NFR-19 (Should)** Touch targets are at least 44 pixels and main actions are within thumb reach (Phase 14).
Acceptance: Phase 14 exit gate: five everyday tasks done on a phone without zooming by people outside the build team. Not yet met.

### 4.6 Language and content

**NFR-20 (Must)** The interface is complete in English; Amharic texts exist for reasons, states and the hosted page as a draft; dates follow the organization's calendar mode (`ethiopian-am`, `gregorian`, `both`) in Addis Ababa time.
Acceptance: `packages/messages/test/messages.test.mjs` passes, including leap years and Pagume.

**NFR-21 (Must)** No emoji anywhere in the product or repository.
Acceptance: `npm run check:emoji` passes.

**NFR-22 (Should)** Brand colors pass a contrast check before use.
Acceptance: `packages/ui/test/ui.test.mjs` passes.

## 5. Interface requirements

| ID | Interface | Direction | Purpose | Code |
| --- | --- | --- | --- | --- |
| IR-1 | Public REST API `/v1` | In | Payment requests, evidence, status, batches, settings, channels | `contracts/openapi.v1.json`, `apps/api/src/contract-routes.ts` |
| IR-2 | Webhooks | Out | Signed events to integrators | `apps/worker/src/delivery.ts` |
| IR-3 | Console API `/console/api` | In | Private API for the web app | `apps/api/src/console/*.ts` |
| IR-4 | Bank and wallet receipt pages | Out | Provider records for references | `packages/provider-connectors/src/drafts.ts` |
| IR-5 | Chapa API (`api.chapa.co`) | Out | Verify, list transactions, initialize checkout | `chapa.ts`, `chapa-checkout.ts` |
| IR-6 | ArifPay (`gateway.arifpay.net`) | Out | Checkout session lookup | `merchant-apis.ts` |
| IR-7 | YaYa Wallet API | Out | Signed transaction lookup | `merchant-apis.ts` |
| IR-8 | SMTP with TLS | Out | Email | `apps/worker/src/transports.ts` |
| IR-9 | AfroMessage (`api.afromessage.com`) or HTTPS SMS endpoint | Out | Text messages | `transports.ts` |
| IR-10 | Web Push (VAPID) | Out | Staff notifications | `apps/worker/src/push.ts` |
| IR-11 | Telegram Bot API (`api.telegram.org`) and webhook `/telegram/webhook/:orgId` | Both | Store bots and Mini App | `packages/persistence/src/telegram.ts` |
| IR-12 | Google OAuth | Out | Shopper sign-in | `apps/api/src/console/shop.ts` |
| IR-13 | OpenID Connect providers | Out | Staff single sign-on | `apps/api/src/console/sso.ts` |
| IR-14 | Anthropic, OpenAI, Google Gemini | Out | Studio and store builder AI | `apps/api/src/console/ai/*.ts` |
| IR-15 | Sketchfab API | Out (from the browser) | 3D model search and download | `apps/web/src/pages/design-builder.tsx` |
| IR-16 | OpenStreetMap embed | Out (from the browser) | Store maps | `apps/web/src/pages/store-customer.tsx` |
| IR-17 | S3-compatible storage | Out | Receipts and archive | `packages/storage/src/s3.ts` |
| IR-18 | Relay API `/relay/jobs` | In | Phone, extension and agent relays | `apps/api/src/relay.ts` |
| IR-19 | License check `/license/check` | In (from dedicated installs) | License status | `packages/persistence/src/license.ts` |
| IR-20 | Metrics `/metrics`, health `/health`, `/ready` | In | Monitoring | `apps/api/src/app.ts` |
| IR-21 | npm registry, GitHub Container Registry, GitHub Actions | Out | SDK and image publishing, CI | `.github/workflows/*.yml` |
| IR-22 | Hostinger VPS (SSH), Render, Supabase | Out (from the control panel) | Deploy and optional hosting | `control-panel/providers.py`, `deploy/vps` |
| IR-23 | Tesseract binary | Local | OCR | `packages/evidence/src/tesseract.ts` |

## 6. Data requirements

| ID | Rule |
| --- | --- |
| DR-1 | Money is stored as integer minor units and sent as decimal strings at the API boundary |
| DR-2 | A provider transfer has one canonical identity per organization, provider and reference namespace; it can be accepted once, and a request can have at most one acceptance |
| DR-3 | Every tenant table has `organization_id` and the `tenant_wall` policy |
| DR-4 | Request items and reference rules are fixed once evidence is submitted |
| DR-5 | Receiving accounts are stored as digests under `ACCOUNT_DIGEST_KEY` with the last four digits in clear; changing that key breaks matching |
| DR-6 | Secrets are sealed with `DATA_ENCRYPTION_KEY`; only the last four characters are shown |
| DR-7 | Evidence retention per organization: 30 days to 10 years (default 5 years); hot period 7 to 3,650 days (default 90) |
| DR-8 | Invoice numbers are `PREFIX-YEAR-` plus six digits, gap-free per calendar year; VAT is in basis points, applied after discounts and before credits, rounded half up |
| DR-9 | Test payments never count toward usage, alerts or invoices (`billable_acceptances`) |
| DR-10 | Deleted organizations leave a `deleted_organizations` record without `organization_id` |
| DR-11 | Sent message texts are cleared after 30 days; export links expire after 7 days |
| DR-12 | CSV exports write formula-like cells as text and start with a byte-order mark |
| DR-13 | Schema changes only through new numbered migrations; applied migrations never change; template migrations are generated from `drafts.ts` |
| DR-14 | Backups use the format of `scripts/db-backup.mjs` (exact JSON) and are kept in the sealed archive |

## 7. Open requirements

| ID | Open item | What blocks it |
| --- | --- | --- |
| OR-1 | Certify each bank and wallet method with real receipts and switch its connector on | Real receipts and, for merchant APIs, organizations' live keys |
| OR-2 | Performance targets (admission latency, time to decision, throughput) | Pilot traffic measurements |
| OR-3 | Evidence retention period confirmed with legal counsel | Legal review (decision 57) |
| OR-4 | VAT rate, seller TIN and invoice account set by finance | Finance review (decision 53) |
| OR-5 | Penetration test before the first paying organizations | Choice of testers and a sandbox deployment |
| OR-6 | First restore drill on the VPS signed off | A platform operator running it |
| OR-7 | Outside monitoring of `/health` and `/ready` | Operator choice of a monitoring service |
| OR-8 | npm publication of the SDKs under `@myseed-verify` | npm scope registration and the `NPM_TOKEN` secret |
| OR-9 | Real-device checks of the hosted page, console and cashier on Android and iOS | A device matrix |
| OR-10 | Phase 11 exit gate: three outside organizations live without help | Real organizations onboarding |
| OR-11 | Phase 12: SAML, dedicated database per organization, custom domains and white label | Not started |
| OR-12 | Phase 13: Amharic interface reviewed by MySeed | Not started |
| OR-13 | Phase 14: clean mobile experience exit gate | In progress |
| OR-14 | Scope and ownership of the storefront, marketplace and Creative Studio modules | Product decision; not in the master roadmap |
