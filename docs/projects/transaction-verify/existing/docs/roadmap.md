# Build roadmap and release gates

> Phase numbers now come from `docs/MySeed Verify master roadmap v5.md` (phases 0 to 12, decision 21; Phase 13 Amharic and Phase 14 clean mobile experience were added at the end, decisions 47 and 75). The six stages below are kept for history: stages 1 and 2 are built, stage 3 closes in phases 2 and 3, and stages 4 to 6 spread across phases 4 to 11. Status per phase is tracked in the plan artifact.

The order below starts with a complete sandbox integration, then adds real provider evidence and private pilot traffic. Progress is gated by working demos and test evidence.

| Stage | Build | Exit criteria |
|---|---|---|
| 1. Foundation and contracts | Workspace setup, PostgreSQL migration runner, storage adapter, authentication boundaries, reason catalog, API and event contracts, synthetic provider | One local command starts the sandbox. Migration checks pass. Client and server agree on the contract, scope, and exact amounts. |
| 2. First end-to-end slice | API intake and status, upload reservation, QR/link/PDF extraction, durable jobs, first OCR adapter, acceptance, outbox, and Node/browser SDKs | A web demo submits evidence, shows precise feedback, and applies one acceptance to a fake subscription. Repeat submission and event delivery produce one business action. |
| 3. Myseed private pilot | Academy adapter, payment purposes, reconciliation, staff review, receipts, and first certified providers chosen from the academy's actual accounts | Authorized test receipts cover fixed and open amounts, course installments, refunds or reversals, pending providers, and duplicates. Academy staff can resolve exceptions and reconcile totals. |
| 4. Merchant and SDK integration | POS flow, mobile SDK, browser embed, integration console, status recovery, batch intake, and full developer sandbox docs | External demo app and cashier flow complete without internal access. Mobile interruption resumes cleanly. Two cashiers submitting the same transfer get one acceptance. |
| 5. Private commercial pilot | Tenant onboarding, receiving-account approval, paid entitlement, private partner grants, usage and invoice reconciliation, webhook tools | Two organizations and a free partner pass read isolation and shared-load tests. Billing and entitlement changes are idempotent. Operators can replay a failed delivery safely. |
| 6. Commercial release and provider expansion | Hosted billing checkout if selected, production monitoring, restore drills, provider certification, SDK distribution, customer documentation | Checkout can be verified through the provider and reconciled where enabled. Each listed channel passes its certification gate. Operational capacity, data retention, and response targets have owners. |

## Phased delivery plan

Phases 1 to 6 match the stages above. Phase 0 locks the baseline. UI ([guidelines](ui-guidelines.md)), PWA ([plan](pwa.md)) and provider coverage run as tracks inside every phase. Week estimates are planning sizes for one small team, not commitments.

| Phase | Estimate | Key tasks beyond the stage table | Ships |
|---|---|---|---|
| 0. Baseline and UI system | 2 weeks | Done: design documents, migration 001 and its verification script, OCR adapter, OpenAPI draft, UI guidelines, no-emoji rule, Myseed theme and logo theme engine, PWA plan. Open: approve guidelines and tokens, record hosting, identity and storage decisions, collect Myseed receiving accounts, start the coverage register, draft data handling rules. | UI guidelines v1, PWA plan v1, decision log |
| 1. Foundation and contracts | 3 to 4 weeks | Workspace with `apps/hosted` and `apps/cashier`, CI with the no-emoji check, migration runner, migration 002 for upload reservations and idempotency, storage adapter, keys, tokens and staff sign-in, shared reason catalog in en and am, generated contract types, synthetic provider, `packages/ui` tokens and tenant theme loader. | Local setup guide, reason catalog |
| 2. First end-to-end slice | 5 to 6 weeks | All seven v1 operations, extract, OCR, lookup and outbox workers, migration 003 for status projection, delivery attempts and fulfillment revisions, Node and browser SDKs, hosted page with every result state, hosted page PWA shell. | API and webhook reference, quickstarts |
| 3. Myseed private pilot | 6 to 8 weeks | Myseed adapter, Myseed console with side-by-side review, migration 005 for account approvals and per-check observations, reconciliation and reversals, installable console with review push, first certified channels, Amharic review, retention and restore tests. | Myseed operator guide, provider register entries, data handling specification |
| 4. Merchant and SDK integration | 6 weeks | Cashier PWA with camera QR and offline capture marked "Not sent", prior-use details by permission, React Native adapter, browser embed, developer console, batch intake. | SDK compatibility notes, merchant operator guide |
| 5. Private commercial pilot | 6 weeks | Tenant onboarding, logo branding with contrast gate and approver, per-tenant manifest and icons, migration 006 for theme records, entitlements, usage and invoices, partner grants, webhook replay and key rotation. | Partner and billing guides |
| 6. Commercial release | Ongoing | Checkout if selected, monitoring and restore drills, per-channel certification and a public coverage page, SDK distribution, customer documentation, benchmarks. | Runbooks, acceptance reports |

Additional documentation deliverables: UI guidelines and no-emoji rule (design, ready when Myseed approves and tokens are frozen), PWA plan (frontend, ready when security reviews the caching rules), and a decision log (product, ready when every open decision has an owner and date).

### Status on 10 November 2026

| Phase | State | Evidence | Still open |
|---|---|---|---|
| 0 | Done except the account list | Documents, migration 001, OCR adapter, contract draft, UI guidelines, no-emoji rule, theme engine, PWA plan; all 16 open questions answered and recorded in the [decision log](decisions.md); guidelines approved with a separate Kalon theme | Myseed receiving account list; coverage register entries per channel |
| 1 | Done except CI on GitHub and lint | Workspace, no-emoji check, checksummed migration runner, migration 002, storage adapter (local and S3), keys and request-scoped tokens, reason catalog in en and am, generated contract types, synthetic provider, one-command local stack (control panel or `npm run db:start`), `packages/ui` tokens | First CI run on GitHub; OpenAPI lint; staff sign-in moves to Phase 3 with the console |
| 2 | Gate met in the sandbox; deploy built | All seven operations; extract, OCR, provider, outbox and webhook workers; migration 003; Node and browser SDKs; hosted page with every result state; PWA shell. The academy demo activates a subscription once from a synthetic receipt; `tests/e2e` proves repeat submissions and webhook redelivery give one business action, plus leases, retries, 429 and token scope. Added after the answers: migration 004 (organization settings, 43-channel catalog, accepted channels), the settings and channel API, Ethiopian calendar dates, device-adaptive hosted page, Kalon theme, `@kalon/*` SDK names with the Myseed sub-SDK, and the VPS deploy for transactionverify.myseed.com.et with control panel VPS, Render and Supabase pages | First VPS deploy (DNS record and the Myseed Caddy patch first); hosted page on real Android and iOS devices; OCR with Tesseract; the end-to-end suite on CI |

| 3 | In progress | Migration 005 (staff credentials and sessions, review evidence, receiving account changes, retention markers); staff console API and installable console at `/console/`: built-in sign-in with two-step codes and recovery codes, roles, dashboard, payments, review queue side by side with evidence-backed decisions that run the normal acceptance, receiving accounts approved by a second admin, stopped-webhook replay, reconciliation by day and purpose with CSV, staff invitations and resets, settings and channels, audit log; evidence retention job; `org:create` and `console:admin` bootstrap, also from the control panel on the VPS; migration 006: refunds and reversals through `record_adjustment` (never more than paid, idempotent by bank reference, `payment.adjusted` webhook), bank statement matching, review queue Web Push; migration 007: each request freezes the accounts it may be paid into. 13 console and money end-to-end journeys. [Operator guide](console.md) | Certified connectors for the seven first channels (needs authorized provider access and fixtures); restore drill on the VPS; statement layouts checked against real Myseed bank exports; console checks on real devices |

Run the coverage inventory alongside stages 1 through 6. The target remains every Ethiopian channel with a functional, authorized verification method. Publish support per channel and record known gaps. Pilot scope depends on the verified channels used by the pilot organizations.

### Status on 11 November 2026: Kalon platform

Kalon is the product, on the same address as Myseed. Built this round:

- **Web app** (`apps/web`) with a landing page, sign-in, sign-up, guides and the console rebuilt in React with shadcn-style components.
- **Self-service sign-up** with approval, and **developer keys and webhooks** managed by each organization.
- **Platform admin:** organizations, packages, banks and wallets with connectors, and invoices.
- **Licensed dedicated installs** for an organization's own server or database (migration 009).

Phases 4 to 6 now show what is built and what remains in the plan page.

### Status on 14 November 2026: master roadmap v5, Phase 11

Phases 6 to 10 of the [master roadmap](master-roadmap-v5.md) are built. Phase 11 (public launch) already had pricing generated from packages, the coverage and changelog pages, the setup guide and leads. Added: the **support desk** (migration 032). Any organization opens tickets under Help and support. Each package promises a first answer within a set time: Starter 24 hours, Growth 8, Enterprise 4, and half that for an urgent ticket. The MySeed Verify team answers under Platform, Support tickets, with overdue tickets first and the share of first answers given on time. Also added: **onboarding conversion measures** under Platform, Onboarding: for organizations that signed up in the last 30, 90 or 365 days, how many reached each step (approved, receiving account, first payment request, first live payment, first invoice paid), the typical time to each, who is stuck on which step and for how long, and the exit gate count: organizations live without help (no support ticket or support access before their first live payment), target three. The [customer success and support playbook](customer-success.md) and [launch communications](launch-communications.md) are written. Still open for Phase 11: sending the launch announcements and meeting the exit gate with real organizations.

### Status on 14 November 2026: Phase 12 started

**Single sign-on** with OpenID Connect is built (migration 033, decision 78): on Enterprise, admins connect their identity provider under Settings, Security; people already invited sign in through it, and password sign-in can be kept for admins only. **Automation rules** are built too (migration 034, decision 79): under Settings, Automation, admins route review cases to people and notify people or roles when a payment matches an event, amount, branch or bank; rules never decide a payment. **Reseller and referral partners** are built (migration 035, decision 80): partner codes and sign-up links, commission on paid invoices before VAT, payouts, and a Partner program page for the partner's own organization. Still open in Phase 12: SAML, the dedicated database per organization (the exit gate), and custom domains and white label.

### Phase 14 (added 14 November 2026): clean mobile experience

Added at the end of the plan, after Phase 13 (decision 75). The goal is a cleaner interface that is easy to use on a phone, in the browser and as the installed app, for every role.

| Task | What it means |
|---|---|
| Phone audit | Check every screen at 360 px wide on a mid-range Android phone: no sideways scrolling, no zooming, nothing hidden behind the bottom bar |
| One main action per screen | Each screen leads with the one thing the person came to do; the rest moves into a More menu or a sheet |
| Lists instead of wide tables | Payments, review, accounts, people, tickets and invoices show as short cards on phones, with the key amount and status first |
| Touch and reach | Touch targets of at least 44 px, primary buttons in thumb reach, a sticky action bar for Accept, Reject and Send |
| Bottom tabs by role | Cashier, reviewer, admin and platform staff each get their own four most used places |
| Cashier Scan QR first | Built 14 November 2026: one Scan QR button on the cashier; choose the bank, the camera opens at once, the result fills the screen, and Scan next receipt opens the camera again. Paste link, transaction ID and upload are under one link below it |
| Cashier result in the iOS style | Built 14 November 2026: large result with its own color per state, Already used apart from Not paid, Show details for every result except Paid, grouped lists, recent bills as a list on phones, the next action fixed at the bottom |
| Simpler forms | Fewer fields per step, number keypads for amounts, camera first for receipts, sheets instead of dialogs |
| Quieter look | Fewer borders and badges, one spacing scale, calmer colors, clear empty and loading states |
| Speed on phones | Fast first load on a slow mobile connection, pages kept warm when switching tabs |

Exit gate: five everyday tasks (take a payment at the counter, decide a review case, approve a receiving account, open a support ticket, read the home page) each done on a phone without zooming or help, by people outside the build team. Demo: the five tasks on a phone. Guide: mobile use notes.

## Console experience track

The staff console is where Myseed and later each commercial customer spend their day, so it gets its own track inside Phases 3 to 5. The look follows the approved direction: a work-management layout like the Kalon theme, used by both products, each in its own colors.

| Step | What | State |
|---|---|---|
| 1. Work-management shell | Collapsible sidebar with workspace, search and sections; top bar with breadcrumbs, notifications and light or dark; Ctrl+K command palette for pages, actions and payment search; line icons only | Built (10 November 2026) |
| 2. Views | Payments as a list grouped by status (collapsible groups) or a board with a column per status; payment page with details on the left and an activity column on the right | Built |
| 3. Appearance | Personal theme (device, light, dark), accent color, density and sidebar, saved to the account (migration 008); organization branding by admins: logo upload, colors suggested from the logo, brand color through the contrast gate, logo in the sidebar | Built |
| 4. Saved views and filters | Save a filter and view as a named list in the sidebar ("Course fees this month", "Waiting over 1 day"); share it with the organization | Next |
| 5. Work assignment | Assign review items to a reviewer, "Assigned to me" view, due times for reviews, assignee avatars on tiles and rows | Next |
| 6. Conversations | Comments and @mentions on a payment, shown in the activity column and the notification center | Next |
| 7. Notification center | In-app inbox of mentions, assignments, stopped webhooks and account approvals, with read state; the push notice opens it | Next |
| 8. Bulk and keyboard | Select many rows for export or replay; keyboard navigation (J and K to move, Enter to open, E to decide) | Next |
| 9. Tables your way | Choose, order and resize columns per list; CSV export of any list | Next |
| 10. Dashboard widgets | Arrange and choose dashboard cards per person; purpose, account and branch breakdowns; trend lines | Built (12 Nov 2026) |
| 11. Amharic console | Every console text in Amharic, reviewed by Myseed staff, with Ethiopian calendar dates | Moved to the end: Phase 13, after every other phase (12 Nov 2026) |
| 12. Branded payment page | The organization's logo and brand color on the hosted payment page and its installed icon | Phase 4 |
| 13. Workspaces | Kalon customers with several organizations switch workspaces from the sidebar header | Phase 5 |

## Demo and test inventory

| Demo | Evidence to capture |
|---|---|
| Myseed subscription and fees | Create payment, upload QR-bearing receipt, activate the correct period or installment, issue one receipt, and retry after a dropped response. |
| Donations, fundraising, and sponsorship | Accept an open donation, post to the selected campaign, preserve public anonymity, reconcile a reversal, and display the resulting total. |
| Restaurant checkout | Scan a receipt, confirm the bill and receiving account, then scan it on another till. Show prior acceptance date and time to authorized staff. |
| Feedback and retries | Demonstrate unreadable uploads, unsupported links, wrong recipient or amount, altered receipt fields, missing data, provider outage, throttling, and corrected evidence. |
| Browser and mobile SDKs | Install packed SDKs in fresh example apps. Show scoped client access, direct upload, camera permission fallback, expired-token renewal, and interrupted-network recovery. |
| Webhook recovery | Crash a consumer after recording an event, redeliver the same ID, rotate signing keys, reject invalid signatures, and reconcile delayed actions. |
| Concurrency and bulk upload | Run interactive traffic alongside a large batch. Measure queue age by organization, provider concurrency, OCR saturation, lease recovery, 429 responses, and duplicate claims. |
| Commercial billing and free partner | Verify an invoice payment, prove duplicate gateway callbacks apply one entitlement, and demonstrate a private partner consuming quota at zero fee. |
| Security and operations | Attempt cross-organization access, unsafe QR links, oversized files, stale leases, and invalid callback endpoints. Restore a backup in an isolated environment and verify reconciliation. |

Measure admission latency, time to decision by provider, queue wait, completed receipts per minute, and end-to-end fulfillment time. Set thresholds from pilot traffic and provider limits. Repeat benchmarks with both QR-heavy and OCR-heavy workloads, with a slowed provider, and during a worker restart.

## Documentation deliverables

| Document | Owner at build time | Ready when |
|---|---|---|
| Product requirements and feedback catalog | Product and design | Each state and retry action maps to the API and UI |
| API and webhook reference | API team | Examples pass schema and integration tests |
| SDK quickstarts and compatibility notes | SDK team | Fresh Node, web, and mobile installs run the sandbox examples |
| Provider register and connector runbook | Integration team | Sources, access terms, test fixtures, and support status are recorded per channel |
| Myseed and merchant operator guides | Product and operations | Staff can resolve exceptions, look up reuse, and reconcile payments |
| Private partner and billing guides | Commercial operations | Eligibility, approval, limits, and invoice exceptions can be audited |
| Deployment, monitoring, and incident runbooks | Operations | Workers, providers, storage, keys, and backups have tested recovery procedures |
| Data handling and access specification | Security and product | Roles, evidence access, retention, deletion, and export are tested |
| Demo scripts and acceptance reports | QA | Each release gate links to a reproducible demo or measured test |

The first implementation milestone is a sandbox vertical slice with one synthetic provider, one payment request, one accepted submission, one signed webhook, and a web SDK example. The first live pilot follows after Myseed's account list and authorized provider methods are established.
