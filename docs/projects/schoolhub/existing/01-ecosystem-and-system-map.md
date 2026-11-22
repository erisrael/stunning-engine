# 01. Ecosystem and system map

## 1. The products

| Product | Surface | Users | Purpose |
| --- | --- | --- | --- |
| MySeedSchoolHub portal | Web (Next.js) | School owners, administrators, registrars, teachers, accountants, auditors | Run the school: people, academics, attendance, assessments, materials, fees, communication |
| MySeedSchoolHub platform console | Web (Next.js), MySeed-internal | MySeed platform staff | Tenants, plans, modules, entitlements, licenses, integration health, support access |
| MySeed Education System | Web admin (Next.js) and App API (NestJS) | MySeed staff; serves both apps | Learning content, learners, subscriptions, MySeed finance, communications, app configuration, device policy, School Gateway |
| MySeed Student | Android and iOS (React Native) | Students, grades 5 to 12 | MySeed learning, plus a My School area when linked to a school |
| MySeed Parent | Android and iOS (React Native) | Parents and guardians | Follow and manage several children across MySeed and their schools; talk to teachers |
| MySeedSpace | Existing product | Organizations | Organization management; maps organizations to SchoolHub tenants |
| MySeed website | Existing product | Public | Discovery, school enquiries, sign-up entry points |

## 2. Data ownership

One owner per record type. Other systems read it through an API or react to its events; they never write to it directly.

| Data | System of record | Who else sees it, and how |
| --- | --- | --- |
| MySeed account (phone, profile, sessions, devices) | Education System (MySeed Identity) | SchoolHub sees only an opaque `myseed_subject_id` on a connection |
| Student school record, enrollment, class membership | SchoolHub | Apps via Connect API, scoped to an active connection |
| Guardian record and guardian-child relationship at school | SchoolHub | Parent app via Connect API |
| Attendance, timetable, calendar, announcements | SchoolHub | Apps via Connect API |
| Assignments, submissions, teacher feedback | SchoolHub | Apps via Connect API; submissions written through it |
| School materials (files and metadata) | SchoolHub | Apps via short-lived signed URLs |
| Marks, published results, report cards | SchoolHub | Apps see published items only |
| School fees, invoices, school payments | SchoolHub | Parent app via Connect API |
| Parent-teacher conversations | SchoolHub | Parent app via Connect API and realtime relay |
| MySeed courses, lessons, videos, quizzes | Education System | Not shared with SchoolHub (schools may link to public lessons in P1) |
| MySeed learning progress | Education System | Shared to a school only if the guardian or student opts in (P1) |
| MySeed subscriptions and MySeed payments | Education System | Not shared |
| Parental controls on a MySeed account | Education System | Not shared |
| Plans, modules, entitlements, licenses | SchoolHub platform console | Read by each SchoolHub tenant at runtime |
| Organization profile and hierarchy | MySeedSpace | SchoolHub stores a reference `myseedspace_org_id` |

Rule of thumb: **a school-produced fact lives in SchoolHub; a MySeed-produced fact lives in the Education System.** A student can be a MySeed learner with no school, and a school student can use the school features without a paid MySeed subscription.

## 3. System context

> [!NOTE]
> Diagram source kept as text. The original is a Mermaid diagram, which the document library does not display.

```text
flowchart LR
  subgraph Clients
    SA["MySeed Student app"]
    PA["MySeed Parent app"]
    SP["SchoolHub portal (school staff)"]
    PC["Platform console (MySeed staff)"]
    EA["Education System admin (MySeed staff)"]
  end

  subgraph EDU["MySeed Education System (MySeed cloud)"]
    ID["MySeed Identity<br/>phone OTP, sessions, devices"]
    APP["App API"]
    GW["School Gateway"]
    LRN["Learning, subscriptions,<br/>MySeed finance, parental controls"]
    NOTI["Notification service<br/>push, SMS, email"]
  end

  subgraph SH["MySeedSchoolHub (hosted or self-hosted)"]
    API["SchoolHub API"]
    CON["Connect API"]
    WK["Worker<br/>outbox, PDFs, imports"]
    DB[("PostgreSQL")]
    OBJ[("Object storage")]
  end

  SA --> APP
  PA --> APP
  APP --> ID
  APP --> LRN
  APP --> GW
  GW -- "client assertion + connection grant" --> CON
  CON --> API
  WK -- "signed webhooks (events)" --> GW
  GW --> NOTI
  NOTI --> SA
  NOTI --> PA
  SP --> API
  PC --> API
  EA --> LRN
  API --> DB
  API --> OBJ
  WK --> DB
  SA -. "signed URL download" .-> OBJ
  PA -. "signed URL download" .-> OBJ
```

The dotted lines are the only direct contact between an app and SchoolHub infrastructure: downloading a file through a URL that SchoolHub signed for that user, for a few minutes. For self-hosted schools without public storage, the gateway streams the file instead (see document 03, section 7).

## 4. SchoolHub portal map

The portal is served per tenant (`{school}.schoolhub.myseed.et` when hosted, the customer's own domain when self-hosted). Navigation is filtered by effective entitlements first, then by the user's permissions. The header carries the campus selector, academic-year selector, global search (`cmdk`), notifications and the profile menu.

### 4.1 Administrator and staff navigation

- **Overview** `/overview`
  - Today: attendance completion by class, absentees, pending link requests, unpublished results, overdue invoices, failed syncs
  - Setup checklist (shown until the school is fully configured)
- **People**
  - Students `/people/students`; student profile `/people/students/[id]` with tabs: Profile, Enrollment history, Guardians, Attendance, Results, Assignments, Fees, Documents, MySeed connections, Activity log
  - Guardians `/people/guardians`
  - Staff `/people/staff`
  - Admissions `/people/admissions` (applications, decisions, waiting list)
  - Imports `/people/imports`
- **Academics**
  - Academic years and terms `/academics/years`
  - Structure `/academics/structure` (levels, grades, streams, sections)
  - Subjects `/academics/subjects`
  - Teacher assignments `/academics/teaching`
  - Grading rules `/academics/grading`
  - Promotion `/academics/promotion`
- **Attendance** `/attendance` (today, sessions, corrections, reports)
- **Timetable and calendar** `/timetable`, `/calendar`
- **Learning**
  - Assignments `/learning/assignments`
  - Materials library `/learning/materials`
  - Submissions inbox `/learning/submissions`
- **Assessments and results**
  - Assessments `/assessments`
  - Marks entry `/assessments/marks`
  - Report cards `/results/report-cards`
  - Publication queue `/results/publish`
- **Finance**
  - Fee structures `/finance/fees`
  - Invoices `/finance/invoices`
  - Payments and receipts `/finance/payments`
  - Discounts and scholarships `/finance/discounts`
  - Reconciliation `/finance/reconciliation`
- **Communication**
  - Announcements `/communication/announcements`
  - Messages `/communication/messages`
  - Templates `/communication/templates`
  - Delivery log `/communication/delivery`
- **MySeed connections** `/connections`
  - Link requests (queue), Active connections, Link codes (generate, print, send by SMS), Sync health
- **Reports** `/reports`
- **Administration** `/admin`
  - School profile and campuses, calendar and languages
  - Users and roles, permission matrix
  - Modules and plan (current entitlements, usage, package builder, upgrade requests)
  - Integrations (MySeed Connect, SMS, email, payment providers)
  - Data (exports, retention, privacy requests)
  - Audit log
  - Billing (SchoolHub subscription invoices, hosted only)

### 4.2 Teacher workspace

Teachers get a focused navigation instead of the full admin tree:

- **My day** (today's periods, attendance to take, submissions to review, unread messages)
- **My classes** (per section: roster, attendance, gradebook, assignments, materials)
- **Take attendance** (fast roster entry, works offline as a draft)
- **Gradebook** (marks entry per assessment, validation, submit for approval)
- **Assignments and materials**
- **Messages** (guardian conversations for assigned students only)
- **Timetable**

## 5. Platform console map (MySeed-internal)

- Tenants: create, provision, suspend, reactivate, offboard, export
- Catalog: modules, dependencies, bundles, plan versions, price books, capacity bands
- Quotes and contracts: custom packages, discounts, approvals
- Entitlements: effective view per tenant, overrides with reason and expiry
- Licenses: self-hosted license issuance, activation, renewal, version compatibility
- Connect registry: which tenants have MySeed Connect enabled, credential rotation, webhook health
- Operations: queues, job failures, outbox lag, storage, error rates, release status
- Support access: time-limited, reason-recorded, tenant-approved access grants
- Governance: platform audit log, privacy requests, incident register

## 6. MySeed Student app map

Bottom navigation: **Home, Learn, My School, Progress, Profile.**

- **Home**: continue learning, today's school periods, due assignments, new materials, announcements, subscription notice, sync warning
- **Learn** (Education System): subjects, courses, lessons, video, quizzes, flashcards, national exam practice, bookmarks, downloads
- **My School** (only school data, only when linked; otherwise a "Connect your school" entry)
  - School switcher (rare; supports a student at two institutions)
  - Today: periods, attendance status, due work
  - Timetable (day and week)
  - Assignments: list, detail, attachments, submit, receipt, feedback
  - Materials: by subject, then topic or week; preview, download, offline
  - Attendance: summary and history
  - Results: published assessments and report cards (PDF)
  - Calendar: exams, holidays, events, deadlines
  - Announcements
  - Connection: status, last sync, request help, disconnect
- **Progress**: MySeed learning progress; school results in a separate, labeled section
- **Profile**: account, subscription, school connections, linked guardians, downloads, language, notifications, devices, privacy, help

## 7. MySeed Parent app map

Bottom navigation: **Overview, Children, Messages, Fees, Account.** Fees is hidden when no linked school enables the fees module.

- **Overview**: action center (absences, due work, new results, fee due, unread replies, requests awaiting approval), per-child summary cards
- **Children**: child switcher, then per child:
  - School: attendance, timetable, assignments and status, materials visible to guardians, results and report cards, calendar, announcements, teachers
  - Learning: MySeed progress, time spent, quiz performance
  - Controls: parental controls for the child's MySeed account (document 04, section 4)
  - Connections: school links and their status, request a new link
- **Messages**: conversations grouped by child and school; new conversation with an authorized teacher
- **Fees**: invoices per child and school, pay, receipts, history
- **Account**: profile, verified phone, linked children, notification preferences per child and category, quiet hours, language, devices, privacy, help

## 8. Education System areas that touch SchoolHub

The full Education System specification is maintained with that product. The areas below exist because of the integration and must be built there:

| Education System area | Integration responsibility |
| --- | --- |
| Integrations, School directory | List of SchoolHub tenants with MySeed Connect enabled (name, city, logo, link methods); credential and webhook health per tenant |
| Learners and Parents | Show active school connections and guardian links on each account (read-only) |
| Parental controls | Store and enforce MySeed-side controls set from the Parent app |
| Notifications | Route SchoolHub events to push, SMS or in-app; respect per-child preferences and quiet hours |
| Support | Link-request help cases, routed to the school when the school must act |
| App configuration | Feature flag for My School, minimum app versions, device security policy covering school screens |
