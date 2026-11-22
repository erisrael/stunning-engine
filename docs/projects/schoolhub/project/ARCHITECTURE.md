# MySeedSchoolHub architecture

As built at commit `16e8c19` (2026-11-16), documented on 2026-11-23. The planned architecture is in [tech stack and architecture](../existing/05-tech-stack-and-architecture.md); where the code differs, this document follows the code.

## 1. Stack

Versions are taken from the `package.json` files, Dockerfiles and Compose files.

| Layer | Technology | Version | Where |
| --- | --- | --- | --- |
| Runtime | Node.js | 22 or later (`engines`); image `node:22.20.0-bookworm-slim` | root `package.json`, Dockerfiles |
| Package manager and build | pnpm workspaces, Turborepo | pnpm 10.34.7, turbo 2.11.7 | root `package.json`, `pnpm-workspace.yaml`, `turbo.json` |
| Language | TypeScript | 5.9.3 | all packages |
| API framework | NestJS on Express | 11.2.7 | `apps/api` |
| Validation and API contract | Zod, `@asteasolutions/zod-to-openapi`, Swagger UI | zod 3.25.76, zod-to-openapi 7.3.4, swagger-ui-express 5.0.1 | `packages/contracts`, `apps/api/src/openapi.ts` |
| Database | PostgreSQL | 17 (`postgres:17.6-bookworm` in Compose and CI; `embedded-postgres` 17.10.0-beta.17 locally) | `deploy/compose`, `scripts/dev-db.mjs` |
| ORM and migrations | Prisma | 6.19.3 | `packages/db` |
| Password hashing | `@node-rs/argon2` (Argon2id) | 2.2.2 | `apps/api`, `packages/db` |
| Tokens and signatures | jose | 6.2.12 | `apps/api`, `packages/sdk` |
| PDF rendering | playwright-core with Chromium | 1.64.0 | `apps/api/src/core/pdf.ts` |
| Spreadsheets and CSV | exceljs, papaparse, jszip | 4.4.0, 5.5.5, 3.10.1 | `apps/api/src/modules/data` |
| Object storage | AWS SDK S3 client (any S3-compatible store) or local disk | 3.1150.0 | `apps/api/src/core/storage.ts` |
| Optional message bus and cache | Redis through ioredis | 5.8.2 | `apps/api/src/core/cache.ts` |
| Email | nodemailer | 7.0.13 | `apps/api/src/core/notify.ts` |
| Web framework | Next.js (App Router), React | next 15.5.27, react 19.1.9 | `apps/portal` |
| Data fetching and forms | TanStack Query, react-hook-form | 5.104.2, 7.90.0 | `apps/portal` |
| Styling and components | Tailwind CSS, Radix UI, class-variance-authority, lucide-react, motion, sonner, cmdk | tailwindcss 3.4.19, lucide-react 0.577.0, motion 12.43.0 | `packages/ui`, `apps/portal` |
| Charts and 3D | recharts, three | 2.15.4, 0.169.0 | `apps/portal` |
| Tests | Vitest, supertest, Playwright, axe-core | vitest 3.2.7, supertest 7.3.1, @playwright/test 1.56.1, @axe-core/playwright 4.11.0 | `apps/api/test`, `apps/portal/e2e` |
| Lint and format | ESLint flat config, typescript-eslint, Prettier | eslint 9.39.5, typescript-eslint 8.71.0, prettier 3.9.9 | `packages/config` |
| Reverse proxy | Caddy | 2.10.2 | `deploy/caddy/Caddyfile` |
| Malware scanning | ClamAV | 1.4.3 | self-hosted Compose, profile `scan` |
| Local mail catcher | Mailpit | v1.27.10 | `deploy/compose/docker-compose.dev.yml` |
| Control panel | Python 3.10 or later with pg8000 | not pinned in a manifest | `tools/control-panel` |

## 2. Code layout

| Folder | What it holds |
| --- | --- |
| `apps/api/src/main.ts`, `create-app.ts`, `app.module.ts` | API start-up, Express settings, Nest module wiring |
| `apps/api/src/config.ts` | Every environment setting and the production secret check |
| `apps/api/src/core` | Cross-cutting services: request context and pipeline, guard, tenant host, entitlements, audit, outbox, storage, upload, scan, PDF, documents, license, relay client, logger, cache and bus, live updates, notify, platform auth and settings, providers |
| `apps/api/src/modules` | Feature controllers: `academics`, `admissions`, `attendance`, `auth`, `auth-myseed`, `communication`, `messaging`, `connect`, `data`, `documents`, `exams`, `files`, `finance`, `governance`, `idcards`, `insights`, `integrations`, `learning`, `operations`, `operations-ext`, `payroll`, `accounting`, `people`, `people-ext`, `platform`, `relay`, `reports`, `resources`, `results`, `admin` |
| `apps/api/src/worker.ts`, `apps/api/src/worker` | Worker loop, job queue, scheduled duties |
| `apps/api/src/seed` | Demo data: seven schools, platform staff, Connect client |
| `apps/api/src/cli/install-code.ts` | `pnpm connect:code` |
| `apps/api/test` | Vitest suites against a real Postgres |
| `apps/portal/app/(site)` | Public site |
| `apps/portal/app/(app)` | School portal screens |
| `apps/portal/app/platform` | Platform console (removed from the school edition) |
| `apps/portal/app/api/[...path]/route.ts` | Proxy from the portal to the API |
| `apps/portal/middleware.ts` | Host to school mapping, edition switch, redirects |
| `apps/portal/lib`, `apps/portal/components` | API client, session, i18n, live updates, navigation, shared screen components |
| `apps/portal/e2e` | Playwright role crawl and accessibility audit |
| `packages/contracts` | Zod schemas, module and permission registry, resource registry, Connect contract, assistant catalog, themes |
| `packages/db` | `prisma/schema.prisma`, migrations, RLS generator, app-role password script |
| `packages/sdk` | `@myseed/schoolhub-sdk`: Connect client, webhook verifier, installer, `myseed-schoolhub-install` command, local dev gateway example |
| `packages/ui` | Design system |
| `packages/calendar` | Ethiopian and Gregorian calendar conversion and formatting |
| `packages/config` | Shared ESLint, Prettier and TypeScript settings |
| `deploy` | Compose files, Caddyfile, self-hosted scripts |
| `scripts` | `check-emoji.mjs`, `dev-db.mjs`, `load-test.mjs` |
| `tools/control-panel` | Local Python control panel |
| `docs` | Specification and status documents |

## 3. How a request flows

### 3.1 Staff request from the school portal

1. The browser opens `https://<school>.<ROOT_DOMAIN>/...`. `apps/portal/middleware.ts` reads the school slug from the host, sets `x-school-slug`, and in the school edition returns 404 for `/platform`.
2. Client code calls `/api/...` on the same host. `apps/portal/app/api/[...path]/route.ts` forwards it to `API_INTERNAL_URL`, adding `x-forwarded-host` and the `x-internal-proxy` shared secret.
3. In the API, `contextMiddleware` (`apps/api/src/core/pipeline.ts`) creates one request context with a request ID, carried through async calls.
4. `requestHost` (`apps/api/src/core/tenant-host.ts`) trusts `x-forwarded-host` only when the proxy secret matches, and `slugFromHost` maps the host to an organization. Tenant context never comes from the request body or query.
5. `AppGuard` (`apps/api/src/core/guard.ts`) reads the route metadata, checks the `sh_session` cookie, user status, MFA requirement, rate limits, the school's effective entitlements (module enabled), the user's permissions, and the self-hosted license state (read-only after grace, except the paths in `LICENSE_FREE_PATHS`).
6. `TenantInterceptor` runs the handler in one database transaction as the restricted app role with `app.tenant_id` set, so Postgres row-level security applies. If the route is idempotent and an `Idempotency-Key` header is present, a stored response is replayed.
7. The handler validates input with the Zod schema from `packages/contracts`, writes data, writes audit events and outbox events in the same transaction, and returns a contract-shaped response.
8. A live signal is published on the bus (`apps/api/src/core/live.ts`), and portals with an open event stream reload the affected data.

### 3.2 Request from the MySeed Education System

1. The Education System installs itself once with a one-time install code (`POST /connect/v1/install`, see `apps/api/src/modules/connect/install.ts`).
2. On each call it exchanges a signed client assertion for a 5-minute token at `POST /connect/v1/oauth/token` (client credentials with `private_key_jwt`, Ed25519, replayed `jti` refused).
3. Connect routes (`apps/api/src/modules/connect/api.ts`) resolve the tenant from the token and the connection, check the connection is active and the guardian access profile, and return only published data.
4. Events reach the Education System by signed webhook from the worker.

### 3.3 Public requests

`/api/v1/public/*` serves health, school directory and landing data, favicons and document verification (`/api/v1/public/verify/:code`) without a session.

## 4. Database and migrations

- One PostgreSQL database. Schema in `packages/db/prisma/schema.prisma` with 159 models.
- Two roles: the owner (`DATABASE_URL`) runs migrations; the API and worker use the restricted `schoolhub_app` role (`DATABASE_URL_APP`) with no superuser and no BYPASSRLS. In Compose, the `migrate` service sets the app role password with `packages/db/scripts/set-app-password.mjs`.
- Row-level security: each tenant table has a `tenant_isolation` policy on `organizationId = current_setting('app.tenant_id')`. Policies are generated by `pnpm --filter @myseed/db rls:generate`.
- Migrations are applied with `pnpm db:migrate` (`prisma migrate deploy`). They are forward-only.

| Migration | What it adds |
| --- | --- |
| `0001_init` | Base schema |
| `0002_row_level_security` | RLS policies on tenant tables |
| `0003_integration_views` | Integration views (later removed) |
| `0004_drop_integration_views` | Removes replication views (decision 4) |
| `0005_connect_install` | One-time install codes and installed Connect clients |
| `0006_platform_and_school_expansion` | Platform desks and expanded school modules |
| `0007_dashboard_indexes` | Indexes for dashboard queries |
| `0008_user_preferences` | Per-user preferences |
| `0009_rename_themes` | Theme renames |
| `0010_booking_guards` | Constraints against double booking |
| `0011_exams` | Exams |
| `0012_template_versions` | Versioned document templates |
| `0013_report_card_workflow` | Report-card workflow and revisions |
| `0014_list_work` | Bulk list operations and recycle bin |
| `0015_certificates` | Certificates |

## 5. Authentication and permissions

| Who | How they sign in | Where |
| --- | --- | --- |
| School staff | Email and password (Argon2id), optional or required TOTP MFA, account lockout after repeated failures, session cookie `sh_session` | `apps/api/src/modules/auth.ts`, `apps/api/src/core/guard.ts` |
| School staff (optional) | Sign in with MySeed ID (OpenID Connect) when `MYSEED_ID_*` is set | `apps/api/src/modules/auth-myseed.ts` |
| MySeed platform staff | Separate cookie `sh_platform`, platform roles | `apps/api/src/core/platform-auth.ts` |
| MySeed Education System | `private_key_jwt` client credentials, short-lived tokens, per-connection grants | `apps/api/src/modules/connect/api.ts` |
| Self-hosted relay | `RELAY_TOKEN` | `apps/api/src/core/relay-client.ts` |

Permissions: each route declares a permission key and usually a module key. Role templates in `packages/contracts/src/permissions.ts` map roles to permissions; schools can create custom roles. Each role has a workspace (admin, academic, registrar, finance, teacher, communication, counselor, health, boarding, canteen, library, transport, operations, auditor) that chooses its `/home` screen. Entitlements are resolved in `apps/api/src/core/entitlements.ts` from the plan version, add-ons and overrides, then dependencies, and capped by a self-hosted license. Platform support access to a school needs a time-limited grant (`apps/api/src/modules/platform/support.ts`).

## 6. Background and scheduled work

The worker (`node dist/worker.js`) polls every `WORKER_POLL_MS` (default 1500 ms). Each pass (`tick` in `apps/api/src/worker/runner.ts`):

| Duty | What it does |
| --- | --- |
| Scan queue | Queues pending uploads for ClamAV |
| Outbox relay | Turns outbox events into webhook deliveries for schools and installed Connect clients |
| Webhook delivery | Signed POSTs with exponential backoff; status `dead` after 12 attempts |
| Jobs | Postgres `jobs` table claimed with `SKIP LOCKED` (queues include `webhook.client`, `webhook.platform`, scheduled reports) |
| Message deliveries | SMS and email sends |

Every 60 seconds (`scheduled`), per active or trial school:

| Duty | Schedule |
| --- | --- |
| Scheduled report runs | Every pass |
| Retention policy | Nightly after 02:00 Addis Ababa time (UTC+3) |
| Accounting sync from finance | Hourly |
| Library holds expiry and hand-over to the next person waiting | Every pass |
| ID card expiry | Every pass |
| Publish scheduled materials, announcements and assignments | Every pass |
| Assignment due-soon event (24 hours ahead, once per assignment) | Every pass |
| Invoice overdue status and due-soon event (3 days ahead) | Every pass |
| Library loans overdue, link verifications expired | Every pass |

With several API processes (`API_WORKERS`), only the lead process syncs catalogs and holds the relay connection (`apps/api/src/core/startup.ts`).

## 7. Integrations

| Service | Purpose | Files | Settings |
| --- | --- | --- | --- |
| MySeed Education System | Connect API reads and writes, signed webhooks, install codes | `apps/api/src/modules/connect`, `packages/sdk` | Connect clients in the platform console |
| MySeed ID | Optional staff sign-in (OpenID Connect) | `apps/api/src/modules/auth-myseed.ts` | `MYSEED_ID_ISSUER`, `MYSEED_ID_CLIENT_ID`, `MYSEED_ID_CLIENT_SECRET` |
| MySeed relay | Connect access to self-hosted servers without a public address | `apps/api/src/core/relay-client.ts`, `apps/api/src/modules/relay.ts` | `RELAY_URL`, `RELAY_TOKEN` |
| MySeed platform webhook | Platform events from a deployment | `apps/api/src/worker/runner.ts` | `PLATFORM_WEBHOOK_URL`, `PLATFORM_WEBHOOK_SECRET` |
| Chapa | Online fee payments and callbacks | `apps/api/src/core/providers/adapters.ts`, `apps/api/src/modules/finance` | `CHAPA_SECRET_KEY` or provider settings per school |
| telebirr | Online fee payments (H5 C2B web checkout) | `apps/api/src/core/providers/adapters.ts` | Provider settings per school |
| Other HTTP providers | Configurable provider definitions managed in the console | `apps/api/src/core/providers/http-engine.ts`, `registry.ts`, `apps/api/src/modules/platform/providers.ts` | Console, per school |
| Iconic SMS | SMS | `apps/api/src/core/notify.ts`, `apps/api/src/worker/runner.ts` | `ICONIC_SMS_API_URL`, `ICONIC_SMS_API_KEY`, `ICONIC_SMS_SENDER` |
| SMTP | Email | `apps/api/src/core/notify.ts` | `SMTP_URL` |
| S3-compatible storage | Files | `apps/api/src/core/storage.ts` | `STORAGE_DRIVER`, `S3_*` |
| ClamAV | Malware scanning | `apps/api/src/core/scan.ts` | `CLAMAV_HOST`, `CLAMAV_PORT` |
| Redis | Message bus and shared cache | `apps/api/src/core/cache.ts` | `REDIS_URL` |
| Sentry-compatible endpoint | Error reporting | `apps/api/src/core/logger.ts` | `SENTRY_DSN` |
| Chromium | PDF rendering | `apps/api/src/core/pdf.ts` | `WITH_CHROMIUM` build argument |

Without credentials, the SMS and email adapters log deliveries instead of sending.

## 8. Deployment

| Topic | As built |
| --- | --- |
| Images | `apps/api/Dockerfile` (API, worker and migrations in one image; Chromium and an Ethiopic font optional through `WITH_CHROMIUM`), `apps/portal/Dockerfile` (Next.js standalone; `EDITION` build argument, `platform` or `school`) |
| Registry | CI pushes `ghcr.io/<owner>/schoolhub-api` and `ghcr.io/<owner>/schoolhub-portal` on push to `main` and on `v*` tags, signed with cosign, with SBOM and provenance |
| Hosted | To confirm. No hosted production environment, provider or region is recorded (decision D3) |
| Self-hosted | `deploy/compose/docker-compose.selfhosted.yml`: `postgres`, `migrate`, `api`, `worker`, `portal`, `clamav` (profile `scan`), `caddy`; volumes `pgdata`, `storage`. Installed with `deploy/scripts/install.sh` |
| Development | `deploy/compose/docker-compose.dev.yml` (Postgres and Mailpit) or the embedded Postgres from `pnpm db:start` |
| Who can deploy | To confirm. Image pushes need write access to the GitHub repository; self-hosted servers are run by the school or MySeed support with root access |
| Rollback | Self-hosted: `deploy/scripts/upgrade.sh` takes a backup labelled `before-upgrade` and returns to the previous version and restores the backup if SchoolHub does not come back; `deploy/scripts/restore.sh` restores any backup. Migrations are forward-only, so a rollback after a migration needs the backup. Hosted: to confirm |

> [!WARNING]
> The self-hosted Compose file pulls `ghcr.io/myseed/schoolhub-portal-school`, built with `EDITION=school`. The CI matrix builds only `schoolhub-api` and `schoolhub-portal` with the default edition. Until CI builds the school edition, the self-hosted install has no portal image to pull.

## 9. Observability

| Signal | As built |
| --- | --- |
| Logs | Structured JSON in production (`LOG_FORMAT`, `LOG_LEVEL`), with request, trace and tenant IDs and redaction of phone numbers, emails and secret-looking fields (`apps/api/src/core/logger.ts`). Caddy logs JSON to stdout |
| Tracing | W3C trace context carried in logs. No OpenTelemetry exporter was found in the code |
| Errors | Sent to any Sentry-compatible endpoint when `SENTRY_DSN` is set |
| Health | `GET /api/v1/public/health` checks the database; used by container health checks and the install script |
| Queues | Outbox lag, jobs by status, dead jobs and webhook health in the platform console (`/platform/operations`, `/platform/events`) and in the control panel |
| Self-hosted support | `deploy/scripts/diagnostics.sh` collects versions, container state, health, disk and memory, recent logs and license status without school records or secrets |
| API reference | `/docs` (school API) and `/docs/connect` (Connect API) from `apps/api/src/openapi.ts` |
