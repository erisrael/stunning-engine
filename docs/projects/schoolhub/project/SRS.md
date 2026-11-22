# MySeedSchoolHub software requirements specification

Requirements as built at commit `16e8c19`, written on 2026-11-23. Outline follows IEEE 830 and ISO/IEC/IEEE 29148. Each requirement describes behavior found in the code; where the specification asks for more than the code does, the gap is in section 8.

## 1. Introduction

### 1.1 Purpose

This document states what MySeedSchoolHub does today, so the Dev team can test it, plan the remaining work and judge changes against it.

### 1.2 Scope

MySeedSchoolHub is a multi-tenant school management system for Ethiopian schools, run hosted by MySeed or self-hosted. It includes the API and Connect API (`apps/api`), the worker, the school portal, platform console and public site (`apps/portal`), shared contracts and the Connect SDK. The MySeed Education System and the MySeed Student and Parent apps are outside this repository and outside this scope, except for the interface to them.

### 1.3 Definitions

| Term | Meaning |
| --- | --- |
| Tenant, organization, school | One school or school group, with its own subdomain and data |
| Entitlement | A key (`module.*`, `limit.*`, `feature.*`) that turns a feature on or sets a limit |
| Connection | An approved link between a MySeed account (student or guardian) and a school record |
| Access profile | What a guardian may see for one student |
| Connect API | Server-to-server API under `/connect/v1` used by the Education System |
| Outbox | Table of events written in the same transaction as the change that caused them |
| Minor units | Money stored as an integer number of cents |

### 1.4 References

- [Specification index](../existing/SPECIFICATION-INDEX.md) and documents [01](../existing/01-ecosystem-and-system-map.md) to [09](../existing/09-amharic-plan.md)
- [Architecture](ARCHITECTURE.md), [decisions](DECISIONS.md), [test plan](TEST-PLAN.md)

## 2. Overall description

### 2.1 Product perspective

SchoolHub is the system of record for school data. The Education System's School Gateway reads it through the Connect API and receives events by signed webhook. The mobile apps never call SchoolHub directly.

### 2.2 Users

| Group | Roles | Access |
| --- | --- | --- |
| School staff | `owner`, `school_admin`, `registrar`, `academic_head`, `teacher`, `homeroom_teacher`, `accountant`, `cashier`, `communication_officer`, `librarian`, `transport_officer`, `counselor`, `store_keeper`, `hr_officer`, `payroll_officer`, `nurse`, `boarding_master`, `canteen_manager`, `auditor`, plus custom roles | School portal on the school's host |
| MySeed staff | `platform_admin`, `platform_support`, `platform_sales`, `platform_developer` | Platform console under `/platform` |
| Students and guardians | MySeed accounts | Through the MySeed apps and the Connect API; students also use the in-portal online exam area |
| Public | Anyone | Public site and document verification |
| MySeed Education System | Installed Connect client | Connect API |

### 2.3 Operating environment

- Server: Linux containers (Node.js 22, PostgreSQL 17, optional Redis, ClamAV, Caddy), or Windows and macOS for development.
- Client: current desktop and phone browsers, from 360 px wide, light and dark themes.
- Network: schools may have slow or intermittent connections; self-hosted servers may have no public address.

### 2.4 Constraints

- Ethiopia's Personal Data Protection Proclamation No. 1321/2024; most students are minors.
- Ethiopian calendar and Gregorian calendar both shown; Addis Ababa time (UTC+3) for scheduled work.
- English and Amharic.
- Same code must run hosted (many schools) and self-hosted (one school, few services).
- Rules from `CLAUDE.md`: no emoji, contracts first, entitlement keys only, tenant from the server, integer money, no in-place updates of published records.

### 2.5 Assumptions and dependencies

- The Education System School Gateway implements the Connect API client side (other repository).
- Payment, SMS, email and storage providers are reachable from the server.

## 3. Functional requirements

### 3.1 Tenancy, accounts and access

- **FR-1** (Must) The system resolves the school from the request host (`<school>.<ROOT_DOMAIN>`) or from the Connect token, and never from request input.
  Acceptance: a request to School A's host with School B's IDs in the body or query returns no School B data (`apps/api/test/security.test.ts`).
- **FR-2** (Must) Staff sign in with email and password; passwords are hashed with Argon2id; repeated failures lock the account for a period; sign-in is rate limited.
  Acceptance: after the configured number of failed attempts, a correct password is refused with a locked message until the lock ends.
- **FR-3** (Must) Staff can turn on TOTP two-step verification; a school can require it for administrators.
  Acceptance: with the requirement on, an administrator without MFA is sent to set it up before reaching protected routes.
- **FR-4** (Must) Staff can be invited, accept an invitation, reset a forgotten password, list their sessions and sign out sessions.
  Acceptance: an invitation link sets a password once and lands the user on `/home`.
- **FR-5** (Should) Staff can sign in with MySeed ID (OpenID Connect with PKCE) after linking their account.
  Acceptance: with `MYSEED_ID_*` set, a linked staff member signs in without a SchoolHub password.
- **FR-6** (Must) Every protected route checks the module entitlement, the user's permission and the resource scope before running.
  Acceptance: a role without the permission gets 403; a school without the module gets a module-disabled error.
- **FR-7** (Must) Schools manage roles from templates and custom roles; each role has a workspace that chooses its `/home` screen.
  Acceptance: each of the 15 seeded role accounts lands on its own workspace and sees only actions its permissions and modules allow (`apps/portal/e2e/crawl.spec.ts`).
- **FR-8** (Must) Sensitive changes write audit events; schools and platform staff can read the audit log.
  Acceptance: editing a published mark creates an audit event with actor, time and reason.
- **FR-9** (Must) MySeed support can access a school only with a school-approved, time-limited grant with a reason.
  Acceptance: without an active grant, a platform support user cannot open school data.

### 3.2 Platform console and packaging

- **FR-10** (Must) MySeed staff can create and provision schools, set their status (trial, active, suspended) and see tenant details.
  Acceptance: a suspended school's staff can read but not change records.
- **FR-11** (Must) The console manages the module catalog, plans, plan versions, subscriptions, add-ons and per-school overrides; entitlements resolve with dependencies.
  Acceptance: adding an override enables the module for that school only, without a code change.
- **FR-12** (Should) The console manages quotes, hosting requests, billing, licenses, Connect clients, providers, document templates, ID card templates, role templates, the platform website and content, team members, support tickets, events, operations and settings.
  Acceptance: each console action is shown only to the platform roles the API allows; other roles see a read-only note.
- **FR-13** (Should) The public pricing page has a package builder that estimates a price from chosen modules and limits.
  Acceptance: selecting modules updates the estimate from the console price book.
- **FR-14** (Must) A self-hosted server verifies a signed license offline; after expiry and 30 days of grace the school becomes read-only, with export still allowed.
  Acceptance: with an expired license past grace, writes fail and `/api/v1/data/exports` still works.

### 3.3 School setup and branding

- **FR-15** (Must) Administrators maintain the school profile, logo, campuses, operational settings and academic template.
  Acceptance: changes appear on the school's portal and public landing page.
- **FR-16** (Should) Administrators build a theme (including from the logo), branding for documents, and the school's public website with drafts and versions, using a media manager with folders.
  Acceptance: a published website version is served on the school's host root; a draft is not.
- **FR-17** (Should) Administrators define custom fields with type, required flag and role visibility, and enable sensitive data categories.
  Acceptance: a custom field hidden from a role does not appear in that role's student view.
- **FR-18** (Could) Each user can set personal preferences such as theme and density.
  Acceptance: preferences persist across sessions for that user only.

### 3.4 People, admissions and enrollment

- **FR-19** (Must) Registrars manage applications (including a public online admission form), enroll students and promote them between years.
  Acceptance: an accepted application becomes an enrolled student in a section; the enrollment is a new record, not an edit of an old one.
- **FR-20** (Must) Registrars manage students, guardians and their links, documents and correction requests.
  Acceptance: a correction request is applied only after approval and is audited.
- **FR-21** (Should) The system lists likely duplicate students and lets an authorized user merge them.
  Acceptance: `/people/duplicates` shows candidate pairs; a merge keeps one record and is audited.
- **FR-22** (Must) HR manages staff, departments, teaching assignments, leave and evaluations.
  Acceptance: an approved leave request appears on the staff record.
- **FR-23** (Must) Every resource list supports filter, group, export (CSV, XLSX), print and bulk import with a dry run.
  Acceptance: a dry-run import reports errors per row and writes nothing.
- **FR-24** (Should) Lists support bulk operations with an undo window, a record viewer with audit timeline, a recycle bin with restore, and a merge view on edit conflicts (HTTP 409).
  Acceptance: a deleted record can be restored from the recycle bin.

### 3.5 Academics, attendance and timetable

- **FR-25** (Must) The academic office maintains years, terms, levels, grades, streams, sections, subjects, rooms, grading rules and versioned academic configuration.
  Acceptance: a new academic configuration version does not change marks already published.
- **FR-26** (Must) Teachers take daily or period attendance; staff correct it with a reason; reports and absence alerts are produced.
  Acceptance: an absence emits an event to the connected guardians of that student.
- **FR-27** (Should) Attendance can be drafted offline and submitted when the connection returns.
  Acceptance: a draft taken offline survives a page reload and submits later. (Built with `localStorage`; see section 8.)
- **FR-28** (Must) The timetable holds periods and slots and refuses teacher, room and section double booking.
  Acceptance: saving a slot that clashes with another for the same teacher fails.
- **FR-29** (Should) The system suggests a draft timetable for a section from periods per week and teacher clashes.
  Acceptance: `POST /api/v1/timetable/generate/:sectionId` returns a draft without clashes for the teacher.
- **FR-30** (Must) The school calendar holds events and shows Ethiopian and Gregorian dates.
  Acceptance: an event shows both dates; holiday dates match `packages/calendar`.

### 3.6 Teaching and learning

- **FR-31** (Must) Teachers create assignments with submission types, open and due dates and scheduling; students submit through the Connect API; teachers mark them.
  Acceptance: a scheduled assignment is published by the worker at its open time and emits `school.assignment.published`.
- **FR-32** (Must) The worker sends one due-soon event 24 hours before an assignment is due, to students who have not submitted.
  Acceptance: a student who submitted gets no due-soon event.
- **FR-33** (Must) Teachers publish materials with versions, audiences and access policies; files are served by short-lived signed URLs and access is logged.
  Acceptance: a student outside the audience cannot get an access URL.
- **FR-34** (Should) Teachers write lesson plans; the academic head reviews them.
  Acceptance: a submitted plan shows in the reviewer's approvals.

### 3.7 Exams, results and documents

- **FR-35** (Must) The school schedules exams, checks students in, and runs online exams that students take in the `learn` area; a simulator lets staff try an exam.
  Acceptance: a student not checked in cannot start a check-in-required exam (`apps/api/test/exams.test.ts`).
- **FR-36** (Must) Teachers enter marks for assessments; marks move through draft, submitted, approved and published; published marks change only by revision.
  Acceptance: draft or unapproved marks never appear in a Connect API response.
- **FR-37** (Must) The school designs report-card templates, generates report cards with a sign-off and publication workflow, and renders them to PDF with a verification code.
  Acceptance: a published report card's code verifies on `/verify` without showing private data.
- **FR-38** (Should) The school issues transcripts and certificates (single and bulk), with QR verification and revocation with a reason.
  Acceptance: a revoked certificate shows as revoked on the public verification page.
- **FR-39** (Should) The school designs and prints ID cards with QR and barcodes; cards expire automatically.
  Acceptance: a card past its expiry date shows status `expired` after the next worker pass.

### 3.8 Finance

- **FR-40** (Must) The finance office defines fee structures, generates invoices, applies discounts with approval, records payments and issues receipts, voids with a reason, and refunds with maker-checker.
  Acceptance: a refund needs a second user to approve; amounts are integer minor units.
- **FR-41** (Must) Invoices become overdue after their due date, and guardians get one due-soon event three days ahead.
  Acceptance: after the due date, an unpaid invoice shows `overdue`.
- **FR-42** (Should) Guardians pay online through Chapa or telebirr from the Parent app, or upload a bank transfer receipt for review.
  Acceptance: a verified callback marks the invoice paid once; a replayed callback creates no duplicate payment.
- **FR-43** (Should) The finance office reconciles payments against provider and bank records.
  Acceptance: unmatched items are listed on `/finance/reconciliation`.
- **FR-44** (Could) The school keeps accounts synced hourly from finance, and runs payroll.
  Acceptance: a payment recorded in finance appears in accounting after the next hourly sync.
- **FR-45** (Should) Unpaid fees (and a minimum attendance percentage) block an exam admission card only when the exam session turns that rule on (`requireFeesCleared`, `minAttendancePercent` in `apps/api/src/modules/exams.ts`).
  Acceptance: with `requireFeesCleared` on, a student with a balance is listed as not eligible with the reason, and no card is printed for them unless all cards are requested. A registrar override with a logged reason is to confirm.

### 3.9 Communication

- **FR-46** (Must) The school publishes announcements (now or scheduled) to audiences.
  Acceptance: a scheduled announcement is published by the worker at its time.
- **FR-47** (Must) Staff and guardians exchange messages; conversations are stored in SchoolHub; the Parent app reaches them through the Connect API.
  Acceptance: a guardian message appears in the teacher's inbox with a live update.
- **FR-48** (Should) Staff set office hours for messaging.
  Acceptance: office hours show on `/communication/office-hours`.
- **FR-49** (Must) The school sends SMS (Iconic SMS) and email (SMTP) using templates, including to people selected in any list, and sees a delivery log.
  Acceptance: without provider credentials, deliveries are logged instead of sent.

### 3.10 MySeed connections and Connect API

- **FR-50** (Must) Registrars issue link codes; students and guardians link by code, phone code, details match or request; registrars approve or reject requests; every link needs school approval.
  Acceptance: a phone number or name match alone never creates a connection.
- **FR-51** (Must) Guardian access profiles per student-guardian link decide what each guardian sees; the Connect API applies them.
  Acceptance: a guardian with results blocked gets no results from `GET /connect/v1/connections/:id/results`.
- **FR-52** (Must) A revoked or suspended connection fails on the next request.
  Acceptance: after revoke, the next Connect call for that connection is refused.
- **FR-53** (Must) The Connect API serves today, timetable, calendar, announcements, attendance (with explanations), assignments (with uploads and submissions), materials, results, report cards, teachers, invoices, payment methods, payment intents and bank transfers.
  Acceptance: every response parses with the contract schema in `packages/contracts` (`apps/api/test/sdk.test.ts`).
- **FR-54** (Must) The Education System installs itself with a one-time code and receives every event of Connect-enabled schools at its webhook, signed with `t=<time>,v1=<HMAC-SHA256>`.
  Acceptance: `apps/api/test/install.test.ts` installs a client and follows an event to its webhook.
- **FR-55** (Must) A school's "Show in the app school search" setting controls whether it appears in `GET /connect/v1/schools`.
  Acceptance: with the setting off, the school is not listed.
- **FR-56** (Should) A self-hosted server without a public address serves Connect requests through the MySeed relay.
  Acceptance: with `RELAY_URL` and `RELAY_TOKEN` set, a relayed request gets a local answer.

### 3.11 Operations modules

- **FR-57** (Could) The school runs library (catalog, loans, holds with automatic hand-over), transport, clubs, behavior, assets and inventory, clinic, boarding, canteen and alumni registers.
  Acceptance: an uncollected ready hold expires and passes to the next person waiting.

### 3.12 Reports, data and governance

- **FR-58** (Must) Standard reports and insight dashboards with trends are available to roles allowed to see them.
  Acceptance: stat tiles link to the filtered list they summarize (`apps/api/test/dashboard-trends.test.ts`).
- **FR-59** (Should) A report builder lets staff build reports and schedule them; the worker runs schedules and delivers results.
  Acceptance: a scheduled report produces a delivery at its time.
- **FR-60** (Must) The school handles privacy requests, a whole-tenant export and retention policies applied nightly.
  Acceptance: retention runs after 02:00 Addis Ababa time once per day per school.
- **FR-61** (Must) Exports require the export permission and are audited.
  Acceptance: a role without the permission cannot export; an export by an allowed role writes an audit event.
- **FR-62** (Should) A natural-language assistant finds screens and applies filters from English or Amharic requests.
  Acceptance: the fixed request set in `apps/api/test/assistant-requests.ts` matches at the accuracy asserted in `apps/api/test/assistant.test.ts`.

### 3.13 Public site

- **FR-63** (Must) The public site shows features, pricing, hosting, developers, a school directory with school landing pages, contact, privacy and terms.
  Acceptance: an anonymous visitor reaches every public page without errors (crawl).
- **FR-64** (Must) Anyone can verify a report card, transcript or certificate code at `/verify`.
  Acceptance: a valid code shows school, student name, document kind and date only.

### 3.14 Requirements decided against

- **FR-65** (Won't) Students and guardians do not sign in to the SchoolHub portal for school records; they use the MySeed apps.
  Acceptance: no student or guardian staff accounts are created by the seed.
- **FR-66** (Won't) SchoolHub does not replicate school records into MySeed systems.
  Acceptance: no change feed, snapshot or integration view exists (migration `0004_drop_integration_views`).

## 4. Non-functional requirements

### 4.1 Security

- **NFR-1** (Must) Row-level security on every tenant table; the API runs as a role without BYPASSRLS.
- **NFR-2** (Must) The API refuses to start in production with missing, default or `change-me` secrets.
- **NFR-3** (Must) Integration secrets are stored encrypted with `SECRETS_ENCRYPTION_KEY`; secret fields are never returned by list endpoints.
- **NFR-4** (Must) Connect clients use `private_key_jwt`; tokens last 5 minutes; replayed assertions are refused.
- **NFR-5** (Must) Webhooks are signed with HMAC-SHA256 over timestamp and body; receivers check a timestamp window.
- **NFR-6** (Must) Files are served by signed URLs; uploads are scanned by ClamAV when configured and are not visible until clean.
- **NFR-7** (Must) HTTPS with HSTS through Caddy on self-hosted installs.
- **NFR-8** (Must) CI fails on critical image vulnerabilities with a fix available; pushed images are signed and carry an SBOM and provenance.
- **NFR-9** (Must) Idempotent write routes accept `Idempotency-Key` and replay the stored response.

### 4.2 Privacy

- **NFR-10** (Must) Logs redact phone numbers, email addresses and secret-looking fields.
- **NFR-11** (Must) Sensitive data categories are off by default.
- **NFR-12** (Must) Public verification shows no private student data.
- **NFR-13** (Must) The diagnostics bundle contains no school records or secrets.

### 4.3 Availability and recovery

- **NFR-14** (Must) Health endpoint `GET /api/v1/public/health` checks the database; containers restart on failure.
- **NFR-15** (Must) Self-hosted backups include a database dump, stored files, settings and checksums; upgrades back up first and roll back on failure.
- **NFR-16** (Should) Webhook delivery retries with exponential backoff up to 12 attempts.

### 4.4 Performance

- **NFR-17** (Should) Under `scripts/load-test.mjs`, the p95 latency of each endpoint is at most 800 ms and fewer than 1 percent of requests fail.
- **NFR-18** (Should) The API runs one process per CPU when `API_WORKERS=auto`, sharing at most `DATABASE_POOL_SIZE` connections.

### 4.5 Phones and accessibility

- **NFR-19** (Must) Screens work at 360 px width without horizontal overflow, in light and dark themes.
- **NFR-20** (Must) The 20 core pages pass axe checks in desktop light, desktop dark and phone light modes (`apps/portal/e2e/a11y.spec.ts`).

### 4.6 Language and locale

- **NFR-21** (Must) Dates show in the Ethiopian and Gregorian calendars.
- **NFR-22** (Should) The interface is available in English and Amharic; printed documents render Amharic with an Ethiopic font.
- **NFR-23** (Must) Money is shown and stored per currency in integer minor units (Ethiopian birr by default).

### 4.7 Maintainability

- **NFR-24** (Must) Lint with zero warnings, Prettier formatting, TypeScript typecheck and the emoji check pass before merge.

## 5. Interface requirements

- **IR-1** MySeed Education System: Connect API under `/connect/v1` (discovery, install, OAuth token, schools, linking, connections, data reads and writes), OpenAPI at `/docs/connect`, client library `@myseed/schoolhub-sdk`.
- **IR-2** MySeed Education System webhooks: signed POST of each event envelope to the installed client's webhook URL, header `X-SchoolHub-Signature`.
- **IR-3** MySeed ID: OpenID Connect discovery at `<issuer>/.well-known/openid-configuration`, authorization code with PKCE, scopes `openid email profile`.
- **IR-4** MySeed relay: outbound long poll from a self-hosted server to `RELAY_URL` with `RELAY_TOKEN`.
- **IR-5** MySeed platform webhook: signed platform events to `PLATFORM_WEBHOOK_URL`.
- **IR-6** Chapa: payment initialization, callback verification, payment query.
- **IR-7** telebirr: H5 C2B web checkout initialization and query.
- **IR-8** Configurable HTTP providers: provider definitions with request templates and signature checks (HMAC-SHA256, HMAC-SHA512, RSA) in `apps/api/src/core/providers`.
- **IR-9** Iconic SMS: HTTP API with sender ID.
- **IR-10** SMTP: any SMTP server by URL.
- **IR-11** S3-compatible object storage: put, get, presigned URLs.
- **IR-12** ClamAV: clamd INSTREAM over TCP.
- **IR-13** Redis: pub/sub and key-value cache.
- **IR-14** Sentry-compatible error endpoint: envelope API.
- **IR-15** School API for the portal and school integrations: `/api/v1`, OpenAPI at `/docs`; school webhooks configured under `/admin/webhooks`.
- **IR-16** Portal to API: `/api/...` proxied to `API_INTERNAL_URL` with `x-forwarded-host` and `x-internal-proxy`.

## 6. Data requirements

- **DR-1** Every tenant-owned table has `organizationId` and a `tenant_isolation` RLS policy.
- **DR-2** Money fields are integers in minor units with a currency.
- **DR-3** Published marks change only by revision; enrollments and ledger entries are added, not edited.
- **DR-4** Outbox events are written in the same transaction as the change.
- **DR-5** Schema changes go through Prisma migrations in `packages/db/prisma/migrations`, applied forward only.
- **DR-6** Uploaded files keep an access log; signed URLs are short-lived.
- **DR-7** Retention policies run nightly per school; whole-tenant export is available to authorized roles.
- **DR-8** MySeed systems store only link mappings and minimal notification metadata, not school records.
- **DR-9** Deleted list records go to a recycle bin and can be restored.
- **DR-10** Seed and demo data use fictional schools and `schoolhub.test` addresses only.

## 7. Verification

Each requirement is verified by the test cases in the [test plan](TEST-PLAN.md).

## 8. Open requirements

| ID | Requirement | State |
| --- | --- | --- |
| OR-1 | Offline attendance in IndexedDB with conflict flagging when two staff edit the same session | Uses `localStorage`; no conflict flagging |
| OR-2 | Timetable generator that considers rooms, workload limits and teacher availability | Not found in the code |
| OR-3 | Full Amharic interface from a shared message catalog | Navigation and common actions only |
| OR-4 | AI assistant with each school's own provider key (`module.ai_assistant`) | Not found in the code |
| OR-5 | Online exam webcam snapshots, opt-in per exam with guardian consent | Not found in the code |
| OR-6 | Registrar override of the exam fee rule with a logged reason (FR-45) | To confirm: the rule exists, a logged per-student override was not found |
| OR-7 | Teachers see survey averages and anonymized comments only above the school's minimum response count | Not found in the code (no survey feature found) |
| OR-8 | MySeed learning progress shared with a school | Not found in the code |
| OR-9 | Government reporting (`module.gov_reporting`) | Report endpoints exist in `apps/api/src/modules/insights.ts`; submission to any government system to confirm |
| OR-10 | Portal settings at runtime instead of compiled-in `NEXT_PUBLIC_*` values | Not done |
| OR-11 | OpenTelemetry tracing export | Not found in the code |
| OR-12 | Report-card and bulk PDF rendering as worker jobs | Rendered in the API process |
| OR-13 | Manual keyboard and screen-reader pass on every screen | Not done |
| OR-14 | Legal review of consent, guardian authorization and retention (D6) | Not done |
| OR-15 | Additions proposed in [document 08](../existing/08-product-spec-additions.md) not yet in the code (helpdesk, safeguarding, workflow automation, integration center, staff PWA, among others) | To confirm item by item |
