# Transaction Verify product overview

> [!NOTE]
> Written from the code, configuration and git history at commit `3435810` (20 November 2026). Transaction Verify is the repository and working name. Users see the product as **MySeed Verify** (decision 22 in the [decision log](../existing/docs/decisions.md)). "Kalon" is a retired product name that still appears in code as a theme name (`PRODUCT_THEME=kalon`).

## 1. The problem it solves

Ethiopian businesses take payments by bank transfer, mobile wallet and payment gateway. The payer usually shows a receipt, a screenshot, a QR code or a transaction number, and staff check it by hand. That is slow, and it is easy to fool: an edited screenshot, the same receipt shown twice, money sent to someone else's account, or a transfer that is still pending.

Transaction Verify confirms each payment against the bank's or wallet's own record. It ties the money to one bill, refuses a transfer that already paid another bill, and tells the business's own system what it can safely do next (activate a subscription, release an order, or send the case to a person).

> [!IMPORTANT]
> A receipt reading (QR, link, PDF text or OCR) never accepts a payment on its own. Money is accepted only by the database function `accept_payment`, after a provider record confirms it or a reviewer decides. See decision 29 in the [decision log](../existing/docs/decisions.md).

## 2. Who uses it

| Role | Who they are | What they do | Where |
| --- | --- | --- | --- |
| Payer | A customer, student, donor or shopper | Pays the organization, then uploads a receipt, scans its QR, pastes a link or types the transaction ID | Hosted payment page `/pay/`, store pages `/store/<id>`, QR stands `/q/<code>` |
| Organization admin | Owner or manager of a customer organization | Sets up receiving accounts, people, roles, branches, settings, keys and webhooks; pays MySeed invoices | Console `/app` |
| Reviewer | Finance or operations staff | Decides payments in the review queue with the evidence side by side | `/app/review` |
| Operator (cashier) | Counter staff | Takes payments at the counter, scans receipts, uses shared terminals | `/app/cashier`, cashier Android app |
| Viewer | Anyone who only reads | Sees payments and dashboards | `/app` |
| Custom role | Any set of the 20 console permissions | Up to 50 roles per organization (`apps/api/src/console/permissions.ts`) | `/app/roles` |
| Developer | Engineer at the integrating business | Uses server keys, webhooks, the sandbox, batches and the SDKs | `/app/developers`, `/v1/...` |
| Platform team | The MySeed Verify team (its own platform organization) | Approves organizations, runs packages, billing, banks and wallets, support, operations and the website. Nine platform roles: owner, operations, provider admin, finance, support, sales, content, engineer, security auditor | `/app/platform/...` |
| Shopper | A person with a MySeed shopping account | Browses stores, orders, pays, reviews, follows stores | `/shop`, MySeed Shop Android app, store Telegram bots |
| Partner or reseller | A referral partner organization | Refers organizations and earns commission on paid invoices | `/app/partner` |
| Dedicated install operator | An organization running its own licensed copy | Runs the published image on its own server or database | Install bundle from the platform |

## 3. Modules and main screens

| Module | What it does | Main screens and routes |
| --- | --- | --- |
| Verification API | Payment requests, submission tokens, uploads, evidence, status, batches, fulfillment reports, organization settings, channels | `/v1/...` (13 operations in `contracts/openapi.v1.json`) |
| Hosted payment page | Payer page: summary, accepted channels, Upload, Scan QR, Paste link, progress and result; touch or desktop layout; Pay with Chapa | `/pay/` (`apps/hosted`) |
| Evidence reading | QR decoding, PDF text, Tesseract OCR, receipt templates, field reading | Worker stages `extract` and `ocr` |
| Provider verification | Official receipt pages, merchant APIs (Chapa, ArifPay, YaYa), synthetic sandbox bank, pilot mode, circuit breaker, provider health | Worker stage `provider`, `packages/provider-connectors` |
| Lookup network | Relays that fetch bank pages reachable only inside Ethiopia: cashier phone app, Chrome and Edge extension, Node agent | `/relay/jobs`, `/app/platform/lookup-network` |
| Webhooks | Outbox, signed deliveries, retries, replay | `/app/deliveries` |
| Staff console | Home, payments (list, board, table), payment page with checks, review queue, receiving accounts, deliveries, reconciliation, refunds, statement matching, audit log | `/app`, `/app/payments`, `/app/review`, `/app/accounts`, `/app/reconciliation`, `/app/audit` |
| Cashier | Bills, Scan QR without a bill, terminals for shared devices, Not sent queue, phone and computer relays | `/app/cashier` |
| Organization admin | People, roles and permissions, branches and purposes, settings, channels, single sign-on, automation rules, messages, exports, data tools, appearance | `/app/staff`, `/app/roles`, `/app/organization`, `/app/settings`, `/app/data` |
| Billing | Packages, usage, add-ons, discounts, VAT, invoices paid through MySeed Verify, partner commission | `/app/billing`, `/app/platform/invoices` |
| Platform admin | Organizations and their review, trash, packages, banks and wallets, transfer routes, logos, feature flags, support access, team, roles, database, operations, website, leads, partners, onboarding, support tickets | `/app/platform/...` |
| Developer platform | Server keys, webhooks per environment, test payments, sandbox references, API documentation, SDKs | `/app/developers`, `/docs/api` |
| Storefront and commerce | Catalog, stock, variants, delivery zones, promotions, orders, QR stands, store themes and builder, store media, Telegram bot and Mini App | `/app/storefront`, `/app/counter-qr`, `/store/<id>`, `/q/<code>`, `/track/<token>` |
| Shopper marketplace | Shopper accounts (password, Google, Telegram), MySeed Shop, carts, follows, reviews, vouchers, memberships, auctions | `/shop`, `/shop/...` |
| Creative Studio | 2D design, motion, sound, 3D scenes, scripts in a sandbox, AI with the organization's own key | `/app/creative-studio`, `/app/studio` |
| Public website | Landing, guides, coverage, changelog, status page, sign-up and sign-in, all content edited as data | `/`, `/docs`, `/coverage`, `/changelog`, `/status`, `/signup`, `/login` |
| Operations | Alerts, metrics, nightly backups, restore drills, status page, server errors with request IDs | `/app/platform/ops`, `/metrics`, `/health`, `/ready` |
| Dedicated installs | Signed licenses (Ed25519) and install bundles for an organization's own server | `/license/check`, platform organization page |
| Control panel | Local tool for running, testing, backing up and deploying | `http://verify.localhost:8767` (`control-panel/`) |

## 4. Where it runs

| Surface | Technology | Address or delivery |
| --- | --- | --- |
| Web app (website, console, platform admin, shop, stores) | React 19 single-page app with a service worker | `https://transactionverify.myseed.com.et/` |
| Hosted payment page | Plain TypeScript PWA | `/pay/` on the same host |
| Public and console APIs | Fastify 5 on Node.js 24 | `/v1/...` and `/console/api/...` |
| Workers | Node.js 24 processes from the same image | Container `tv-worker` |
| Database | PostgreSQL 17 | Container `tv-postgres`, never published on the server address |
| Cashier phone app | Capacitor 8 shell for Android (version 1.1.0) | Sideloaded APK; loads `/app/cashier` from the live site |
| MySeed Shop app | Capacitor 8 shell for Android (version 1.0.0) | APK; loads `/shop` from the live site |
| Relay extension | Chrome and Edge extension | Downloaded as `/relay/extension.zip` |
| Relay agent | Node script on a shop PC | Downloaded from `/relay/agent.mjs` |
| Telegram | Each store's own bot and Mini App | Webhook `/telegram/webhook/<organization id>` |
| Control panel | Python 3.10+ standard library, runs on the developer's computer | `npm run panel` |
| Production host | Hostinger VPS shared with myseed.com.et, Docker, Myseed's Caddy for HTTPS | `https://transactionverify.myseed.com.et` |
| Optional hosts | Render (API and worker) with Supabase PostgreSQL and S3-compatible storage | `render.yaml` |
| Dedicated installs | The published image on an organization's own server | `ghcr.io/<owner>/transaction-verify` |

There is no native iOS app. iPhone users use the web app and the installed PWA.

## 5. Principles it keeps

- **Only a provider record or a person confirms money.** Readings, OCR and pilot templates never accept. Wrong accepts are a measure that must stay at zero (master roadmap section 6).
- **One transfer pays one bill.** The database refuses a transfer already claimed (`already_used`) and money sent to an account the organization does not own (`recipient_mismatch`).
- **Exact money.** Amounts are integer minor units in the database and decimal strings at the API boundary, never floating point.
- **Organizations are walled off.** Every query filters by organization, and row-level security (policy `tenant_wall`, role `verify_tenant`) is a second wall.
- **Untrusted input stays contained.** Uploads, QR codes, links and webhook addresses are untrusted. Outbound calls go only to approved https hosts on public addresses, without redirects.
- **Secrets are sealed.** Webhook secrets, provider keys, bot tokens and AI keys are encrypted with `DATA_ENCRYPTION_KEY`. Only the last four characters are shown.
- **Nothing in browser storage.** The web app keeps no state in `localStorage` or similar (decisions 30 and 49). Exceptions found: the relay extension and the cashier app's native storage keep a relay token, and the hosted payment page keeps the payer's language choice.
- **No emoji.** A check (`npm run check:emoji`) runs in CI and before every push from the control panel.
- **Plain English first.** The English interface is complete. The Amharic interface is planned as Phase 13. Dates follow the Ethiopian calendar setting per organization.
- **Phone first.** The console has a phone tab bar, tables become cards, and a clean mobile pass is planned as Phase 14.
- **Forward-only database.** Migrations only add. A rollback starts the previous release; it never rolls the database back.
- **Decisions are written down.** Every product decision goes into `docs/decisions.md` with what, why and where to change it.
