# MySeedSchoolHub test plan

Written on 2026-11-23 from the test code and CI workflow at commit `16e8c19`. Requirement IDs refer to the [SRS](SRS.md).

## 1. Test levels and commands

Run all commands from the repository root after `pnpm install` and `pnpm build`.

| Level | What it checks | Command | Needs |
| --- | --- | --- | --- |
| Static checks | No emoji, formatting, lint with zero warnings, TypeScript types | `pnpm check:emoji`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck` | Nothing else |
| Build | Every package and app compiles; Next.js production build | `pnpm build` | Nothing else |
| Unit | Ethiopian calendar conversion and formatting | `pnpm --filter @myseed/calendar test` | Nothing else |
| API integration | Real NestJS app against a real Postgres with RLS, through HTTP (supertest) | `pnpm test` (runs the API and calendar suites through Turborepo) or `pnpm --filter @myseed/api test` | Postgres on `localhost:55432` (`pnpm db:start`); the suite migrates and seeds `schoolhub_test` itself |
| Contract | Every Connect response parsed by the SDK with the contract schemas; webhook signatures verify with the SDK | Part of the API suite: `apps/api/test/sdk.test.ts`, `install.test.ts`, `connect.test.ts` | As API integration |
| End to end (role crawl) | Signs in as every role and opens every screen in its navigation; fails on 404, 5xx, failed API call, console error or failure screen | `pnpm test:e2e` | Running stack with the demo seed (`pnpm dev` or the control panel) |
| Accessibility | axe checks and 360 px overflow on 20 core pages in desktop light, desktop dark and phone light (60 checks) | `pnpm --filter @myseed/portal exec playwright test e2e/a11y.spec.ts --workers=3` | Running stack with the demo seed |
| Load | Concurrent staff on the busiest screens; fails when any endpoint p95 is above 800 ms or more than 1 percent of requests fail | `node scripts/load-test.mjs --host bole-academy.localhost:3000 --users 50 --seconds 60` | Running API and seed; `--password <demo password>` and `--secret <INTERNAL_PROXY_SECRET>` |
| Container scan | Critical vulnerabilities with a fix available | CI job `images` (Trivy) | CI |
| Self-hosted install, upgrade, restore | Scripts in `deploy/scripts` | Manual on a clean Linux server | Docker, a domain |

> [!TIP]
> On Windows, run the API tests from a PowerShell session whose working directory uses an uppercase drive letter (`C:\...`), and rebuild `packages/contracts` (`pnpm --filter @myseed/contracts build`) after changing contracts, before running API tests.

### 1.1 API suites

| File | Area |
| --- | --- |
| `apps/api/test/security.test.ts` | Tenant isolation, authentication, lockout, MFA, sessions |
| `apps/api/test/roles-and-data.test.ts` | Roles, permissions, import and export |
| `apps/api/test/school-workflows.test.ts` | Admissions, attendance, communication, workflows |
| `apps/api/test/teaching.test.ts` | Academics, assignments, materials, lesson plans |
| `apps/api/test/exams.test.ts` | Exams, eligibility, check-in |
| `apps/api/test/report-card-workflow.test.ts` | Report-card workflow and publication |
| `apps/api/test/card-designer.test.ts` | Report-card and ID card designers |
| `apps/api/test/platform-finance.test.ts` | Plans, modules, entitlements, finance |
| `apps/api/test/expansion-platform.test.ts` | Platform console desks |
| `apps/api/test/expansion-school.test.ts` | Operations modules and school expansion |
| `apps/api/test/expansion-integrations.test.ts` | Provider adapters through a faked fetch |
| `apps/api/test/connect.test.ts` | Linking, Connect reads and writes, sandbox payments |
| `apps/api/test/install.test.ts` | One-time install, webhook delivery, directory switch |
| `apps/api/test/sdk.test.ts` | SDK against the real server |
| `apps/api/test/list-work.test.ts` | Bulk list operations, recycle bin |
| `apps/api/test/dashboard-trends.test.ts` | Dashboard figures and trends |
| `apps/api/test/theme.test.ts` | Themes and branding |
| `apps/api/test/assistant.test.ts` | Assistant catalog matching against `assistant-requests.ts` |

## 2. Where tests run

| Where | What runs | Notes |
| --- | --- | --- |
| Local | Everything in section 1 | Embedded Postgres from `pnpm db:start`; the control panel Tasks tab runs the same commands |
| CI (`.github/workflows/ci.yml`, job `checks`) | Emoji check, format check, lint, typecheck, build, `pnpm test` against a `postgres:17.6-bookworm` service | On pull requests, pushes to `main` and `v*` tags |
| CI (job `images`) | Docker build of API and portal, Trivy scan; on push also SBOM, provenance and cosign signing | After `checks` passes |
| Staging | `pnpm test:e2e` with `PORTAL_ROOT` set to the staging root host | To confirm: no staging environment is recorded |

> [!WARNING]
> The end-to-end crawl, the accessibility audit and the load test are not in CI. CI itself has not yet run on this code because the working branch has not been pushed.

## 3. What is faked

| Dependency | How it is replaced in tests |
| --- | --- |
| Payment providers | A sandbox provider (`/api/v1/payments/sandbox/:id/complete`) in `connect.test.ts`; provider HTTP calls go through `setProviderFetch` with a fake in `expansion-integrations.test.ts` |
| SMS and email | Without credentials, adapters log deliveries instead of sending |
| Object storage | Local disk in a temporary folder (`STORAGE_FS_ROOT`) |
| Education System | The SDK and test helpers act as the Connect client; `packages/sdk/examples/dev-gateway.mjs` is a local stand-in gateway for manual runs |
| Platform webhook | `PLATFORM_WEBHOOK_URL` empty in tests |
| ClamAV, Redis, Sentry, MySeed ID, relay | Not configured in tests, so their code paths are not exercised |
| Time | Real time; scheduled duties are called directly through `tick` and `scheduled` |

The database is never faked: suites run against Postgres with RLS and the restricted app role.

## 4. Devices and networks

| Target | How it is covered |
| --- | --- |
| Desktop Chrome | Playwright `Desktop Chrome` device in the crawl and the audit |
| Phone width 360 px | Accessibility audit phone mode checks overflow |
| Light and dark themes | Accessibility audit |
| Other browsers (Firefox, Safari), real phones | Not covered |
| Slow or offline networks | Not covered by automated tests; offline attendance drafts to test by hand |
| Self-hosted server without a public address | Not covered (relay) |

## 5. Release test cases

| ID | Test | Steps | Expected | Covers |
| --- | --- | --- | --- | --- |
| TC-1 | Tenant isolation | As a School A user, request School B records by ID, host and parameters | No School B data is returned or changed | FR-1, NFR-1, DR-1 |
| TC-2 | Sign-in, lockout and MFA | Fail sign-in repeatedly; then sign in with MFA required for an administrator | Lock message after the limit; MFA setup required | FR-2, FR-3, FR-4 |
| TC-3 | Role landing and permissions | Run `pnpm test:e2e` | Every role lands on its workspace and opens every screen in its navigation without errors | FR-6, FR-7, FR-63 |
| TC-4 | Module gating | Remove a module from a school with an override, open its screens and API | Screens hidden; API returns module disabled | FR-6, FR-11 |
| TC-5 | Support access grant | As platform support, open school data with and without a grant | Refused without; allowed and audited with | FR-8, FR-9 |
| TC-6 | License expiry | Install an expired license past grace on a self-hosted build | Writes fail; exports still work | FR-14 |
| TC-7 | Admission to enrollment | Submit the public admission form, accept, enroll, promote | Student enrolled in a section; promotion creates new enrollment | FR-19, DR-3 |
| TC-8 | Import dry run | Import a CSV with errors in dry-run mode | Errors listed per row; nothing written | FR-23 |
| TC-9 | Recycle bin and undo | Delete records in bulk, undo, delete again, restore from the bin | Records return each time | FR-24, DR-9 |
| TC-10 | Attendance and absence alert | Take attendance with an absent student who has a connected guardian | Event delivered to the client webhook | FR-26, FR-54 |
| TC-11 | Timetable clash | Save two slots for one teacher at the same time | Second save refused | FR-28 |
| TC-12 | Scheduled publishing | Schedule an assignment, announcement and material for one minute ahead; run the worker | All three published; events emitted | FR-31, FR-33, FR-46 |
| TC-13 | Due-soon events | Create an assignment due within 24 hours with one submitted student | Due-soon event only for students who have not submitted | FR-32 |
| TC-14 | Marks workflow | Enter, submit, approve, publish marks; read through Connect before and after; edit a published mark | Not visible before publish; edit creates a revision and audit event | FR-36, FR-8, DR-3 |
| TC-15 | Report card and verification | Publish a report card, open its PDF, verify its code at `/verify` | PDF renders including Amharic; verification shows minimal data | FR-37, FR-64, NFR-12, NFR-22 |
| TC-16 | Certificates | Issue single and bulk certificates, verify, revoke, verify again | Revoked status shown publicly | FR-38 |
| TC-17 | Exam eligibility and check-in | Turn on `requireFeesCleared`, list eligibility, print cards, check in by QR | Student with a balance is blocked with a reason; check-in works for eligible students | FR-35, FR-45 |
| TC-18 | Fees end to end | Create fee structure, generate invoices, discount with approval, pay, receipt, refund with a second approver | Integer amounts; refund needs a second user | FR-40, DR-2 |
| TC-19 | Overdue and due-soon invoices | Set due dates in the past and three days ahead; run the worker | `overdue` status; one due-soon event | FR-41 |
| TC-20 | Online payment callback replay | Pay through the sandbox, replay the callback | One payment only | FR-42, NFR-9 |
| TC-21 | Messaging | Guardian sends a message through Connect; teacher replies | Message appears with a live update on both sides | FR-47 |
| TC-22 | SMS to a selection | Select people in a list and send SMS without provider credentials | Deliveries logged in the delivery log | FR-49 |
| TC-23 | Linking by code and by request | Link a student by code and a guardian by request with registrar approval | Connections active only after approval | FR-50 |
| TC-24 | Access profile | Block results for a guardian, read results through Connect | Results not returned | FR-51 |
| TC-25 | Revocation | Revoke a connection and call Connect | Next call refused | FR-52 |
| TC-26 | Contract and SDK | Run `apps/api/test/sdk.test.ts` | Every response parses; webhook signatures verify | FR-53, NFR-5 |
| TC-27 | Install and directory | Install a client with a one-time code; toggle the school search setting | Events arrive at the webhook; directory follows the setting | FR-54, FR-55 |
| TC-28 | Export permission | Export as a role without and with the permission | Refused; allowed and audited | FR-61 |
| TC-29 | Retention | Run the scheduler after 02:00 Addis Ababa time | Retention runs once per school per day | FR-60, DR-7 |
| TC-30 | Production secret refusal | Start the API with `NODE_ENV=production` and a development secret | Start-up refused | NFR-2 |
| TC-31 | Accessibility and phones | Run the accessibility audit | 60 of 60 pass | NFR-19, NFR-20 |
| TC-32 | Load | Run the load test against the minimum host with the full seed | p95 at most 800 ms per endpoint; under 1 percent errors | NFR-17, NFR-18 |
| TC-33 | Backup and restore drill | Back up, restore on a clean server, run the crawl | Crawl passes on the restored server | NFR-15 |
| TC-34 | Upgrade rollback | Upgrade to a version that fails health checks | Previous version and backup restored automatically | NFR-15 |
| TC-35 | Upload scanning | Upload the EICAR test file with ClamAV running | File stays hidden and is never served | NFR-6 |
| TC-36 | Log redaction | Trigger logs containing phone numbers and emails | Values masked in the output | NFR-10 |
| TC-37 | Static and supply chain | Run CI on a pull request | Emoji, format, lint, typecheck, build, tests and Trivy pass | NFR-8, NFR-24 |
| TC-38 | Calendar | Run the calendar suite; compare dates on screens with it | Conversions match | FR-30, NFR-21 |
| TC-39 | Assistant | Run `apps/api/test/assistant.test.ts` | Accuracy at or above the asserted threshold | FR-62 |

## 6. Entry and exit criteria

### 6.1 Entry

- [ ] The change is on a branch with a pull request to `main`.
- [ ] Contract changes are in `packages/contracts` and the package builds.
- [ ] New migrations apply on an empty database and on a copy of the previous version.
- [ ] The demo seed loads (`pnpm db:seed`).

### 6.2 Exit

- [ ] CI job `checks` is green, and job `images` is green for release builds.
- [ ] `pnpm test:e2e` passes against the seeded stack.
- [ ] The accessibility audit passes 60 of 60.
- [ ] Release test cases touching the changed areas pass and are recorded.
- [ ] For a release to self-hosted schools: TC-33 and TC-34 pass on a clean server.
- [ ] `pnpm check:emoji` passes.

## 7. Known gaps

- CI has never run on this code; images have never been built.
- End-to-end, accessibility and load tests are not in CI.
- No API tests were found for certificates, website studio, media manager, accounting, payroll or the report builder.
- ClamAV, Redis, Sentry, MySeed ID, the relay, S3, Chapa, telebirr, Iconic SMS and SMTP are not exercised against real services.
- No tests on Firefox, Safari or real phones, and no slow-network tests.
- No manual keyboard and screen-reader pass.
- No restore drill or self-hosted install has been run.
- The last recorded full API run is from 16 October 2026; the suites need a fresh run on the current commit.
