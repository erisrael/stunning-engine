# Transaction Verify documentation

Transaction Verify is the working name for a service that confirms payments with Ethiopian banks, wallets, and gateways, then tells the integrating business what it can safely do next. Myseed Verify is an internal deployment for Myseed Academy. The independently operated commercial deployment serves paying organizations and privately invited free partners.

| Start here | What it defines |
|---|---|
| [System and repository architecture](architecture.md) | Runtime components, code ownership, processing, security, database gaps, and deployment boundaries |
| [Product and UI specification](product-ui.md) | User journeys, roles, screen inventory, feedback, and the emoji-free interface |
| [UI guidelines](ui-guidelines.md) | Principles, tokens, type, components, writing, accessibility, the no-emoji rule, and tenant theming from a logo |
| [Progressive web apps](pwa.md) | Hosted page, cashier and console PWAs, caching rules, offline behavior, manifest, and release checks |
| [Quickstart: a signed sandbox webhook](quickstart.md) | For a new developer: a test key, a webhook, the SDKs, and a paid sandbox request with its signed webhook in about half an hour |
| [API versions and deprecation rules](api-versioning.md) | What counts as breaking, how deprecations are announced (Deprecation and Sunset headers), notice periods, SDK versions |
| [Integrations and SDKs](integrations-sdk.md) | API behavior, authentication, SDK build and release, webhook handling, and integration recipes |
| Draft OpenAPI contract (`contracts/openapi.v1.json`) | The first implementable slice for creating requests, submitting evidence, checking status, and receiving acceptance |
| [Payments and provider coverage](payments-providers.md) | External payments, optional checkout, commercial billing, partners, and provider certification |
| [Roadmap and demo gates](roadmap.md) | Build order, release criteria, test scenarios, and documentation deliverables |
| [Employees, branches and the cashier](branches-and-cashier.md) | Inviting people, limiting them to branches, taking payments at a counter, and what each bank needs (QR, link or transaction ID) |
| [Storefront, QR stands, branches and the builders](commerce-and-builders.md) | Branch and purpose details, QR stands that open a menu, a bill or a purpose, storefront stock, delivery, promotions and orders, the builder kit, the Creative Studio and the API documentation |
| [storefront-marketplace.md](storefront-marketplace.md) | Shopper accounts, the MySeed Shop app, store landing pages and templates, vouchers, memberships and auctions |
| [storefront-benchmark.md](storefront-benchmark.md) | What Shopify, Amazon, Jumia, Etsy, Temu and Glovo do, feature by feature, and where MySeed stands: built, already had, or later |
| [Creative Studio specification](creative-studio/README.md) | The design, motion, sound and 3D studio: architecture, the saved document format, the timeline and sound engine, materials, models and Blender controls, scripts and the sandbox, the AI assistant, and the roadmap for a larger studio |
| [Platform admin guide](platform-admin.md) | For MySeed platform staff: roles, reviewing a new organization with the business verification checklist, approval, packages, overrides and support access |
| [Billing rules and finance runbook](billing.md) | How invoices are worked out (package, usage, add-ons, discounts, VAT, credits), numbering, paying through MySeed Verify, refunds, provider fees and the monthly reconciliation |
| [Staff console guide](console.md) | Sign-in with two-step codes, roles, review queue, receiving accounts, deliveries, reconciliation, messages to payers and staff, exports for finance, roles and permissions, the data page, how a payment was checked, retention |
| [Operations runbooks](runbooks.md) | For the platform team on call: what to do for each alert, monitoring from outside, monthly restore drills |
| [Incident guide](incident-guide.md) | Severity, the first 15 minutes, status page updates, closing and review, data breach duties, recovery estimates |
| [Customer success and support playbook](customer-success.md) | For the platform team: the six onboarding steps, the weekly routine on the Onboarding page, answering tickets, common answers, organizations in trouble |
| [Launch communications](launch-communications.md) | For the platform team: what the launch says, the checks a week before, the order of announcements and the ready-to-send texts |
| [Offboarding an organization](offboarding.md) | Handing over the organization's data, the 30-day delete date, the deletion record, what is kept |
| [Security](security.md) | What is encrypted with which key, rotating DATA_ENCRYPTION_KEY, the penetration test scope |
| [Decision log](decisions.md) | The answered open questions: hosting, database, storage, settings defaults, channels, calendar, SDK names, Kalon theme |
| [Deploy on the Myseed VPS](../deploy/vps/README.md) | transactionverify.myseed.com.et next to myseed.com.et: containers, shared Caddy, DNS, backups, roll back |
| [Database model](../database/README.md) | Existing PostgreSQL migration, diagram, and database verification script |
| [Run Tesseract OCR](../packages/evidence/README.md) | Local OCR adapter, command-line runner, and worker integration instructions |

## Repository layout

| Path | Contents | Status |
|---|---|---|
| `apps/api` | Fastify API. Routes, validation and credentials come from the OpenAPI contract; the seven payment operations plus organization settings and channels on PostgreSQL; local upload route; serves the hosted page at `/pay/` in the Myseed or Kalon theme | Phase 2, sandbox |
| `apps/worker` | Extract (QR, link, reference, PDF text), OCR, provider lookup under leases, outbox and signed webhook delivery with retries and safe egress | Phase 2, sandbox |
| `apps/hosted` | Hosted payment page: summary with accepted channels, Upload / Scan QR / Paste link, progress, result; adapts to touch or desktop; English and Amharic with Ethiopian calendar dates; service worker caches code only | Phase 2 |
| `apps/web` | Kalon web app at `/`: landing page, sign-in, sign-up, guides, the organization console under `/app` (home, payments as list, board or table, review queue, accounts, deliveries, reconciliation, package and billing, people, developers, settings, audit, profile and appearance) and the platform admin under `/app/platform`. React, Tailwind CSS, shadcn-style components on Radix | Built |
| `apps/cashier` | Cashier: built as the Cashier page of the web app (`/app/cashier`), with terminal mode, Not sent queue and per-organization install | Phase 4, built |
| `apps/cashier-android` | Cashier phone app: the cashier page in a native Android shell (Capacitor) that can check receipts over the phone's own data connection as the organization's phone relay. Not an npm workspace; built on its own | Built, sideload APK |
| `apps/relay-extension` | Chrome and Edge extension that makes a shop computer's browser a relay for its organization's bank checks; served as a zip at `/relay/extension.zip` | Built |
| `control-panel` | Control panel (Python standard library): local services, migrations, backups, sandbox, checks, GitHub, Hostinger VPS deploy, Render, Supabase sync | Built |
| `packages/domain` | Money in exact minor units, reason codes matching `accept_payment`, statuses, allocation rules | Built |
| `packages/contracts` | TypeScript types generated from the contract, and the contract loader | Built |
| `packages/messages` | English and Amharic texts for every reason, state and hosted-page label; Addis Ababa time; Ethiopian calendar | Built; Amharic is a draft for review |
| `packages/ui` | Myseed Verify and Kalon Transaction Verify themes, logo palette extraction, tenant theme derivation with contrast checks, `tokens.css` and `kalon.css` | Built |
| `packages/storage` | Private receipt storage: local disk with signed upload tickets, or S3-compatible (SigV4) | Built |
| `packages/evidence` | File checks, QR decoding, PDF text, Tesseract OCR adapter | Built |
| `packages/provider-connectors` | Connector interface and registry, recipient digests, the synthetic sandbox provider | Built |
| `packages/persistence` | Pool, transactions, migration runner, rate limits, encrypted secrets, organization settings and channel rules, sandbox seeding | Built |
| `packages/sdk-server`, `packages/sdk-web`, `packages/sdk-myseed` | `@myseed-verify/server` (Node client and webhook verification), `@myseed-verify/web` (browser upload, submit and polling), `@myseed-verify/academy` (Myseed address and academy payment builders) | Built, not published |
| `packages/sdk-mobile` | React Native adapter | Planned (Phase 4) |
| `database` | Numbered SQL migrations and the model verification script | 001 to 009 |
| `tests/e2e` | Full journeys on a real PostgreSQL 17 with API, workers, console and a webhook receiver | 28 scenarios |
| `deploy/vps`, `Dockerfile`, `render.yaml` | VPS scripts (prepare, settings, deploy, roll back, backup), the image for API, workers and migrations, and the optional Render blueprint | Built; first deploy pending |
| `scripts` | setup, local database, backups, sandbox, no-emoji check | Built |
| `ops` | Docker compose for PostgreSQL and MinIO (optional; the embedded database needs no Docker) | Optional |

The folder `Transaction Verify/` is a git-ignored local resource store (reference panels, artifact copies).

## Develop

Requires Node 24 and Python 3.10+.

```sh
npm ci && npm run build
npm run panel                # http://verify.localhost:8767 and follow the Overview checklist
npm run check                # no-emoji scan, build, unit tests and end-to-end tests
```

Without the panel: `npm run setup`, `npm run db:start` (leave running; stop with `npm run db:stop`), `npm run db:migrate`, `npm run sandbox:seed`, `npm run dev:api`, `npm run dev:worker`, then `npm run sandbox:pay -- --key <server key>`. After editing the contract, run `npm run generate:contract`.

Sandbox payments use synthetic references, for example `SYN-1000` (confirmed ETB 1,000.00), `SYN-0800` (amount mismatch), `SYN-WRONG` (different receiving account) and `SYN-DOWN` (provider unavailable). The full list is in [examples/README.md](../examples/README.md).
