# 07. Build status and gaps

Status as of 16 October 2026 (first written 15 October; updated after the M0 and SDK work in section 6). This document compares the code in this repository against documents 01 to 06 and lists what is built, what is partly built, what is missing, and where the code has drifted from the specification. New scope taken from the Product Specification v1.0 (PDF) is in [document 08](08-product-spec-additions.md).

Method: the status below comes from reading the code (API modules, Prisma schema and migrations, portal routes, worker, tests) and from running the suites. On 16 October the full API suite (86 tests) and the calendar tests passed against the local Postgres, and the portal crawl (section 2.3) signed in as every role. Work is committed on the branch `build/m0-sdk-foundations`.

Legend: **Built** works end to end in the API and portal. **Partial** exists but is missing part of the specified behavior. **Missing** has no implementation.

## 1. Summary

| Milestone (document 06) | State | Notes |
| --- | --- | --- |
| M0 Foundations of the build | Mostly built | Monorepo, `packages/ui`, `packages/contracts`, `packages/config` (ESLint, Prettier, tsconfig), Prisma schema, emoji check, Dockerfiles, dev and self-hosted Compose, Caddyfile and GitHub Actions exist. Lint, format, typecheck, build and tests pass locally. The images have not been built yet; the first CI run is the check |
| M1 Platform core | Mostly built | Identity, MFA, tenancy, RLS, roles, entitlements, audit, outbox, files and console provisioning exist. Redis cache, structured logging and malware scanning do not |
| M2 School core | Mostly built | Setup, structure, people, admissions, enrollment, imports, attendance, timetable and calendar exist. Duplicate detection, custom-field definitions and IndexedDB offline storage do not |
| M3 Teaching and results | Mostly built | Assignments, submissions, materials, assessments, marks workflow, revisions and report-card PDFs exist. Transcripts and the report-card template designer do not |
| M4 MySeed Connect | Mostly built | Link codes, link requests, verifications, connections, Connect API, signed webhooks, contract tests and `packages/sdk` (typed client, webhook verifier and installer, tested against the API) exist. The Education System installs itself with a one-time code and receives every event at its webhook (section 7). Replication into MySeed was removed (section 4) |
| M5 Communication and fees | Mostly built | Announcements, messaging, SMS, templates, delivery log, fees, invoices, receipts, refunds and Chapa exist. Reconciliation and a telebirr adapter do not |
| M6 Apps and pilot | Missing | Self-hosted package, backups and restore drill, load tests and legal review have not started. The apps live in other repositories |
| M7 Expansion | Partial | Basic library, transport, clubs, behavior, assets and staff leave exist as simple record modules |

## 2. What has been built

### 2.1 Platform and foundations

| Area | Evidence |
| --- | --- |
| Monorepo | pnpm workspaces and Turborepo; `apps/api`, `apps/portal`, `packages/contracts`, `db`, `ui`, `calendar`, `sdk`, `config` |
| Build and delivery | `pnpm lint` (ESLint flat config from `packages/config`, zero warnings); `apps/api/Dockerfile` (API, worker and migrations in one image, optional Chromium for PDFs); `apps/portal/Dockerfile` (Next.js standalone); `deploy/compose/docker-compose.dev.yml`; `deploy/compose/docker-compose.selfhosted.yml` with a migrate step that also sets the app role password; `deploy/caddy/Caddyfile`; `.github/workflows/ci.yml` (emoji check, lint, typecheck, build, tests against Postgres, image build, Trivy scan, SBOM and provenance, keyless cosign signing on push) |
| Health | `GET /api/v1/public/health` checks the database; used by the container health checks |
| API | NestJS on Express, versioned `/api/v1` and `/connect/v1`, OpenAPI with Swagger UI generated from Zod (`apps/api/src/openapi.ts`) |
| Database | Prisma schema with about 95 models; migrations `0001_init`, `0002_row_level_security`, `0003_integration_views` and `0004_drop_integration_views`; restricted app role so RLS applies |
| Tenancy | Tenant resolved from host (`core/tenant-host.ts`) or Connect token; RLS on tenant tables; isolation tests in `test/security.test.ts` |
| Production secrets | The API refuses to start with `NODE_ENV=production` when a secret is missing, a development default, or a `change-me` placeholder |
| Staff authentication | Argon2id passwords, TOTP MFA with an admin-required setting, sessions, invitations, password reset, login rate limits |
| Platform console | Under `apps/portal/app/platform`: tenants, catalog, clients, hosting requests, licenses, quotes, operations, support, audit |
| Entitlements | Module catalog of 23 keys and 6 limit keys in `packages/contracts/src/modules.ts`; plans, plan versions, subscriptions, overrides, dependency resolution and a package price estimator |
| Audit | Audit events on sensitive changes; platform audit log; support access grants |
| Outbox and worker | Outbox table, relay to webhook deliveries, exponential backoff, `dead` status after 12 attempts, Postgres job queue claimed with `SKIP LOCKED`, scheduled jobs every minute |
| Files | Local disk or S3-compatible storage, signed URLs, file access log, per-tenant size limits |
| Idempotency | `Idempotency-Key` handled in the request pipeline and used by finance, Connect and portal forms |
| Localization | Ethiopian and Gregorian calendar package with tests; English and Amharic interface strings for navigation and common actions |
| Public site | Features, pricing with package builder, hosting, developers, schools directory, report-card verification, contact, privacy, terms |

### 2.2 School modules

| Module (document 02) | State | Evidence and gaps |
| --- | --- | --- |
| 4.1 Organization setup | Built | School profile, logo, campuses, operational settings, academic template. Configuration history is only in the audit log |
| 4.2 Admissions and enrollment | Partial | Applications, enrollment, promotion, bulk import with dry run. Duplicate detection and authorized merge are missing |
| 4.3 Student information | Partial | Students, guardians with access profiles, documents, correction requests. Custom fields are a free-form JSON value with no definitions, types or role visibility |
| 4.4 Staff | Built | Staff, departments, teaching assignments, invitations. HR and payroll not started |
| 4.5 Academic structure and grading | Built | Years, terms, levels, grades, streams, sections, subjects, grading rules, versioned academic configuration, promotion |
| 4.6 Attendance | Partial | Daily and period sessions, corrections, reports, absence alerts. Offline drafts use `localStorage`, not IndexedDB, and conflicting edits by two staff are not flagged |
| 4.7 Timetable and calendar | Partial | Periods, slots, teacher, room and section conflict check, calendar events. A basic generator (`POST /api/v1/timetable/generate/:sectionId`) suggests a draft from periods per week and teacher clashes; rooms, workload limits and teacher availability are not considered |
| 4.8 Assignments | Built | Submission types, scheduling, offline marks, due-soon reminders |
| 4.9 Materials library | Partial | Versions, audiences, access policies, signed URLs, access log. Malware scanning (ClamAV) is missing |
| 4.10 Assessments and report cards | Partial | Marks workflow, published-mark revisions, report-card PDF and verification code. Template designer and transcripts are missing |
| 4.11 Fees and payments | Partial | Fee structures, invoice generation, discounts with approval, payments, void, receipts, refunds with maker-checker, statements, reminders, Chapa callback, sandbox provider. Reconciliation and a working telebirr adapter are missing |
| 4.12 Communication | Partial | Announcements, conversations, SMS, templates, delivery log, Iconic SMS and SMTP adapters. Office hours, auto-reply and conversation reassignment are missing |
| 4.13 Guardian access profiles | Built | Stored per student-guardian link and applied by the Connect API |
| 4.14 MySeed connections | Built | Codes, requests, verification methods, connections, revoke, settings |
| 4.15 Reports and exports | Partial | Standard reports, CSV and XLSX import and export for every resource. Export jobs with 7-day expiry, the report builder and scheduled reports are missing |
| 4.16 Audit and data governance | Partial | Audit events and privacy requests exist. Whole-tenant export and retention policies are missing |
| 4.17 Optional modules | Partial | Library, transport, clubs, behavior, assets and staff leave exist as basic registers. Boarding, feeding, HR and payroll, advanced accounting, clinic, alumni and government adapters are missing |

### 2.3 Tests

78 API tests across `connect`, `platform-finance`, `roles-and-data`, `school-workflows`, `security` and `sdk`, all passing on 16 October 2026. They cover tenant isolation, staff authentication, plans and modules, every linking method, Connect reads and writes, finance, workflows and import and export. `sdk.test.ts` drives the real server through `@myseed/schoolhub-sdk`, so every Connect response is parsed with the contract schemas, and checks that webhooks signed by the server verify with the SDK. `install.test.ts` installs a client with the SDK and a one-time code, follows an event to its webhook and checks the directory switch. The portal has a Playwright crawl (`apps/portal/e2e`, `pnpm test:e2e`) that signs in as each of the 15 role accounts of Bole Academy, the owners of three schools on smaller packages or suspended, the four platform roles and an anonymous visitor, opens every screen reachable from that account's navigation and fails on a 404, a 5xx, a failed API call, a console error or a failure screen. Accessibility checks with axe are not in the crawl yet.

## 3. What is missing

Grouped by area. The milestone column shows where document 06 places the work.

### 3.1 Infrastructure and operations

| Item | Milestone |
| --- | --- |
| First successful image build, and a self-hosted Compose start on a clean server (written, not yet run) | M0 |
| (Done) Prettier applied in one commit, listed in `.git-blame-ignore-revs`; `pnpm format:check` runs in CI | M0 |
| Portal `NEXT_PUBLIC_*` values are compiled in, so each domain needs its own portal build; move them to runtime configuration before self-hosted images are published | M6 |
| Redis entitlement and gateway cache invalidation (the resolver is in-process today) | M1 |
| Structured JSON logging with request and tenant IDs and PII redaction (Pino); OpenTelemetry; Sentry | M1 |
| Malware scanning of uploads before they become visible | M1 |
| Realtime updates (Socket.IO gateway) for messages and attendance completion | M5 |
| Self-hosted scripts: install, upgrade with pre-upgrade backup, backup, restore, diagnostics bundle | M6 |
| Signed license file validation, 30-day grace period, feature freeze on expiry | M6 |
| Backup restore drill and smoke suite on a clean environment (launch security test 10) | M6 |
| Load tests to validate the 2,000-student minimum host | M6 |

### 3.2 Packages

| Item | Notes |
| --- | --- |
| `packages/i18n` | Strings live in `apps/portal/lib/i18n.tsx`. Move to a shared catalog and cover all screens in Amharic, not only navigation |

### 3.3 Product features

| Item | Source |
| --- | --- |
| Student duplicate detection and authorized merge | 02 section 4.2 |
| Custom field definitions with type, required flag and role visibility | 02 section 4.3 |
| Sensitive-category enablement flow (owner, purpose, restricted role) | 02 section 4.3 |
| Attendance offline storage in IndexedDB and conflict flagging | 02 section 4.6 |
| Timetable generator constraints: rooms, workload limits, teacher availability | 02 section 4.7 (P1) |
| Report-card template designer; bilingual layouts | 02 section 4.10 |
| Transcripts for leavers and graduates | 02 section 4.10 (P1) |
| Payment reconciliation and settlement reports | 02 section 4.11 |
| telebirr adapter with verified callback | 02 section 4.11, decision D7 |
| Export jobs with expiry; report builder; scheduled reports | 02 section 4.15 |
| Whole-tenant export and retention policies | 02 section 4.16 |
| Messaging office hours, auto-reply and reassignment on staff departure | 02 section 4.12 |
| MySeed learning progress shared with a school | 03 section 12 (P1) |
| Self-hosted relay connector | 03 section 14 (P1) |
| Sign in with MySeed ID for staff | 05 section 1 (P1) |
| Accessibility checks (axe) in the portal crawl | 06 section 3.1 |
| Light and dark, 360/768/1280 px and screen-reader pass on every screen | 06 section 3.1 (not verified) |

### 3.4 Open decisions still open

D1 to D8 in document 06 section 4 have no recorded outcome. D4 (academic defaults) was due before the end of M2 and D7 (first payment adapters) before M5; both are now overdue against the build.

## 4. Drift between the code and the specification

These need a decision: either change the code or update the specification.

| Topic | Specification | Code | Recommendation |
| --- | --- | --- | --- |
| Copying school data into MySeed | Decision 4 and `CLAUDE.md`: the gateway reads through with a short cache; school data is not copied into MySeed | Resolved 16 October 2026: the change feed, the snapshot, their schemas and the integration views were removed (migration `0004_drop_integration_views`) | Done. Webhooks plus Connect reads are the only path |
| Job queue | Redis and BullMQ | Postgres `jobs` table with `SKIP LOCKED` | Acceptable for v1 and simpler for self-hosted. Update document 05 to record it |
| Console app | Separate `apps/console`, never shipped to self-hosted | Console routes inside `apps/portal` under `/platform` | Either split before M6 or make the console routes compile out of the self-hosted build |
| Worker app | Separate `apps/worker` | `apps/api/src/worker.ts` in the API package | Acceptable; record it in document 05 |
| Web i18n | next-intl | Custom dictionary provider | Acceptable if the catalog moves to a shared package and covers all screens |
| Module catalog | Keys in document 06 section 2.2 | Code adds `module.lesson_plans`, `module.messaging`, `module.discipline`, `module.activities` and `module.hr`, and has no `module.boarding` or `module.hr_payroll` | Update document 06 to match the code, then add the keys from document 08 |
| Report-card PDF | Rendered by the worker | Rendered on request in the API with `playwright-core`; returns a printable view when Chromium is absent | Move to a worker job before load testing |

## 5. Suggested next steps

1. Commit the current tree in reviewable pieces so the history reflects what exists, then push so the first CI run builds the images.
2. Record the remaining drift decisions in section 4 (job queue, worker, console split, i18n, module keys, PDF rendering) in documents 05 and 06.
3. Run the end-to-end crawl of every portal screen per role and fix what it finds.
4. Close the M2 to M5 gaps in section 3.3 marked P0.
5. Start the M6 self-hosted package: install and upgrade scripts around the Compose file, backups and the restore drill.
6. Plan the additions in document 08 into milestones.

## 6. Changes on 16 October 2026

- `packages/sdk`: `ConnectClient` (token caching, subject and connection scoping, idempotency keys, retries, contract validation of every response), `verifyWebhook` (HMAC-SHA256, timestamp window, timing-safe compare, secret rotation) and a README.
- `packages/config` with the shared ESLint flat config, Prettier settings and the base tsconfig; the root files point at it. Lint is clean with zero warnings.
- Dockerfiles, Compose files, Caddyfile and the CI workflow listed in section 2.1.
- Fixed: the CORS rule for school subdomains escaped `$` in a template literal, so it never matched a school host.
- Fixed: starting in production with development secrets is now refused.
- New: `GET /api/v1/public/health`, with the `healthStatus` schema in `packages/contracts`.
- `prisma` is now a runtime dependency of `@myseed/db`, so the image can run migrations.
- Replication removed: no change feed, no snapshot, no integration views (decision 4 kept).
- Prettier applied to the tree; formatting is checked in CI.

## 7. Changes on 16 October 2026, second pass

- Every role has its own landing screen, **My workspace** (`/home`), chosen by the role's workspace: school administration, registrar, academic office, teaching, finance, communication, library, transport, student support, operations or audit. It shows that role's starting actions (only those its permissions and the school's modules allow), its approvals, the teacher's day, and the figures the role may see. Sign-in, invitation acceptance and the school root now land there.
- Screens no longer call endpoints the viewer cannot use: reference lists (years, grades, sections, terms), teaching assignments, timetables and class lists are requested only when the role may read them, and links to class lists, grading rules and timetables are shown only to roles that can open them. The crawl found these as 403 responses for the accountant, cashier, communication officer, librarian, transport officer, counselor and HR officer.
- Platform console: each action is shown to the platform roles the API allows (administrator, sales, developer); other roles see a read-only note. The API now checks the role on editing a school, removing an override (which is also scoped to the school in the address) and switching a Connect client.
- MySeed integration (migration `0005_connect_install`): one-time install codes, `GET /connect/v1/discovery`, `POST /connect/v1/install`, `GET /connect/v1/client`; the worker delivers every event of a Connect-enabled school to each installed client's webhook and records the result; the console page **MySeed integration** issues codes, edits the webhook, rotates the secret and sends a signed test; `pnpm connect:code` issues a code without the console; the SDK has `installSchoolHub`, `clientFromInstallation`, `status()` and the `myseed-schoolhub-install` command; `packages/sdk/examples/dev-gateway.mjs` is a local stand-in for the gateway.
- The school's **Show in the app school search** setting was saved but never read; the Connect directory now honors it. The Integrations page shows the MySeed setup steps, gateway status and connection counts.
- The platform client list no longer returns secret fields.
- `tools/control-panel`: a Python control panel for the stack (services, tasks, schools, accounts, tables, SQL, backups, queues, MySeed integration). See its README.
- The seed gives each school a memorable subject-teacher account. All demo sign-ins are listed in `CREDENTIALS.md`.
