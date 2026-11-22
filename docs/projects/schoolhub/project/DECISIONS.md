# MySeedSchoolHub architecture decisions

Decisions visible in the code at commit `16e8c19`, recorded on 2026-11-23. The product decisions that shaped them are listed in the [specification index](../existing/SPECIFICATION-INDEX.md). Open product decisions D1 to D8 are in [security, SaaS packaging and delivery](../existing/06-security-saas-and-delivery.md), section 4.

## 1. Summary

| ID | Decision | Status |
| --- | --- | --- |
| ADR-1 | Modular monolith in one TypeScript monorepo | Accepted |
| ADR-2 | SchoolHub is the system of record; MySeed reads through the Connect API, no replication | Accepted |
| ADR-3 | Tenant from the server (host or token) with Postgres row-level security | Accepted |
| ADR-4 | Zod schemas in `packages/contracts` are the API contract and the source of OpenAPI | Accepted |
| ADR-5 | Entitlement keys gate features, never plan names | Accepted |
| ADR-6 | Postgres job queue instead of Redis and BullMQ | Accepted (differs from the specification) |
| ADR-7 | Worker lives in the API package | Accepted (differs from the specification) |
| ADR-8 | Platform console inside the portal, compiled out of the school edition | Accepted (differs from the specification) |
| ADR-9 | Transactional outbox and signed webhooks for events | Accepted |
| ADR-10 | Connect clients authenticate with `private_key_jwt` and install with a one-time code | Accepted |
| ADR-11 | Postgres LISTEN/NOTIFY as the default message bus, Redis optional | Accepted |
| ADR-12 | Report-card and document PDFs rendered on request with headless Chromium | Accepted (differs from the specification) |
| ADR-13 | Self-hosted licenses signed with Ed25519 and verified offline | Accepted |
| ADR-14 | Relay for self-hosted servers without a public address | Accepted |
| ADR-15 | Money in integer minor units; published records never updated in place | Accepted |
| ADR-16 | Custom dictionary for web i18n instead of next-intl | Accepted (differs from the specification) |
| ADR-17 | Refuse to start in production with development secrets | Accepted |
| ADR-18 | No emoji or decorative symbols, enforced in CI | Accepted |
| ADR-19 | Portal proxies API calls through its own origin | Accepted |
| ADR-20 | Assistant uses a local catalog, not an external AI model | Accepted |

## 2. Decisions

### ADR-1. Modular monolith in one TypeScript monorepo

- **Status:** Accepted.
- **Context:** One small team builds the API, portal, console, worker, SDK and shared contracts, and the same code must run hosted and self-hosted.
- **Decision:** pnpm workspaces with Turborepo. Two apps (`apps/api`, `apps/portal`) and shared packages (`contracts`, `db`, `sdk`, `ui`, `calendar`, `config`). Feature areas are NestJS modules inside one API process.
- **Consequences:** One build, one deploy unit per app, shared types end to end. Module boundaries rely on discipline, not process separation. The Education System and mobile apps stay in other repositories and consume `packages/contracts` and `packages/sdk` (open decision D1).

### ADR-2. SchoolHub is the system of record; no replication into MySeed

- **Status:** Accepted. Replication code was removed on 2026-10-16 (commit `2a9632f`, migration `0004_drop_integration_views`).
- **Context:** Self-hosted schools must stay in control of their records, and children's data rules favor minimal copies.
- **Decision:** The Education System reads school data through the Connect API with a short cache and receives events by webhook. MySeed stores only link mappings and notification metadata.
- **Consequences:** The apps depend on SchoolHub being reachable (hence ADR-14 for self-hosted). No change feed, snapshot or integration views exist.

### ADR-3. Server-side tenant context with row-level security

- **Status:** Accepted.
- **Context:** Many schools share one database in hosted mode; a leak between schools is the worst failure.
- **Decision:** The tenant is resolved from the request host (`apps/api/src/core/tenant-host.ts`) or from the Connect token, never from request input. Every tenant table has `organizationId` and a `tenant_isolation` RLS policy; the API runs as a restricted role inside a transaction with `app.tenant_id` set (`apps/api/src/core/pipeline.ts`).
- **Consequences:** Defense in depth beyond application checks, tested in `apps/api/test/security.test.ts`. Platform-wide reads use a separate admin client and must be written with care. Worker jobs run per tenant with `runAsTenant`.

### ADR-4. Zod contracts first

- **Status:** Accepted.
- **Context:** The portal, the Education System and the SDK must agree on every request, response and event.
- **Decision:** Every schema lives in `packages/contracts`; the API validates with it and generates OpenAPI from it (`apps/api/src/openapi.ts`); the SDK validates every Connect response with it.
- **Consequences:** API changes start in `packages/contracts`, and the package must be rebuilt before API tests. Contract drift shows up as test failures in `apps/api/test/sdk.test.ts`.

### ADR-5. Entitlement keys, not plan names

- **Status:** Accepted.
- **Context:** Bundles, build-your-own packages, add-ons, negotiated contracts and self-hosted licenses all need to resolve to the same feature set.
- **Decision:** Features are keyed `module.*`, limits `limit.*`, branding `feature.*` (`packages/contracts/src/modules.ts`). `apps/api/src/core/entitlements.ts` resolves plan version plus add-ons plus overrides, applies dependencies and caps by license.
- **Consequences:** Plans can change without code changes. The module catalog in the code differs from the one in document 06 and needs a documentation update.

### ADR-6. Postgres job queue instead of Redis and BullMQ

- **Status:** Accepted; the specification still names Redis and BullMQ.
- **Context:** Self-hosted schools should run with as few services as possible.
- **Decision:** A `jobs` table claimed with `SELECT ... FOR UPDATE SKIP LOCKED` (`apps/api/src/worker/runner.ts`).
- **Consequences:** No Redis needed. Throughput is bounded by Postgres; acceptable for v1. Document 05 should record this.

### ADR-7. Worker inside the API package

- **Status:** Accepted; the specification planned `apps/worker`.
- **Context:** The worker shares nearly all services with the API.
- **Decision:** `apps/api/src/worker.ts`, started with `node dist/worker.js` from the same image.
- **Consequences:** One image for API, worker and migrations. The worker cannot be versioned separately.

### ADR-8. Platform console inside the portal

- **Status:** Accepted; the specification planned a separate `apps/console` never shipped to self-hosted servers.
- **Context:** The console reuses the portal shell and components.
- **Decision:** Console routes live under `apps/portal/app/platform`. The portal image is built with `EDITION=platform` or `EDITION=school`; the school edition returns 404 for `/platform` (`apps/portal/middleware.ts`).
- **Consequences:** Self-hosted images must be built with `EDITION=school`. CI does not yet build that edition (see [architecture](ARCHITECTURE.md), section 8).

### ADR-9. Transactional outbox and signed webhooks

- **Status:** Accepted.
- **Context:** Events must not be lost or sent for changes that rolled back.
- **Decision:** `emit` writes an outbox row in the same transaction (`apps/api/src/core/outbox.ts`); the worker relays to webhook deliveries with HMAC-SHA256 signatures, a timestamp window, exponential backoff and a `dead` state after 12 attempts.
- **Consequences:** At-least-once delivery; receivers deduplicate by event ID. `verifyWebhook` in `packages/sdk` handles signatures and secret rotation.

### ADR-10. Connect client authentication and installation

- **Status:** Accepted.
- **Context:** The Education System calls many SchoolHub deployments, hosted and self-hosted, server to server.
- **Decision:** Client credentials with `private_key_jwt` (RFC 7523, Ed25519), 5-minute tokens and replay protection on `jti`. A deployment issues a one-time install code; the Education System runs `myseed-schoolhub-install` to register its key and webhook (`apps/api/src/modules/connect/install.ts`).
- **Consequences:** No shared secrets for Connect calls. Install codes expire after 24 hours by default.

### ADR-11. Postgres message bus by default, Redis optional

- **Status:** Accepted.
- **Context:** Several API processes need to drop caches and push live updates together.
- **Decision:** Postgres LISTEN/NOTIFY carries bus messages; when `REDIS_URL` is set, Redis pub/sub carries them and backs a shared cache (`apps/api/src/core/cache.ts`).
- **Consequences:** Self-hosted needs no Redis. Entitlement and user caches are short-lived per process and invalidated through the bus.

### ADR-12. PDFs rendered on request

- **Status:** Accepted; the specification planned worker rendering.
- **Context:** Report cards, certificates, ID cards and transcripts must print in English and Amharic.
- **Decision:** `apps/api/src/core/pdf.ts` renders HTML to PDF with playwright-core and Chromium in the API process. Without Chromium, a printable HTML view is served. The image installs Noto Sans Ethiopic.
- **Consequences:** Large bulk prints load the API process. Document 07 recommends moving rendering to a worker job before load testing.

### ADR-13. Offline-verified self-hosted licenses

- **Status:** Accepted.
- **Context:** Self-hosted servers may be offline, and MySeed must still enforce what a school bought.
- **Decision:** MySeed signs a license file with Ed25519; the server verifies it with the public key (`apps/api/src/core/license.ts`). After the valid-until date there are 30 days of grace, then the school is read-only, with records still readable and exportable.
- **Consequences:** No phone-home needed. Losing the signing key would block renewals; key custody is to confirm.

### ADR-14. Relay for servers without a public address

- **Status:** Accepted.
- **Context:** Many school servers sit behind NAT with no public address.
- **Decision:** The self-hosted server keeps one outbound long poll to a MySeed relay and answers relayed Connect requests locally (`apps/api/src/core/relay-client.ts`).
- **Consequences:** The MySeed relay service is needed; it is not in this repository.

### ADR-15. Money and immutable records

- **Status:** Accepted.
- **Context:** Fees, marks and enrollments are legal and financial records.
- **Decision:** Money is stored as integer minor units with a currency (fields such as `totalCents`, `paidCents`). Published marks change only through revisions with audit events; ledger entries are added, not edited; refunds use maker-checker.
- **Consequences:** No rounding drift. Corrections create new rows, so reports must read the latest revision.

### ADR-16. Custom i18n dictionary

- **Status:** Accepted; the specification named next-intl.
- **Context:** Only navigation and common actions needed Amharic at first.
- **Decision:** A dictionary provider in `apps/portal/lib/i18n.tsx`.
- **Consequences:** Full Amharic coverage needs a shared catalog (`packages/i18n`) and extraction; see the [Amharic plan](../existing/09-amharic-plan.md).

### ADR-17. Production secret checks

- **Status:** Accepted.
- **Context:** Development defaults in production would let anyone forge sessions or signed URLs.
- **Decision:** `apps/api/src/config.ts` refuses to start with `NODE_ENV=production` when a secret is missing, equals its development default, or contains `change-me`.
- **Consequences:** A misconfigured server fails fast instead of running insecurely.

### ADR-18. No emoji or decorative symbols

- **Status:** Accepted.
- **Context:** A consistent, professional interface and documents; see the [UI rules](../existing/UI-RULES.md).
- **Decision:** `scripts/check-emoji.mjs` fails on emoji in tracked files and runs first in CI. Icons come from lucide-react.
- **Consequences:** Every contributor runs `pnpm check:emoji` before finishing.

### ADR-19. Portal proxies API calls

- **Status:** Accepted.
- **Context:** Each school has its own host; the API must know which school a request is for without trusting the client.
- **Decision:** The browser calls `/api/...` on the school host; `apps/portal/app/api/[...path]/route.ts` forwards to the API with `x-forwarded-host` and the `INTERNAL_PROXY_SECRET`.
- **Consequences:** Cookies stay first-party on each school host. The proxy secret must be the same on the portal and API and kept private.

### ADR-20. Local assistant catalog

- **Status:** Accepted.
- **Context:** Staff need fast natural-language navigation without cost or delay from an external model.
- **Decision:** `packages/contracts/src/assistant.ts` matches requests against a catalog of screens and filters, in English and Amharic, with fuzzy matching; tested with a fixed request set in `apps/api/test/assistant.test.ts`.
- **Consequences:** No AI provider key is needed today. Product decision 11 (each school brings its own AI key for `module.ai_assistant`) is not implemented: no `module.ai_assistant` key or key storage was found in the code.
