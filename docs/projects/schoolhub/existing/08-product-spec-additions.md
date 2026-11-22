# 08. Additions from the Product Specification v1.0

Source: *MySeedSchoolHub Complete Product Features, PWA Experience, Integration Center and SaaS Architecture*, version 1.0, October 2026 (PDF). This document records only what that PDF adds beyond documents 01 to 06. Anything the PDF repeats is already specified there and is not restated.

Status: **proposed scope**. Priorities and module keys below are recommendations; they become part of the specification when moved into documents 02 and 06. Nothing here changes the decisions in the [README](SPECIFICATION-INDEX.md). The PDF itself says its module catalog is a proposed scope, not a launch requirement, and its packages are not final prices.

Priorities follow document 02: **P0** launch, **P1** early expansion, **P2** optional module or later.

## 1. Staff PWA

Documents 02 and 05 specify a responsive portal and offline attendance drafts but not an installable app. Add:

| Requirement | Priority |
| --- | --- |
| Web app manifest: name, short name, icons (including maskable), MySeed theme colors, start URL, `display: standalone` | P0 |
| Service worker that caches static assets and the app shell only; no caching of API responses that contain student records unless the feature is approved for offline use | P0 |
| Approved offline features list, starting with attendance drafts; every other feature shows the offline state from the UI rules | P0 |
| IndexedDB for approved offline data and the pending-operations queue (replaces the current `localStorage` drafts) | P0 |
| Every queued item is visibly marked "Saved on this device" until the server confirms it; confirmed items show the server time | P0 |
| On reconnect: re-check the session and permissions before sending; detect conflicts with newer server records and ask the user, never overwrite silently | P0 |
| Online-only operations: payment confirmation, refunds, account and role changes, publication of results, link approvals | P0 |
| Install instructions page for Android (Chrome), iPhone and iPad (Safari, Add to Home Screen) and desktop browsers | P0 |
| Web push for staff alerts where the platform supports it and the user grants permission | P1 |
| Device layouts: desktop sidebar with keyboard navigation and multi-column tables; tablet split or compact navigation with larger touch targets; phone task-focused screens (quick attendance, student lookup, notices) with tables collapsing to cards | P0 |

The product must not promise native-app behavior: installation prompts, push, storage limits and offline behavior differ by browser and operating system, and this is stated on the install page.

## 2. Module catalog additions

Each item lists what the PDF adds to the matching section of document 02. Suggested new entitlement keys are in section 7.

### 2.1 Organization (adds to 02 section 4.1)

- Document templates owned by the school (letters, certificates, forms) with placeholders
- School-specific terminology (for example "class" or "section", "term" or "semester") shown throughout the interface
- Delegated administration: an organization owner grants a campus administrator a subset of settings
- Branch-level permissions and multi-campus reports (already gated by `module.multi_campus`)

### 2.2 Student information (adds to 02 sections 4.2 and 4.3)

- Configurable admission rules per grade (age cut-off, required documents, entrance assessment, capacity) (P1)
- Student ID card generation with photo, number and QR code, printable in batches (P1)
- Alumni records created automatically on graduation (see section 2.18)

### 2.3 Timetable (adds to 02 section 4.7)

- Rooms as a managed list with capacity and type (P0)
- Substitute scheduling: mark a teacher absent for a day and assign substitutes to the affected periods, notifying them (P1)
- Teacher workload limits (periods per day and week) checked while editing (P1)
- Room utilization report (P1)
- Timetable templates reused across sections and years (P1)

### 2.4 Attendance and leave (adds to 02 section 4.6)

- **Staff attendance**: daily check-in and check-out, late and absent, monthly summary feeding HR (P1)
- Student leave requests from guardians through the Parent app, approved by the homeroom teacher, pre-filling attendance as excused (P1)
- Guardian absence explanations submitted through the Parent app and attached to the record (P1)
- Absence thresholds per school (for example 3 consecutive or 10 in a term) that alert the homeroom teacher and guardian (P1)
- QR-assisted check-in at the gate or classroom (P2)
- Biometric and GPS check-in only as optional integrations, off by default, behind a privacy review (P2)

### 2.5 Exams and assessment (adds to 02 section 4.10)

- Question banks per subject and grade, with tags and difficulty (P2)
- Online assessments in the Student app: randomized question and option order, time limits, objective auto-marking, manual marking for open answers (P2)
- Result appeals from guardians or students, routed to the academic head, ending in a controlled grade amendment through the existing published-mark revision flow (P1)
- Assessment analytics: item difficulty, class distribution, comparison across sections (P1)

### 2.6 Fees and finance (adds to 02 section 4.11)

| Addition | Priority |
| --- | --- |
| Payment plans with installments per student or family | P0 |
| Family accounts and family statements across siblings | P0 |
| Versioned fee schedules with approval before use | P1 |
| Proration and transfer adjustments on mid-year enrollment and withdrawal | P1 |
| Payment links sent by SMS or email, opening a provider checkout without the Parent app | P1 |
| Recurring billing where the provider supports it | P2 |
| Cash closing per cashier per day, with variance recording | P0 |
| Daily reconciliation against provider settlement records; exceptions list | P0 |
| Provider fee tracking per transaction | P1 |
| Pending, expired, failed and disputed transaction states with handling rules | P0 |
| Separate permissions: cashier (record), finance officer (manage), approver (approve discounts, refunds, voids) | P0 |
| Expenses, budgets and approvals; supplier payments | P1 |
| Accounting period closing; journal export; future general-ledger integration | P2 |

### 2.7 Staff, HR and payroll (expands 02 section 4.4 and 4.17)

- Recruitment: vacancies, applicants, interview notes, offer (P2)
- Contracts with start, end and renewal reminders; qualifications with expiry (P1)
- Onboarding and offboarding checklists; offboarding revokes access (see section 5) (P1)
- Performance reviews with configurable forms (P2)
- Payroll: allowances, deductions, Ethiopian income tax and pension configuration, payslips, bank export, accounting export. Local rules must be validated by a payroll professional before production (P2)

### 2.8 Communication (adds to 02 section 4.12)

- Class groups: announcement channels per section for teachers and guardians (P1)
- Approved broadcasts: announcements above an audience size need approval (P1)
- Escalation rules: unanswered guardian messages escalate after a school-set time (P1)
- Email to guardians as a channel alongside app push and SMS (P1)

### 2.9 Library (expands the current register)

- Renewals, reservations, fines where the school uses them (P1)
- Barcode scanning with the device camera and ISBN import of catalog data (P1)
- Reading lists per grade and digital resources (P2)

### 2.10 Transport

- Drivers and attendants with licence and contact details (P1)
- Transport fees linked to finance (P1)
- Vehicle maintenance and fuel records (P2)
- Pickup and drop-off updates to guardians (P2)
- GPS tracking and route optimization only through integrations (P2)

### 2.11 Inventory, procurement and facilities

- Supplies and textbooks with stock movements and stock alerts (P2)
- Purchase requests, purchase orders, vendors, receiving (P2)
- Asset maintenance and depreciation records (P2)
- Several stores per campus (P2)

### 2.12 Learning management

- Lessons as ordered sequences of materials and activities within a unit (P2)
- Quizzes, reusing the question bank in section 2.5 (P2)
- Course templates and content versioning (P2)
- Links from a lesson to MySeed Student learning content, through the Connect contract only (P2)

### 2.13 Reports and analytics (adds to 02 section 4.15)

- Configurable dashboards built from widgets (P1)
- Retention and staff workload reports (P1)
- Branch comparisons (requires `module.multi_campus`) (P1)
- PDF output for all standard reports (P1)

### 2.14 Documents and records (new module)

- Document templates for certificates, enrollment forms, consent forms and letters (P1)
- Student and staff files with version history (P1)
- Controlled sharing: time-limited links, audited (P1)
- Approval steps before a document is issued (P1)
- Bulk certificates per section or grade (P1)
- Retention rules and secure archival (P1)

### 2.15 Helpdesk and service desk (new module)

- Tickets for IT requests, facility issues and staff assistance, and parent inquiries received from the Parent app (P2)
- Categories, priorities, assignment, escalation and service-level targets (P2)
- Knowledge base; optional connection to MySeed Support for platform issues (P2)

### 2.16 Student welfare and safeguarding (new module)

- Restricted incident reports, counseling referrals, follow-up actions, confidential case ownership (P2)
- Access only for named safeguarding roles; every read is logged; strict retention rules (P2)
- Never exposed through the Connect API. Requires the legal review in decision D6 before release

### 2.17 Cafeteria and school services (replaces "feeding" in 02 section 4.17)

- Meal plans and subscriptions billed through finance (P2)
- Cafeteria transactions and stock usage (P2)
- Cashless student accounts and meal eligibility (P2)
- Dietary and allergy information restricted to named roles, following the sensitive-category rules in 02 section 4.3

### 2.18 Alumni, donations and community (replaces "alumni" in 02 section 4.17)

- Alumni records and networks (P2)
- Events with registration (P2)
- Approved fundraising campaigns, donation receipts and donor reporting (P2)
- Volunteers (P2)

## 3. Module lifecycle and registry

Document 06 defines entitlements but not how a module is activated or retired inside a tenant. Add:

### 3.1 Module definition

Every module declares, in code and in the catalog:

- Stable key, version and capabilities
- Dependencies on modules and shared services
- Permissions and default role mappings
- Migrations and upgrade steps
- API routes, navigation entries and background jobs
- Integration connectors it can use, required credentials, health checks and metrics
- Retention and export behavior, and its deactivation policy

### 3.2 Activation flow

1. An administrator selects a module; the entitlement check runs.
2. Missing dependencies are explained, with the upgrade or add-on that provides them.
3. Module configuration is applied (migrations ship with releases; activation never runs schema changes per tenant).
4. Default roles and permissions are created; navigation and routes become available.
5. Required integrations are listed and health checks run; the module reports **Ready** or what is missing.
6. Activation history records the module, version, time and administrator.

### 3.3 Deactivation

Follows the existing rule in 06 section 2.2 (read-only, then export-only, never deleted) and adds: a visible deactivation history, a reactivation path that restores access to the same records, and a module health page per tenant.

### 3.4 Tables

`module_activations` (organization, module, version, status, activated_by, activated_at, deactivated_at, reason) and `module_health_checks`.

## 4. Integration Center

Document 06 and the current Administration > Integrations page cover provider configuration and a test message. The PDF asks for a full Integration Center.

### 4.1 Capabilities

| Capability | Requirement | Priority |
| --- | --- | --- |
| Provider catalog | Supported providers, compatible modules, requirements and capabilities. List only providers whose connector is implemented and tested | P0 |
| Connect and configure | Credentials, sandbox or live environment, field mappings, organization or campus scope | P0 |
| Test connection | Validates credentials and operations without real payments or messages to real recipients | P0 |
| Activate | A connection is used by workflows only after explicit activation | P0 |
| Monitor | Health, last successful operation, failures, rate limits, usage | P1 |
| Diagnose | Sanitized logs with error details and troubleshooting text | P1 |
| Retry and recover | Safe retry, duplicate protection, dead-letter list with manual replay | P0 |
| Manage secrets | Rotate, revoke and replace; secrets never shown again after saving | P0 |
| Audit and disconnect | Every configuration change audited; a disconnect step that shows what stops working | P0 |
| In-module entries | Finance, Academics, HR and Communication each show their own Integrations tab, backed by the same central inventory and permissions | P1 |

### 4.2 Status model

`not_configured`, `needs_authorization`, `connected`, `degraded`, `failed`, `disabled`. Status comes from real health checks and recent operation results, never from the presence of a credential.

### 4.3 Categories to plan for

| Category | Notes | Priority |
| --- | --- | --- |
| Payments | Provider-neutral contract (section 4.4) | P0 |
| SMS and USSD | USSD for balance and attendance queries is P2 | P0 SMS, P2 USSD |
| Email and push | Push to staff through the PWA | P1 |
| Accounting and HR | Journal export, payroll export, employee sync | P2 |
| Devices | Attendance devices, library scanners | P2 |
| Storage | External storage and backup destinations | P1 |
| Identity | Organizational single sign-on for staff | P2 |
| Education authorities | Only where a real API and agreement exist | P2 |
| Custom | Scheduled imports, outgoing webhooks, customer-built connectors | P1 |

### 4.4 Payment provider contract

Every payment adapter implements one interface and declares which operations it supports. Unsupported operations return an explicit "not supported" result and are never simulated.

```
createPayment(intent)          -> provider reference, checkout URL
getPaymentStatus(reference)    -> pending | completed | failed | expired | disputed
verifyCallback(request)        -> verified event or rejection
requestRefund(payment, amount) -> refund reference or not_supported
getSettlementRecords(day)      -> settlement lines or not_supported
```

### 4.5 Developer platform (extends `module.api`)

- Sandbox tenant with sample data for API clients (P1)
- Scoped API keys for third parties, and OAuth where a user grants access (P1)
- Rate limits, quotas and usage metering per client (P1)
- Version deprecation notices in responses and the developer page (P1)
- Public school events for third-party webhooks, named without the `school.` prefix used by the Connect contract: `student.enrolled`, `attendance.recorded`, `invoice.paid`, `grade.published`. Payloads exclude sensitive fields unless the client is authorized for them (P1)
- Connector marketplace (P2)

## 5. Workflow automation

A rule engine with trigger, condition and action, owned by the school. Rules need a permission to edit, an execution log, retries, failure notification and duplicate-message protection.

| Built-in rule | Priority |
| --- | --- |
| On enrollment, notify the homeroom teacher and authorized guardians | P1 |
| On overdue invoice, queue reminders on the school's preferred channel | P0 (partly built as manual reminders) |
| On absence, notify guardians per school policy | P0 (built) |
| On grade approval, publish to authorized users | P1 |
| On staff departure, revoke access and start offboarding | P1 |
| On repeated integration failure, alert the designated administrator | P1 |

## 6. Staff workspace

Document 01 lists navigation and a teacher workspace. Add:

- Role dashboards for principal, teacher, registrar, finance officer, HR officer, IT administrator and school owner, with the widgets listed in the PDF (P0 for principal, teacher, registrar and finance officer; P1 for the rest)
- Configurable widgets per user (P1)
- Saved filters on every list (02 section 5 already asks for saved views)
- Batch actions on lists (P1)
- A tasks and approvals inbox that collects pending approvals across modules (P1)
- Quick actions per role (P0)

New role templates for document 02 section 3: **Cashier**, **Finance approver**, **HR officer**, **IT administrator**, **Librarian**, **School owner** (read-only view of performance, finances, modules and subscription).

## 7. SaaS packaging additions

### 7.1 New entitlement keys

| Key | Module | Depends on |
| --- | --- | --- |
| `module.documents` | Documents and records | core |
| `module.helpdesk` | Helpdesk and service desk | core |
| `module.welfare` | Student welfare and safeguarding | core |
| `module.cafeteria` | Cafeteria and school services | core, finance |
| `module.alumni` | Alumni, donations and community | core |
| `module.lms` | Lessons, quizzes and course templates | materials |
| `module.online_assessment` | Question banks and online assessments | results |
| `module.payroll` | Payroll (separate from `module.hr`) | hr |
| `module.procurement` | Purchasing, vendors and stock | inventory |
| `module.staff_attendance` | Staff attendance | hr |
| `module.automation` | Custom workflow rules | core |

New limit keys: `limit.api.requests_daily`, `limit.automation.rules`.

### 7.2 Platform billing (separate from school finance)

The PDF requires school finance and MySeed SaaS billing to stay separate in ownership, records, reports, permissions and accounting, while allowed to share provider adapters and invoice rendering. Add to the platform console:

- Subscription invoices, renewals, trials, plan changes, grace periods and overdue policy (P0 before paid launch)
- Promotions (P1)
- Partner pricing, referral commissions and revenue attribution (P2)
- Auditable subscription exceptions (already required for overrides)

The PDF names the bundles Essential, Professional, Enterprise and Custom. Keep the names in document 06 (Starter, Professional, Enterprise, Institutional, plus build-your-own) unless the business decides otherwise under D5.

## 8. Deployment additions (adds to 05 section 7)

- Update channels (stable, early access) for self-hosted instances (P2)
- Documented rollback after a failed upgrade, in addition to restore from the pre-upgrade backup (P1)
- Optional remote support and monitoring for self-hosted, off by default, with visible controls for the local administrator (P1)
- The local school administrator and the MySeed platform administrator are separate roles; a self-hosted install never grants MySeed access to records by default (already implied by 03 section 14; state it in 06)

## 9. Acceptance criteria to add to document 06

1. A school activates a module without a code deployment, and deactivating it never deletes records.
2. Schools can build a custom package within their permitted entitlements.
3. Staff see only the navigation, records and actions they are authorized for.
4. The PWA installs and works on PC, Android and iOS, with published install instructions.
5. Offline actions show whether they are local drafts or server-confirmed.
6. Every integration has configuration, health checks, logs, retries and controlled credentials.
7. Guardian-access and role-escalation tests pass, in addition to tenant isolation.
