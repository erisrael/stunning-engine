# MySeedSchoolHub product overview

Status as of 2026-11-23, written from the code at commit `16e8c19` on branch `build/m0-sdk-foundations`.

## 1. The problem it solves

Ethiopian schools (private, public and school groups) run admissions, classes, attendance, marks, report cards and fees on paper, spreadsheets or disconnected tools. Students and parents who use the MySeed Student and Parent apps cannot see their school's timetable, assignments, materials, attendance or results in those apps.

MySeedSchoolHub (SchoolHub) is a multi-tenant school management system that:

- is the system of record for everything a school produces (enrollment, classes, attendance, timetable, assignments, materials, marks, report cards, fees, parent-teacher messages);
- runs either hosted by MySeed (one deployment, one subdomain per school) or self-hosted on the school's own server;
- connects to the MySeed Education System through a server-to-server Connect API and signed webhooks, so the MySeed apps can show school data without MySeed copying the school's records.

## 2. Who uses it

### 2.1 School staff (sign in to the school portal)

Role templates come from `ROLE_TEMPLATES` in `packages/contracts/src/permissions.ts`. Schools can also create custom roles.

| Role key | Role | Main work |
| --- | --- | --- |
| `owner` | Organization owner | Everything, including plan, roles and integrations |
| `school_admin` | School administrator | School administration without role editing, integrations or refund approval |
| `registrar` | Registrar | Admissions, enrollment, student and guardian records, MySeed link approvals |
| `academic_head` | Academic head | Structure, teaching assignments, lesson plan review, marks approval, report cards |
| `teacher` | Teacher | Assigned classes: attendance, assignments, materials, marks |
| `homeroom_teacher` | Homeroom teacher | Teacher plus the homeroom class |
| `accountant` | Accountant | Fees, invoices, payments, discounts, refunds, accounting |
| `cashier` | Cashier | Record payments and receipts |
| `communication_officer` | Communication officer | Announcements, SMS, templates, delivery log, calendar |
| `librarian` | Librarian | Library catalog, loans and holds |
| `transport_officer` | Transport officer | Routes and riders |
| `counselor` | Counselor | Behavior, clubs and student follow-up |
| `store_keeper` | Store keeper | Assets and inventory |
| `hr_officer` | HR officer | Staff records and leave approvals |
| `payroll_officer` | Payroll officer | Payroll |
| `nurse` | Nurse | Clinic records |
| `boarding_master` | Boarding master | Boarding |
| `canteen_manager` | Canteen manager | Canteen |
| `auditor` | Auditor | Read-only records, finance reports and the audit log |

### 2.2 MySeed staff (sign in to the platform console)

From `PLATFORM_ROLE_TEMPLATES` in `packages/contracts/src/platform.ts`: `platform_admin`, `platform_support`, `platform_sales`, `platform_developer`.

### 2.3 Students and guardians

Students and guardians do not sign in to SchoolHub. They use the MySeed Student and Parent apps, which reach the school through the MySeed Education System and the SchoolHub Connect API after the school approves a link. A student can also use the in-portal `learn` area for online exams (route `apps/portal/app/(app)/learn`).

### 2.4 The public

The public site (features, pricing with a package builder, hosting, developers, school directory and school landing pages, document verification, contact, privacy, terms).

## 3. Modules and main screens

Modules are switched on by entitlement keys in `packages/contracts/src/modules.ts` (for example `module.attendance`, `module.finance`). Screens live under `apps/portal/app`.

| Area | Main screens (portal routes) | Entitlement keys |
| --- | --- | --- |
| Home and workspaces | `/home` (role landing), `/overview`, `/teach`, `/homeroom`, `/account` | `module.core` |
| School administration | `/admin/school`, `/admin/users`, `/admin/roles`, `/admin/plan`, `/admin/branding`, `/admin/website`, `/admin/custom-fields`, `/admin/sensitive-data`, `/admin/integrations`, `/admin/webhooks`, `/admin/documents`, `/admin/audit`, `/admin/privacy`, `/admin/data-governance`, `/admin/support` | `module.core`, `module.governance_plus`, `module.api` |
| Builders | `/builders/theme`, `/builders/branding`, `/builders/website`, `/builders/id-cards`, `/builders/reports` | `module.core`, `module.id_cards`, `module.reports_advanced` |
| People | `/people/students`, `/people/guardians`, `/people/staff`, `/people/admissions` (with a public form), `/people/duplicates`, `/people/corrections`, `/people/id-cards`, `/people/alumni`, `/people/evaluation` | `module.core`, `module.online_admissions`, `module.id_cards`, `module.alumni`, `module.hr` |
| Academics | `/academics` (years, terms, grades), `/academics/sections`, `/academics/subjects`, `/academics/rooms`, `/academics/grading`, `/academics/teaching`, `/academics/promotion` | `module.academics` |
| Attendance | `/attendance`, `/attendance/take`, `/attendance/corrections`, `/attendance/report` | `module.attendance` |
| Timetable and calendar | `/timetable`, `/calendar` | `module.timetable` |
| Learning | `/learning/assignments`, `/learning/materials`, `/learning/lesson-plans` | `module.assignments`, `module.materials`, `module.lesson_plans` |
| Exams | `/exams`, `/exams/checkin`, `/exams/simulator`, `/learn/exams` | `module.results` |
| Results | `/results/assessments`, `/results/gradebook`, `/results/report-cards`, `/results/transcripts`, `/results/certificates` | `module.results` |
| Finance | `/finance/fees`, `/finance/invoices`, `/finance/payments`, `/finance/discounts`, `/finance/refunds`, `/finance/transfers`, `/finance/reconciliation`, `/finance/accounting`, `/finance/payroll` | `module.finance`, `module.finance_online`, `module.accounting`, `module.hr_payroll` |
| Communication | `/communication/announcements`, `/communication/messages`, `/communication/sms`, `/communication/templates`, `/communication/deliveries`, `/communication/office-hours` | `module.communication`, `module.messaging` |
| MySeed connections | `/connections`, `/connections/codes`, `/connections/requests`, `/connections/list`, `/connections/settings` | `module.core` |
| Operations | `/operations/library`, `/operations/transport`, `/operations/clubs`, `/operations/behavior`, `/operations/assets`, `/operations/leave`, `/operations/clinic`, `/operations/boarding`, `/operations/canteen` | `module.library`, `module.transport`, `module.activities`, `module.discipline`, `module.inventory`, `module.hr`, `module.clinic`, `module.boarding`, `module.feeding` |
| Reports and data | `/reports`, `/reports/builder`, `/data` (import and export) | `module.reports_advanced` |
| Platform console | `/platform/tenants`, `/platform/catalog`, `/platform/billing`, `/platform/quotes`, `/platform/hosting`, `/platform/licenses`, `/platform/clients`, `/platform/providers`, `/platform/templates`, `/platform/id-cards`, `/platform/website`, `/platform/content-manager`, `/platform/role-templates`, `/platform/team`, `/platform/support`, `/platform/events`, `/platform/operations`, `/platform/audit`, `/platform/settings` | Platform roles, not school entitlements |

Limits are separate keys: `limit.students`, `limit.staff`, `limit.campuses`, `limit.storage`, `limit.file`. Branding features are `feature.custom_domain` and `feature.white_label`.

## 4. Where it runs

| Surface | Technology | Status |
| --- | --- | --- |
| Web: public site, school portal, platform console | Next.js app in `apps/portal`; schools on `<school>.<ROOT_DOMAIN>` | Built |
| API and Connect API | NestJS app in `apps/api`, `/api/v1` and `/connect/v1` | Built |
| Background worker | `apps/api/src/worker.ts` | Built |
| Mobile (MySeed Student and Parent apps) | Separate repositories, not in this one | Not found in the code (by design) |
| Bots | None | Not found in the code |
| Devices | Printable ID cards, report cards and certificates with QR and barcodes; exam check-in screen | Built |
| Hosted deployment | Docker images and Compose; hosting provider is open decision D3 | To confirm: no live hosted deployment is recorded in the repository |
| Self-hosted deployment | `deploy/compose/docker-compose.selfhosted.yml`, Caddy, `deploy/scripts/*.sh` | Built, not yet run on a clean server |

## 5. Principles it keeps

These come from `CLAUDE.md` and the specification in [specification index](../existing/SPECIFICATION-INDEX.md), and are visible in the code.

- SchoolHub is the system of record for school data. School records are not copied into MySeed; the Education System reads through the Connect API (`apps/api/src/modules/connect`) and receives events by webhook.
- A school link always needs school approval (link code, phone code, details match or registrar review).
- Features are gated by entitlement keys (`module.*`, `limit.*`, `feature.*`), never by plan names (`apps/api/src/core/entitlements.ts`).
- Tenant context comes from the server (request host or Connect token), never from request input (`apps/api/src/core/tenant-host.ts`). Tenant tables have Postgres row-level security.
- Money is integer minor units with a currency. Published marks, enrollments and ledger entries are not updated in place; changes create revisions or new entries.
- Every API change starts with the Zod schema in `packages/contracts`.
- No emoji or decorative symbols anywhere (`scripts/check-emoji.mjs`, run in CI). UI follows the [UI rules](../existing/UI-RULES.md).
- Ethiopian context first: Ethiopian and Gregorian calendars (`packages/calendar`), Addis Ababa time for scheduled work, English and Amharic interface strings, Ethiopic font for printed documents.
