# MySeedSchoolHub progress report

Progress as of 2026-11-23, from the code, configuration and git history at commit `16e8c19`. The last full written status is [build status and gaps](../existing/07-build-status-and-gaps.md), dated 16 October 2026; much of what it lists as missing has since been added to the code, and this report supersedes it where they differ.

> [!IMPORTANT]
> All work since the initial commit is on the local branch `build/m0-sdk-foundations`. `origin/main` holds only the initial commit (`f67f9cb`), and the branch has no upstream. CI therefore has not run on any of this code, no container image has been built or pushed, and there is no record of a live deployment.

## 1. Summary

| Item | State |
| --- | --- |
| What is built | API (`apps/api`) with 58 controllers in 45 files, worker, Connect API and SDK, portal with 150 screens (`page.tsx` files) (school portal, platform console, public site), 15 database migrations and 159 Prisma models, self-hosting kit (Compose, Caddy, install, upgrade, backup, restore, diagnostics scripts), local control panel |
| What is open | First CI run and image build; any live deployment; self-hosted install on a clean server; restore drill; load test against the minimum host; open decisions D1 to D8; full Amharic coverage; IndexedDB offline attendance; mobile apps (other repositories) |
| Test suites | 18 Vitest API suites (`apps/api/test`, about 180 test cases), 1 calendar suite (`packages/calendar/src/calendar.test.ts`), 2 Playwright suites (`apps/portal/e2e/crawl.spec.ts` role crawl, `apps/portal/e2e/a11y.spec.ts` with 60 accessibility checks) |
| Last recorded test results | 16 October 2026: API suite and calendar tests passed (document 07). 15 November 2026: 60 of 60 accessibility checks passed after fixes ([continuation note](../existing/CONTINUATION.md)). To confirm: the suites were not run for this report, and no recorded run covers the commits of 16 November 2026 |
| Where production runs | Not found in the code. Hosting provider and region are open decision D3 |
| Commits | 48 on `build/m0-sdk-foundations`, from 2026-10-13 to 2026-11-16 |
| Contributors (git authors) | 1: Kidus Sebsibe (48 commits) |
| Tags and releases | None |
| Uncommitted changes | Whitespace-only additions in three portal pages under `apps/portal/app/(app)/builders/` (branding, reports, theme) |

## 2. Status by area

Legend: **Done** built and checked by an automated suite or recorded run. **Built** in the code end to end but not covered by a recorded passing run, or not checked on a live system. **In progress** partly built.

### 2.1 Platform and foundations

| Area | State | Evidence | Still open |
| --- | --- | --- | --- |
| Monorepo, tooling, lint, format, emoji check | Done | `package.json`, `turbo.json`, `packages/config`, `scripts/check-emoji.mjs` | None |
| Tenancy and row-level security | Done | `packages/db/prisma/migrations/0002_row_level_security`, `apps/api/src/core/tenant-host.ts`, `apps/api/test/security.test.ts` | None known |
| Staff authentication (Argon2id, TOTP MFA, lockout, sessions, invitations, reset) | Done | `apps/api/src/modules/auth.ts`, `apps/api/test/security.test.ts` | None known |
| Sign in with MySeed ID for staff | Built | `apps/api/src/modules/auth-myseed.ts`, `MYSEED_ID_*` settings | Not tested against a real MySeed identity provider |
| Roles, permissions, entitlements | Done | `packages/contracts/src/permissions.ts`, `packages/contracts/src/modules.ts`, `apps/api/src/core/entitlements.ts` | Module catalog in document 06 does not match the code (drift item in document 07 section 4) |
| Audit and support access | Done | `apps/api/src/core/audit.ts`, `apps/api/src/modules/platform/support.ts` | None known |
| Outbox, webhooks, job queue, scheduler | Done | `apps/api/src/core/outbox.ts`, `apps/api/src/worker/runner.ts` | None known |
| Files and storage (disk or S3), signed URLs | Done | `apps/api/src/core/storage.ts` | S3 not checked against a real bucket |
| Malware scanning (ClamAV) | Built | `apps/api/src/core/scan.ts`, `clamav` service in the self-hosted Compose file | Not checked with a running ClamAV daemon |
| Structured logging, PII redaction, Sentry-compatible error reporting | Built | `apps/api/src/core/logger.ts` | Not connected to a real error-reporting endpoint |
| Message bus and shared cache (Postgres LISTEN/NOTIFY, optional Redis) | Built | `apps/api/src/core/cache.ts` | Redis path not checked on a live system |
| Live updates to the portal (event stream) | Built | `apps/api/src/core/live.ts`, `apps/portal/lib/live.ts` | None known |
| Self-hosted license (Ed25519, 30-day grace, read-only after) | Built | `apps/api/src/core/license.ts`, `/platform/licenses` | Not run end to end on a self-hosted server |
| Relay for self-hosted servers without a public address | Built | `apps/api/src/core/relay-client.ts`, `apps/api/src/modules/relay.ts` | Not run against a real MySeed relay |
| Production secret checks | Done | `apps/api/src/config.ts` refuses development secrets when `NODE_ENV=production` | None |
| Localization (Ethiopian calendar, English and Amharic strings) | In progress | `packages/calendar`, `apps/portal/lib/i18n.tsx` | Amharic covers navigation and common actions only; [Amharic plan](../existing/09-amharic-plan.md) not started; no shared `packages/i18n` |

### 2.2 School modules

| Area | State | Evidence | Still open |
| --- | --- | --- | --- |
| Organization setup, branding, theme builder, website studio, media manager | Built | `/admin/school`, `/builders/*`, `/admin/website`, commits of 2026-11-13 to 2026-11-16 | Website studio and theme builder have no API test beyond `apps/api/test/theme.test.ts` |
| Admissions, enrollment, promotion, import | Done | `apps/api/src/modules/admissions.ts`, `apps/api/test/school-workflows.test.ts` | None known |
| Student information, guardians, custom fields, duplicates, corrections | Built | `apps/api/src/modules/people.ts`, `people-ext.ts`, `/people/duplicates`, `/admin/custom-fields` | Duplicate detection and custom fields were missing on 16 October; now present in the code, test coverage to confirm |
| Staff, HR, leave, evaluation | Built | `/people/staff`, `/operations/leave`, `/people/evaluation` | None known |
| Academic structure and grading | Done | `apps/api/src/modules/academics`, `apps/api/test/teaching.test.ts` | Academic defaults need pilot validation (decision D4) |
| Attendance | In progress | `apps/api/src/modules/attendance.ts`, `/attendance/take` | Offline drafts use `localStorage`, not IndexedDB; conflicting edits are not flagged |
| Timetable and calendar | Built | `/timetable`, `/calendar`, booking guards in migration `0010_booking_guards` | Generator does not consider rooms, workload limits or teacher availability (document 07) |
| Assignments, materials, lesson plans | Done | `apps/api/src/modules/learning.ts`, `apps/api/test/teaching.test.ts` | None known |
| Exams (scheduling, check-in, online exam, simulator) | Done | `apps/api/src/modules/exams.ts`, migration `0011_exams`, `apps/api/test/exams.test.ts` | Webcam snapshots (decision 12) not found in the code; fee and attendance eligibility rules for admission cards exist |
| Assessments, gradebook, report-card workflow and designer | Done | `apps/api/src/modules/results`, migration `0013_report_card_workflow`, `apps/api/test/report-card-workflow.test.ts`, `apps/api/test/card-designer.test.ts` | None known |
| Transcripts and certificates | Built | `apps/api/src/modules/documents/transcript.ts`, `certificate.ts`, migration `0015_certificates` | Certificates have no API test; not functionally validated (continuation note of 15 November 2026) |
| ID cards | Done | `apps/api/src/modules/idcards.ts`, `apps/api/test/card-designer.test.ts` | None known |
| Fees, invoices, payments, refunds, discounts | Done | `apps/api/src/modules/finance`, `apps/api/test/platform-finance.test.ts` | None known |
| Online payments (Chapa, telebirr), bank transfers, reconciliation | Built | `apps/api/src/core/providers/adapters.ts`, `apps/api/src/modules/finance/reconcile.ts`, `transfers.ts` | Not checked against live Chapa or telebirr accounts; decision D7 has no recorded outcome |
| Accounting and payroll | Built | `apps/api/src/modules/accounting.ts`, `payroll.ts` | Test coverage to confirm |
| Communication (announcements, messaging, SMS, templates, deliveries, office hours) | Done | `apps/api/src/modules/communication.ts`, `messaging.ts`, `apps/api/test/school-workflows.test.ts` | Not checked against a live Iconic SMS account or SMTP server |
| MySeed connections and Connect API | Done | `apps/api/src/modules/connect`, `apps/api/test/connect.test.ts`, `install.test.ts`, `sdk.test.ts` | Not checked against the real Education System School Gateway |
| Reports, report builder, scheduled reports, exports | Built | `apps/api/src/modules/reports`, `apps/api/src/modules/data` | Report builder test coverage to confirm |
| Data governance (privacy requests, retention, whole-tenant export) | Built | `apps/api/src/modules/governance.ts`, nightly retention in `apps/api/src/worker/runner.ts` | Retention runs have not been observed on a live system |
| Optional modules (library, transport, clubs, behavior, assets, clinic, boarding, canteen, alumni) | Built | `apps/api/src/modules/operations.ts`, `operations-ext.ts`, `apps/api/test/expansion-school.test.ts` | Government reporting adapters (`module.gov_reporting`) to confirm |
| Assistant (natural-language navigation) | Done | `packages/contracts/src/assistant.ts`, `apps/api/test/assistant.test.ts` | Runs on a local catalog; no external AI provider and no school AI key storage was found in the code (decision 11) |

### 2.3 Platform console

| Area | State | Evidence | Still open |
| --- | --- | --- | --- |
| Tenants, catalog, plans, overrides, quotes, hosting requests | Done | `apps/api/src/modules/platform`, `apps/api/test/platform-finance.test.ts`, `expansion-platform.test.ts` | Prices and capacity bands (decision D5) |
| Licenses, Connect clients, install codes, providers, templates, team, support, events, audit, settings | Built | `/platform/*` routes | None known |

### 2.4 Delivery and operations

| Area | State | Evidence | Still open |
| --- | --- | --- | --- |
| CI workflow | Built | `.github/workflows/ci.yml` | Has never run: the branch is not pushed |
| Container images (API, portal) | Built | `apps/api/Dockerfile`, `apps/portal/Dockerfile` | Never built; Ethiopic font install in the API image not verified |
| Self-hosted Compose, Caddy, install, upgrade, backup, restore, diagnostics | Built | `deploy/compose`, `deploy/caddy/Caddyfile`, `deploy/scripts` | Never run on a clean server; no restore drill |
| Load test | Built | `scripts/load-test.mjs` | No recorded run against the 2,000-student minimum host |
| Portal edition switch (no console on self-hosted) | Built | `NEXT_PUBLIC_SCHOOLHUB_EDITION` in `apps/portal/middleware.ts` | Portal `NEXT_PUBLIC_*` values are compiled in, so each domain needs its own portal build |

## 3. Built but not yet checked on the live system

There is no live system recorded in the repository, so every item below is checked only locally or not at all.

- [ ] CI pipeline: emoji, format, lint, typecheck, build, tests, image build, Trivy scan, SBOM, provenance and cosign signing.
- [ ] API and portal images build and start; Amharic text prints in PDFs from the image.
- [ ] Self-hosted install with `deploy/scripts/install.sh` on a clean server, including automatic HTTPS through Caddy.
- [ ] Upgrade with automatic rollback (`deploy/scripts/upgrade.sh`) and restore drill (`deploy/scripts/restore.sh`).
- [ ] Chapa and telebirr checkout, callbacks and refunds with real merchant accounts.
- [ ] Iconic SMS and SMTP delivery with real credentials.
- [ ] S3-compatible storage with a real bucket.
- [ ] ClamAV scanning with a running daemon.
- [ ] Sentry-compatible error reporting with a real endpoint.
- [ ] Redis message bus with several API processes.
- [ ] Self-hosted license expiry, grace period and read-only mode.
- [ ] Relay connection to a MySeed relay.
- [ ] Sign in with MySeed ID against the real identity provider.
- [ ] Connect API and webhooks with the real Education System School Gateway.
- [ ] Load test at the minimum host size.
- [ ] Keyboard, screen-reader and dialog testing beyond the automated axe checks.

## 4. Risks

| Risk | Why it matters | What reduces it |
| --- | --- | --- |
| All work exists only on one local branch | A lost or damaged development machine loses the work; nobody else can review it | Push the branch and open a pull request |
| CI has never run | Build, test and image problems on Linux are unknown | First push triggers `.github/workflows/ci.yml` |
| Large unreviewed commits | Commits of 2026-11-11 to 2026-11-16 add many features at once, several without tests (certificates, website studio, media manager) | Review in pieces; add API tests for certificates and website studio |
| Status documents are stale | Document 07 (16 October 2026) lists as missing many items now in the code; `docs/BUILD_FEATURES.md` uses roadmap phase names not found elsewhere | Use this report; update document 07 |
| Open decisions D1 to D8 | D4 and D7 are overdue against the build; D3 (hosting) and D6 (legal review of children's data) block a pilot | Record outcomes in document 06 |
| Children's data and legal review | Users are mostly minors; Ethiopia's Personal Data Protection Proclamation No. 1321/2024 applies | Decision D6 before any pilot |
| Compiled-in portal settings | Each domain needs its own portal build, which blocks generic self-hosted images | Move `NEXT_PUBLIC_*` values to runtime configuration |
| Single contributor | Knowledge sits with one person | These documents; code review by a second developer |

## 5. Recommended order for what is next

1. Push `build/m0-sdk-foundations`, open a pull request to `main` and get CI green, including the image build.
2. Run the full local suites (`pnpm test`, `pnpm test:e2e`, the accessibility audit) on the current commit and record the results.
3. Add API tests for certificates, website studio, media manager, report builder, accounting and payroll.
4. Record decisions D1 to D8 and the drift items in document 07 section 4.
5. Move portal `NEXT_PUBLIC_*` settings to runtime configuration so one image serves any domain.
6. Run the self-hosted install, upgrade, backup and restore scripts on a clean server and record a restore drill.
7. Run `scripts/load-test.mjs` against the minimum host.
8. Connect real provider accounts (Chapa, telebirr, Iconic SMS, SMTP, S3) in a staging environment.
9. Choose hosting (D3) and stand up a staging and then a production environment.
10. Complete the Amharic plan and the manual accessibility pass, then the pilot with one private and one public school (milestone M6).
