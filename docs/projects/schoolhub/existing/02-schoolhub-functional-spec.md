# 02. SchoolHub functional specification

Priorities: **P0** launch, **P1** early expansion, **P2** optional module or later. Every module listed here maps to an entitlement key in document 06.

## 1. Tenancy and organization model

```
Organization (tenant)            one customer contract; owns all data
  Campus                         one or more physical schools or branches
    Academic year                per campus, can be shared organization-wide
      Term                       semester, quarter, or custom period
    Grade level                  KG1 ... Grade 12, configurable
      Stream                     optional (natural science, social science)
        Section                  the class a student sits in ("Grade 7 B")
```

- Every school-owned row carries `organization_id`; campus-scoped rows also carry `campus_id`.
- Permissions are granted at organization scope or campus scope.
- A school group is one organization with several campuses; cross-campus reports are permitted only to organization-scoped roles.

## 2. Ethiopian academic defaults

The academic structure is configuration, not code. New tenants start from a template; every value below can be changed per campus and is versioned.

| Setting | Default template | Notes |
| --- | --- | --- |
| Levels | Pre-primary (KG1 to KG3), Primary (1 to 6), Middle (7 and 8), Secondary (9 to 12) | 6-2-4 structure; alternative templates for older 8-4 schools and international schools |
| Streams | Grades 11 and 12: Natural science, Social science | Optional per campus |
| Year | Ethiopian academic year starting in Meskerem (September) | Label shown as "2019 E.C. (2026/27)" |
| Terms | Two semesters | Quarter and custom term templates available |
| Calendar display | Ethiopian and Gregorian, user-selectable | Dates stored as Gregorian `date`; conversion in `packages/calendar` |
| Grading | Percentage marks, configurable letter bands, pass mark 50 | Weighting per assessment category (continuous assessment, mid-term, final) |
| National and regional exams | Grade 6 and Grade 8 (regional), Grade 12 (national) | Tracked as exam events and external results; no government API assumed |
| Languages | English and Amharic UI; instruction language per subject | Afaan Oromo and Tigrinya planned through the i18n catalog |
| Currency | ETB, stored in integer cents (santim) | |
| Phone format | E.164, Ethiopia (+251) default | |

These defaults must be confirmed with pilot schools before launch (open decision D4).

## 3. Roles

Roles are templates made of permissions; tenants can clone and edit them. A user can hold several roles at different scopes.

| Role | Scope | Typical permissions |
| --- | --- | --- |
| Organization owner | Organization | Everything in the tenant, including plan, modules, integrations and role management |
| School administrator | Campus | Configuration, staff, academic operations, publication approval, reports |
| Registrar | Campus | Admissions, enrollment, student and guardian records, **link-request approval**, link codes |
| Academic head | Campus | Academic structure, grading rules, marks moderation, report-card approval |
| Teacher | Assigned sections and subjects | Attendance, assignments, materials, marks entry, guardian messaging for own students |
| Homeroom teacher | Assigned section | Teacher permissions plus section attendance and report-card comments |
| Accountant | Campus or organization | Fee structures, invoices, payments, receipts, reconciliation |
| Communication officer | Campus | Announcements, templates, SMS campaigns within allowance |
| Auditor or inspector | Explicit grant | Read-only access to granted areas, time-limited |
| Platform support | Granted per tenant | Diagnostic access only with tenant approval, time limit and reason |

Students and guardians are **not** SchoolHub portal users at launch. They act through the MySeed apps, and SchoolHub authorizes them through their connection (document 03). A parent web portal is P2.

Permission keys follow `domain.resource.action`, for example `attendance.session.take`, `results.report_card.publish`, `connections.link_request.approve`, `finance.payment.refund`. High-impact actions have their own keys and are audited: editing a published mark, approving a guardian link, refunding or voiding a payment, exporting student records, granting support access.

## 4. Modules

### 4.1 Organization setup (P0)

- School profile: names (English and Amharic), logo, registration identifiers, ownership type (private, public, faith-based, community, international), contact, address (region, zone, woreda, kebele)
- Campuses and their settings; organization defaults with campus overrides
- Setup wizard: profile, calendar, structure, subjects, staff import, student import, fee structure, MySeed Connect
- Configuration history: who changed what, when, previous value

### 4.2 Admissions and enrollment (P0)

- Applications with documents and status (`submitted`, `under_review`, `accepted`, `waitlisted`, `rejected`, `enrolled`)
- Student number generation from a configurable pattern (for example `{campus}-{year}-{seq:5}`)
- Enrollment into campus, year, grade, stream and section, with effective dates
- Transfers (section, campus, out of school), withdrawal, re-enrollment, repetition, promotion, graduation
- Duplicate detection (name plus date of birth plus guardian phone) and authorized merge
- Bulk import from CSV or XLSX with row-level validation, dry run and error file

Enrollment history is append-only. Ending an enrollment emits `school.enrollment.ended`, which suspends the student's MySeed connection for that school.

### 4.3 Student information (P0)

- Configurable profile fields per tenant (type, required, visibility by role)
- Identifiers: student number, national ID where held, previous-school number
- Guardians: several per student, each with relationship type, contact, `is_primary`, `lives_with_student`, and an **access profile** (section 4.13)
- Documents: birth certificate, transfer letters, photos; private storage, role-restricted
- Sensitive categories (health, disability, safeguarding) are off by default; enabling one requires an organization owner, a stated purpose and a restricted role
- Correction requests from guardians and students arrive through the apps and are routed to the registrar

### 4.4 Staff (P0 foundation, HR and payroll P2)

- Staff profiles, departments, qualifications, employment status
- Teaching assignments: teacher, subject, section, term, with substitute assignments and effective dates
- Invitations by email or SMS; deactivation revokes sessions immediately
- Teachers see only students in their current assignments

### 4.5 Academic structure and grading (P0)

- Years, terms, exam periods, holidays, school days
- Levels, grades, streams, sections; subject catalog per grade with credit or weight
- Assessment categories and weights per subject and grade
- Grade bands, rounding, pass rules, retake rules, conduct grades
- Promotion rules (minimum average, maximum failed subjects, manual override with reason)
- **Rule versioning**: every published result stores the `academic_configuration_version` used to calculate it

### 4.6 Attendance (P0)

- Daily or per-period sessions, configurable per campus
- Statuses: present, absent, late, excused, plus school-defined statuses
- Fast roster entry; whole class present by default, tap exceptions
- Offline draft in the browser (IndexedDB), submitted on reconnect; conflicts flagged when two staff edit the same session
- Corrections after submission require a reason; past a configurable window they require approval
- Guardian notification on absence or late (rule-based, per school), sent through MySeed Parent push and optional SMS
- Reports: by student, section, grade, date range; chronic absence list

### 4.7 Timetable and calendar (P0 basic, P1 generator)

- Periods and bell schedules per campus
- Timetable grid per section: subject, teacher, room; conflict detection for teacher, room and section
- Draft and publish; publishing emits `school.timetable.published`; changes after publication notify affected students and guardians
- Calendar events: exams, holidays, meetings, deadlines; audience by organization, campus, grade or section
- P1: automatic timetable suggestion from constraints

### 4.8 Assignments (P0)

Teacher workflow:

1. Choose section(s), subject and term.
2. Write title and instructions; set open date, due date, late policy (`accept`, `accept_flagged`, `reject`), maximum marks, optional rubric.
3. Choose submission types: text, file upload (types and size limit), offline (handed in on paper, marked only).
4. Attach files from the materials library or upload new ones.
5. Preview as student; publish now or schedule.
6. Review submissions, give feedback and marks, return; optionally reopen for an individual student.

Assignment states: `draft`, `scheduled`, `published`, `closed`, `archived`.
Submission states: `not_started`, `draft` (app-side only), `submitted`, `late`, `returned`, `resubmission_requested`, `excused`.

Marks from assignments can feed an assessment category in the gradebook when the teacher links them.

### 4.9 Materials library (P0)

This is the module the Student app depends on most. Requirements:

- Upload PDF, images, Office documents, audio, video (size limit per tenant entitlement), and external links (including MySeed lesson links, P1)
- Organize by subject, grade, term, unit or week, and tags
- Audience: one or more sections, a whole grade, or individual students; separate flag for **guardian-visible**
- Visibility states: `draft`, `scheduled`, `published`, `withdrawn`
- Access policy per item: `view_only` (in-app preview, no download), `download`, `offline_allowed` (app may keep an encrypted local copy)
- Versions: replacing a file keeps history; students always get the current version
- Server-side checks: MIME sniffing, extension allow-list, size limit, malware scan where the deployment provides one (ClamAV container in the default Compose profile)
- Private storage only; access through short-lived signed URLs issued per request
- Access log: who opened or downloaded what, when (retained 12 months by default)
- Storage usage per tenant against the storage entitlement

**Ownership rule:** school materials remain the school's property. They never appear in the MySeed public catalog. Reuse in MySeed requires a separate licensing agreement and publishing workflow in the Education System.

### 4.10 Assessments, marks and report cards (P0)

- Assessments per subject and section with category, maximum marks, date
- Marks entry by teacher: grid entry, CSV import, validation (range, missing, exempt)
- Workflow: `draft` (teacher), `submitted`, `approved` (academic head), `published`
- Only published results leave SchoolHub. Drafts are never exposed through the Connect API.
- Editing a published mark requires `results.mark.edit_published`, a reason, creates a revision and triggers recalculation of dependent totals and a `school.result.revised` event
- Report cards: template designer (school header, subjects, marks, letter grades, rank optional, conduct, attendance summary, comments, promotion decision); English, Amharic or bilingual; PDF rendered by the worker
- Report-card publication per section; each report card gets a revision number and a verification code printed on the PDF
- Transcripts for leavers and graduates (P1)

### 4.11 Fees and payments (P0 core, P1 online payment)

- Fee categories (tuition, registration, transport, uniform, exam, other) and fee structures per grade and year
- Billing schedules: annual, per semester, monthly
- Invoices generated per student; discounts, scholarships, sibling discounts, waivers (approval required above a threshold)
- Payments: cash and bank deposit recorded by an accountant (P0); online through provider adapters (P1, first adapters to be confirmed: Chapa, Telebirr)
- Receipts with sequential numbers per campus; void instead of delete, with a reason
- Partial payments, overpayments as credit, refunds with maker-checker approval
- Online payment confirmation only by verified provider callback or server-side status query, never by app redirect; idempotency key per payment intent
- Reports: collections, outstanding balances, aging, by grade and fee category
- Guardian view in the Parent app: invoices, balance, due dates, receipts, pay button when an adapter is enabled

### 4.12 Communication (P0)

- Announcements: audience (organization, campus, grade, section, guardians only, staff only), schedule, urgent flag, attachments, bilingual body
- Channels: in-app (MySeed apps), push (through MySeed notification service), SMS (tenant Iconic SMS configuration or MySeed allowance), email for staff
- Parent-teacher messaging:
  - A conversation is always about one student and involves one or more guardians and one or more staff
  - Guardians may start a conversation only with staff currently assigned to that student, or with school roles the school opens to guardians (registrar, accountant)
  - Teachers may start a conversation with guardians of their students
  - Office hours and auto-reply per school; optional message categories (attendance, homework, appointment, other)
  - Read state, attachments (same file rules as materials), report and block, escalation to administrator
  - Staff leaving or reassignment moves open conversations to the replacement or administrator
  - Retention per school policy; administrator access to conversation content is audited
- Templates for SMS and notifications with Amharic and English variants
- Delivery log with status per recipient and channel

Student-teacher messaging is off by default and P2 (requires a safeguarding review).

### 4.13 Guardian access profiles (P0)

Each guardian link at school has an access profile set by the school. Defaults:

| Capability | Primary guardian | Secondary guardian | Restricted |
| --- | --- | --- | --- |
| Attendance | Yes | Yes | No |
| Timetable, calendar, announcements | Yes | Yes | Yes |
| Assignments and status | Yes | Yes | No |
| Guardian-visible materials | Yes | Yes | No |
| Results and report cards | Yes | Yes | No |
| Fees view and pay | Yes | Configurable | No |
| Message teachers | Yes | Yes | No |
| Receive absence alerts | Yes | Configurable | No |

Custody or safeguarding restrictions are applied by setting a guardian to `restricted` or `blocked` with a recorded reason. A change takes effect on the next API request; the gateway cache is purged by the `school.guardian_link.changed` event.

### 4.14 MySeed connections (P0)

The school side of the integration (full flows in document 03):

- **Link codes**: generate per student and per guardian, single use, valid for 30 days by default; print on a slip or send by SMS to the phone on record; bulk generation per section
- **Link-request queue**: requests from apps with the submitted details and match suggestions; approve, reject with reason, or ask for more information
- **Active connections**: list per student, with device-free metadata (connected since, last access); revoke
- **Sync health**: last successful delivery to MySeed, failed webhooks, retry
- Settings: which link methods the school accepts; whether guardians can see MySeed learning progress offered by the student (P1)

### 4.15 Reports and exports (P0 standard, P1 builder)

Enrollment, attendance, assessment, report-card publication, assignment completion, finance, staff workload, connection audit, sync failures. CSV, XLSX and PDF. Exports run as jobs, inherit the requester's scope, are audited, and expire after 7 days.

### 4.16 Audit and data governance (P0)

- Audit events for every create, update and delete on sensitive records, every approval, publication, export and permission change
- Data export for the whole tenant (offboarding and portability)
- Retention policies per record type; deletion workflows that respect legal retention of school records
- Privacy requests (access, correction) received from the apps or the school office

### 4.17 Optional modules (P2)

Library, transport (routes, stops, pickup authorization), boarding, feeding, inventory and assets, HR and payroll, advanced accounting, clinic (restricted), extracurriculars, alumni and certificates, government report adapters. Each is a separate entitlement and must not be required by any P0 module.

## 5. Cross-cutting behavior

- Every list supports search, filters, sort, pagination, saved views and CSV export (permission-checked).
- Every form validates on the server with the same schema used by the client (`packages/contracts`).
- Every write that can be retried accepts an `Idempotency-Key` header.
- Every screen has loading, empty, error, offline and no-permission states, as required by the UI rules.
- Dates show in the user's chosen calendar; numbers use `tabular-nums`.
- Printable views exist for class lists, attendance sheets, report cards, invoices and receipts.
