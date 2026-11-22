# Transaction Verify architecture decisions

> [!NOTE]
> These records describe decisions that are visible in the code at commit `3435810` (20 November 2026). The project also keeps a detailed numbered [decision log](../existing/docs/decisions.md) (decisions 1 to 81). Each record below names the log entries it draws on. "Accepted" means the decision is in force in the code.

## 1. Summary

| ID | Decision | Status | Log entries |
| --- | --- | --- | --- |
| ADR-1 | One TypeScript monorepo; API and worker as separate processes from one image | Accepted | 1, 2 |
| ADR-2 | PostgreSQL 17 is the only durable store, including job leases, outbox and rate limits | Accepted | 2 |
| ADR-3 | Money is accepted only inside the database by `accept_payment` | Accepted | 29, 59 |
| ADR-4 | Contract first: OpenAPI 3.1 drives routes, validation and types | Accepted | 55 |
| ADR-5 | Exact money in integer minor units | Accepted | - |
| ADR-6 | Row-level security as a second wall between organizations | Accepted | 34 |
| ADR-7 | One platform: every customer, MySeed Academy included, is an organization | Accepted | 17, 23, 35 |
| ADR-8 | Banks and wallets connected by data (templates), with drafts, pilots and certification | Accepted | 39, 41, 43, 54, 67, 73 |
| ADR-9 | Receipt readings never accept a payment | Accepted | 29, 40 |
| ADR-10 | Safe outbound calls for provider lookups and webhooks | Accepted | 39, 78 |
| ADR-11 | A lookup network of relays for banks reachable only inside Ethiopia | Accepted | migrations 047, 053, 055, 063, 064 |
| ADR-12 | Merchant APIs checked with the organization's own key | Accepted | 61, 73 |
| ADR-13 | Outbox and signed webhooks with retries; receivers deduplicate by event ID | Accepted | 55 |
| ADR-14 | Self-hosted OCR with Tesseract, bounded | Accepted | - |
| ADR-15 | Built-in staff sign-in with passkeys and optional two-step; OIDC single sign-on for Enterprise | Accepted | 4, 37, 78 |
| ADR-16 | The web app keeps nothing in browser storage | Accepted | 30, 49 |
| ADR-17 | Host on Myseed's VPS behind its shared Caddy; deploy from the control panel | Accepted | 1, 13 |
| ADR-18 | Forward-only migrations; rollback never touches the database | Accepted | - |
| ADR-19 | Secrets sealed with `DATA_ENCRYPTION_KEY`, with rotation | Accepted | 62 |
| ADR-20 | Alerts from the worker, plus `/metrics` and an own status page | Accepted | 63, 65, 66 |
| ADR-21 | Evidence kept whole, archived after a hot period, deleted after retention | Accepted | 8, 57 |
| ADR-22 | Entitlements from a package snapshot with overrides and flags | Accepted | 25 |
| ADR-23 | Dedicated installs with signed licenses | Accepted | 19 |
| ADR-24 | React web app without a framework router, built with esbuild | Accepted | 20 |
| ADR-25 | Android apps as Capacitor shells that load the live site | Accepted | cashier and shop READMEs |
| ADR-26 | AI only with the organization's own key, sealed and logged | Accepted | migrations 054, 057, 066 |
| ADR-27 | Storefront, shopper marketplace and Creative Studio in the same product | Accepted in code; scope to confirm | not in the decision log |
| ADR-28 | No emoji anywhere, checked in CI | Accepted | 16 |
| ADR-29 | Amharic interface and clean mobile pass at the end of the plan | Accepted | 47, 75 |

## 2. Records

### ADR-1. One TypeScript monorepo with separate API and worker processes

- **Status:** Accepted.
- **Context:** The product has an HTTP API, background verification, a web app and SDKs that must share reason codes, money rules and contract types.
- **Decision:** One npm workspaces repository in TypeScript. The API (`apps/api`) and the worker (`apps/worker`) are separate processes built into one Docker image; the compose file picks the command per service. Shared logic lives in `packages/*`.
- **Consequences:** One build and one test run (`npm run check`). API and workers scale and restart independently. SDKs carry their own copy of the contract types so they can be published without the private packages (`npm run sdk:check`).

### ADR-2. PostgreSQL 17 as the only durable store

- **Status:** Accepted.
- **Context:** The service needs durable jobs, leases, rate limits, an event outbox and exact money, on a small server.
- **Decision:** PostgreSQL 17 holds everything: job leases (`lease_verification_job`), rate windows (`reserve_rate_limit`), the outbox, sessions and settings. There is no message broker or cache server.
- **Consequences:** Fewer moving parts and one backup covers all state. Throughput is bounded by the database. Transactions must stay short, with network calls outside them.

### ADR-3. Acceptance happens inside the database

- **Status:** Accepted.
- **Context:** Two cashiers or two workers can see the same transfer at the same time. A payment must be accepted once, into the right account, for the right amount.
- **Decision:** The SQL function `accept_payment` checks recipient, amount, currency, payment date and request state, claims the canonical provider transfer under a unique constraint, and writes acceptance, allocations and the outbox event in one transaction. Money sent to an account the organization does not own is rejected with `recipient_mismatch` (migration 024).
- **Consequences:** Duplicate claims fail at the database. Application code cannot accept a payment by another path. Changes to acceptance rules are migrations.

### ADR-4. Contract first

- **Status:** Accepted.
- **Context:** Integrators, SDKs and the API must agree on shapes, scopes and amounts.
- **Decision:** `contracts/openapi.v1.json` (OpenAPI 3.1, version `0.6.0-draft`) defines the 13 public operations. Routes, validation and credentials come from it; TypeScript types are generated (`npm run generate:contract`). CI fails if the generated types are out of date. Breaking changes need a new path; deprecations carry `Deprecation` and `Sunset` headers at least six months apart, enforced at start-up (`apps/api/src/deprecations.ts`).
- **Consequences:** The contract is the reference for integrators. It is still marked draft.

### ADR-5. Exact money in integer minor units

- **Status:** Accepted.
- **Context:** Floating-point money causes rounding errors.
- **Decision:** Amounts are integer minor units in the database (`125000` is ETB 1,250.00) and decimal strings at the API boundary. `packages/domain/src/money.ts` parses and formats them.
- **Consequences:** No float conversions in serializers. Every new money field follows the same rule.

### ADR-6. Row-level security as a second wall

- **Status:** Accepted.
- **Context:** Every query filters by organization, but one missed filter would expose another organization's payments.
- **Decision:** Migration 013 adds the policy `tenant_wall` on every table with `organization_id`. `withTenant` sets `verify.organization_id` and switches to the role `verify_tenant`, because the deployment user is usually a superuser and superusers bypass policies.
- **Consequences:** Worker jobs and public API writes run under the wall. Platform-wide tools must run outside it on purpose. The migration needs a database user that can create roles. The database tools page checks that each table has the wall (it found `webauthn_challenges` without one; migration 024 fixed it).

### ADR-7. One platform for every organization

- **Status:** Accepted.
- **Context:** The plan first described separate deployments for Myseed and a commercial service.
- **Decision:** One deployment at `transactionverify.myseed.com.et` serves every organization. MySeed Academy is an ordinary organization. The MySeed Verify team is its own platform organization (`platform_only`). Sandbox is a mode per key and request, not a separate deployment.
- **Consequences:** No MySeed-only code paths in verification. Platform roles are separate from organization roles. A dedicated database per organization is still open (Phase 12).

### ADR-8. Banks and wallets connected by data

- **Status:** Accepted.
- **Context:** Ethiopia has dozens of banks and wallets, most without an API, and receipt layouts change.
- **Decision:** A method is data: a template with approved links, reference patterns, lookup rule and field patterns, up to four formats per method (`template.ts`). Drafts for 39 banks and wallets are kept in `drafts.ts` and generated into migrations. A provider admin corrects a draft with real receipts in Live check, may run it in pilot (every payment goes to a person with `provider_pilot`), then certifies it and switches its connector on. A circuit breaker pauses a failing provider (5 failures, then 1 to 15 minutes).
- **Consequences:** New banks need no code release when the page format fits the template. Nothing is accepted automatically until a method is certified. Generated migrations must never be edited by hand.

### ADR-9. Receipt readings never accept

- **Status:** Accepted.
- **Context:** Screenshots and OCR can be faked or misread.
- **Decision:** Readings fill fields and can refuse with `receipt_mismatch` only on a clear amount conflict with the provider (OCR confidence 85 percent or more). Only the last four account digits are kept. Masked accounts match only when exactly one of the organization's accounts at that provider ends with the same digits; otherwise the case goes to review.
- **Consequences:** Banks without a lookup end in staff review. Review load depends on certified coverage.

### ADR-10. Safe outbound calls

- **Status:** Accepted.
- **Context:** QR codes, links and webhook addresses come from untrusted users and could turn the worker into a proxy.
- **Decision:** Provider lookups use only https, approved hosts, ports and paths, no redirects, public addresses only (`link-connector.ts`). Webhooks go through `safePost` in `egress.ts` with private address protection. A bank with an incomplete certificate chain gets its intermediate certificate added for its lookups only; certificate checks are never turned off.
- **Consequences:** Some bank pages need explicit approval before they can be read. Loopback webhooks are allowed only in the sandbox (`ALLOW_LOOPBACK_WEBHOOKS`).

### ADR-11. A lookup network of relays

- **Status:** Accepted.
- **Context:** Some receipt pages answer only inside Ethiopia (telebirr only on Ethio Telecom networks), while the server may be hosted abroad.
- **Decision:** Each provider has a lookup egress (`auto`, `direct` or `relay`, migration 047). Relays are the cashier Android app, the Chrome and Edge extension, or the Node agent. A relay serves only its own organization, gets a job with its receipt number, and the server refuses an answer tagged with another number (migration 055). A failed relay hands the job to another online relay (migration 064). "Verify with this phone" sends a check through the organization's relay first for five minutes (migration 063).
- **Consequences:** Live checks of some banks depend on a shop device being online. Relays can only fetch approved https pages.

### ADR-12. Merchant APIs with the organization's own key

- **Status:** Accepted.
- **Context:** Gateways like Chapa know which merchant received a payment, which covers banks without receipt pages.
- **Decision:** Chapa is verified with `GET /v1/transaction/verify/{tx_ref}` using the organization's secret key, sealed in the database. A transaction returned for that key is tied to its one active Chapa receiving account. ArifPay and YaYa follow the same pattern and stay in pilot. Pay with Chapa starts a checkout with the organization's key (migration 060).
- **Consequences:** Each organization manages its own gateway keys. Without a key the check waits and then goes to review.

### ADR-13. Outbox and signed webhooks

- **Status:** Accepted.
- **Context:** Acceptance, delivery and fulfillment must each recover on their own.
- **Decision:** Events are written to an outbox with the acceptance. The worker delivers them with an HMAC signature (`x-verify-signature`, `x-verify-timestamp`, `x-verify-key-id`) and retries after 30 seconds, 2, 10 and 30 minutes, then 2, 6, 12 and 24 hours, then marks the delivery dead. Endpoints choose test, live or both. Receivers deduplicate by event ID and report fulfillment idempotently.
- **Consequences:** Integrators must handle redelivery. Staff can replay a dead delivery from the console.

### ADR-14. Self-hosted OCR

- **Status:** Accepted.
- **Context:** Receipt images may not be sent to an outside OCR service.
- **Decision:** Tesseract with English and Amharic runs inside the image. The worker bounds concurrency (`WORKER_OCR_CONCURRENCY`, default 2) and time (`OCR_TIMEOUT_MS`). QR, link and PDF text are tried first.
- **Consequences:** No outside data processor for images. Without Tesseract, image receipts need a QR code.

### ADR-15. Staff sign-in

- **Status:** Accepted.
- **Context:** Staff decide money; accounts need strong sign-in without a separate identity service.
- **Decision:** Built-in accounts with scrypt passwords. Passkeys sign in alone. Two-step codes are optional unless the organization requires them; a browser is remembered for the organization's chosen days. Enterprise organizations can use OpenID Connect with PKCE; existing people only, no accounts created on sign-in; admins keep password sign-in. SAML is not built.
- **Consequences:** Password reset and sign-in reset forget remembered devices. SSO depends on the `sso` flag.

### ADR-16. Nothing in browser storage

- **Status:** Accepted.
- **Context:** Shared counter devices and phones must not keep payment data.
- **Decision:** The web app stores nothing in `localStorage`, `sessionStorage` or IndexedDB. Theme choice on public pages lasts for the visit. The cashier's Not sent queue lives in memory. Shopper carts are kept on the server (migration 061).
- **Consequences:** Some state must be saved through the API. The relay extension (`chrome.storage.local`) and the cashier app (native storage for the relay token) are outside the web app and do store a token. The hosted payment page (`apps/hosted/src/main.ts`) keeps the payer's language choice in `localStorage` under `tv-lang`; to confirm whether that exception is intended.

### ADR-17. Hosting on Myseed's VPS

- **Status:** Accepted.
- **Context:** Myseed already runs a VPS with Caddy on ports 80 and 443.
- **Decision:** Transaction Verify runs in its own folder and containers on that VPS, with its own PostgreSQL. Myseed's Caddy routes the subdomain over a shared `edge` network (`deploy/vps/myseed-edge.patch`). The control panel uploads a `git archive` of the last commit and runs `deploy/vps/deploy.sh`. `EDGE_MODE=own` runs a separate Caddy on a server without Myseed.
- **Consequences:** Low cost. Myseed and Transaction Verify share one server's capacity and failure (master roadmap risk "single shared server"). Deploys are manual and tied to the person with the panel and SSH key.

### ADR-18. Forward-only migrations

- **Status:** Accepted.
- **Context:** Rolling deploys and rollbacks must not lose data.
- **Decision:** Migrations only add. The runner refuses a changed migration file. Rollback starts the previous release; the database stays on the newer schema.
- **Consequences:** Each migration must be compatible with the previous release's code. Fixes are new migrations.

### ADR-19. Sealed secrets with rotation

- **Status:** Accepted.
- **Context:** Webhook secrets, provider keys, bot tokens and AI keys are stored in the database.
- **Decision:** `SecretBox` seals values with AES-256-GCM under `DATA_ENCRYPTION_KEY`. `DATA_ENCRYPTION_KEY_PREVIOUS` holds old keys that still open values; `npm run keys:rotate reseal` seals everything again. `ACCOUNT_DIGEST_KEY` keys account digests and is never rotated.
- **Consequences:** Losing `DATA_ENCRYPTION_KEY` makes sealed values and the archive unreadable. Changing `ACCOUNT_DIGEST_KEY` breaks account matching.

### ADR-20. Alerts from the worker

- **Status:** Accepted.
- **Context:** No monitoring stack exists on the server.
- **Decision:** The worker checks queue age, backlog, connector failures, dead deliveries, silent workers, connections and backup age each minute, and opens one alert row per problem. `/metrics` exposes the same numbers. `/status` is an own status page. Every 5xx is stored with its request ID.
- **Consequences:** A server outage is not reported from inside. An outside monitor must be added by the operator.

### ADR-21. Evidence lifecycle

- **Status:** Accepted.
- **Context:** Disputes and tax audits need the original receipt; data protection law asks for storage limits.
- **Decision:** Keep the original file whole. After the hot period (default 90 days) move it to a sealed archive with its SHA-256 recorded. Delete it after the retention period (default 5 years, per organization 30 days to 10 years).
- **Consequences:** The archive must be on a different folder or bucket than receipts. The retention period is to be confirmed with legal counsel (decision 57).

### ADR-22. Entitlements

- **Status:** Accepted.
- **Context:** Packages change, and individual organizations need exceptions.
- **Decision:** An organization gets a snapshot of its package as sold, then overrides with reason and expiry. Feature flags resolve by default, package, percentage and override (`packages/persistence/src/entitlements.ts`). The API and the worker both check them.
- **Consequences:** Changing a package does not silently change existing customers.

### ADR-23. Dedicated installs with signed licenses

- **Status:** Accepted.
- **Context:** Some organizations want their own server or database without receiving the code.
- **Decision:** The platform issues an Ed25519 license and an install bundle that uses the published image. `DEPLOYMENT=dedicated` refuses to start without a valid license and checks in daily; revocation stops it.
- **Consequences:** The image must be published (release workflow on a `v*` tag). No `v*` tag exists yet.

### ADR-24. React web app without a framework router

- **Status:** Accepted.
- **Context:** One web app serves the website, console, platform admin, cashier, shop and studio.
- **Decision:** React 19 with Tailwind CSS 4 and Radix primitives in shadcn style, bundled by esbuild (`apps/web/build.mjs`). Routing is a path switch in `apps/web/src/main.tsx`. three.js loads as its own chunk.
- **Consequences:** Few dependencies. Some page files are very large (`design-builder.tsx` has 6,455 lines at this commit), which the Creative Studio roadmap plans to split.

### ADR-25. Android apps as Capacitor shells

- **Status:** Accepted.
- **Context:** The cashier phone must act as a relay, which a browser cannot do, and shoppers want an app icon.
- **Decision:** Two Capacitor 8 shells load the live site (`/app/cashier` and `/shop`). The cashier app adds a native relay service. Both are built on their own, outside the npm workspaces.
- **Consequences:** Web changes reach the apps on deploy without an app store release. APKs are sideloaded; no store listing exists in the repository. No iOS app.

### ADR-26. AI with the organization's own key

- **Status:** Accepted.
- **Context:** The Creative Studio and store builder offer AI help.
- **Decision:** An organization connects Anthropic, OpenAI or Google Gemini with its own key, sealed and shown by its last four characters. The server calls the provider; every run is logged. AI output (themes, landing pages) is data checked like hand-made data. Studio scripts run in a sandbox page (`/studio-sandbox`).
- **Consequences:** The platform pays no AI cost. Payment decisions never use AI.

### ADR-27. Storefront, marketplace and Creative Studio in the same product

- **Status:** Accepted in code; scope to confirm.
- **Context:** Commits from 16 to 20 November 2026 added storefront commerce, QR stands, Telegram bots, shopper accounts, the MySeed Shop app, auctions, memberships, a website builder and a 2D and 3D Creative Studio. They are not part of master roadmap v5 phases 0 to 14.
- **Decision:** They share the deployment, database, sign-in and payment verification. Storefront payments use the same payment requests and checks.
- **Consequences:** The product scope is much wider than payment verification. To confirm: whether these modules are part of the MySeed Verify release plan, and who owns them.

### ADR-28. No emoji

- **Status:** Accepted.
- **Context:** The UI direction approved in decision 16 is emoji-free.
- **Decision:** `scripts/check-no-emoji.mjs` scans the repository. It runs in `npm run check`, in CI, and before every commit and push from the control panel.
- **Consequences:** Icons come from lucide line icons only.

### ADR-29. Amharic and clean mobile at the end

- **Status:** Accepted.
- **Context:** The English interface and the Ethiopian calendar are needed first.
- **Decision:** The Amharic interface (console, cashier and payment page, with MySeed's review of every text) is Phase 13. A clean mobile pass is Phase 14. Small mobile fixes still ship as found.
- **Consequences:** Amharic texts in `packages/messages` remain a draft for review until Phase 13.
