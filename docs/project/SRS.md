# Software requirements specification: Myseed Ops

## 1. Introduction

### 1.1 Purpose

This specification states what Myseed Ops does, as built in November 2026, in the IEEE 830 / ISO 29148 outline used by the Dev team's SRS template. It is the reference for changes (a new requirement gets the next free ID in its section), for the [test plan](TEST-PLAN.md), and for anyone who needs to know what the system promises.

### 1.2 Scope

Myseed Ops is Myseed's operations system at https://ops.myseed.com.et: content production, every department's work, people and attendance, finance and payments, customer support, the Noor CMS, communication, planning, and Fun mode. It is not the Myseed learning app or Noor themselves; it connects to them.

### 1.3 Conventions

- IDs: `FR` functional, `NFR` non-functional, `IR` interface, `DR` data. IDs are grouped by area (FR-1 to FR-9 production, FR-10 onwards departments, and so on) and are never reused.
- Priorities (MoSCoW): (Must), (Should), (Could), (Won't).
- Each requirement has acceptance criteria; the roadmap phase that built it is in brackets.

### 1.4 References

[Product overview](PRODUCT-OVERVIEW.md), [technical design](ARCHITECTURE.md), [decision log](DECISIONS.md), [roadmap](../ROADMAP.md), [the original product plan](../../Myseed_Content_Manager_Plan.md), [Update 1.2 plan](../UPDATE-1.2-PLAN.md), [runbook](../RUNBOOK.md).

## 2. Overall description

### 2.1 Users

Production staff (Recording, Editing, Uploading, Publication), managers and owners, department staff (Dev, Studio, Marketing, HR, Finance, Support, Sales, Operations), administrators, customers without accounts (support widget, Telegram, support app) and guests (the arcade). Roles and their permissions are listed in the [product overview](PRODUCT-OVERVIEW.md), section 2.

### 2.2 Operating environment

- Server: Node.js 22 or newer, PostgreSQL (17 on the VPS, or Supabase), Docker on a Linux VPS behind Caddy.
- Browsers: current Chrome, Edge, Safari and Firefox on laptops; Chrome on Android phones from 2 GB of memory; Safari on iPhone.
- Networks: office Wi-Fi, 4G, 3G and dropped connections.
- Time zone Africa/Addis_Ababa (UTC+3) by default; Gregorian or Ethiopian calendar per person.

### 2.3 Constraints and assumptions

- Schema changes are additive only (ADR-3); deploys go out from `main` (ADR-6); free and self-run services first (ADR-7).
- Content follows the Ethiopian curriculum: grade, subject, unit, part.
- Outside systems (Chapa, Noor, Telegram, SMS, mail, AI providers) can be slow or unavailable; the system keeps working and says so.

## 3. Functional requirements

### 3.1 Production workflow

FR-1 (Must): The curriculum is held as grades, subjects, units and parts, imported from the tracker backup or by file, and each part is an item with a code. [Phases 1, 32]
  Acceptance: `npm run db:import` and Import and export load the hierarchy; Curriculum shows it; fixes are recorded as curriculum changes.
FR-2 (Must): Each item moves through Recording, Editing, Uploading and Publication, with start, pause, block, submit, accept, return and reopen per stage. [Phase 2]
  Acceptance: only the allowed moves for the person's role and the stage's state are offered and accepted by the server.
FR-3 (Must): A stage cannot be handed over without its evidence: recordings by camera code and duration, a master with captions and thumbnail, the upload, and verified live links for publication. [Phase 2, 5d]
  Acceptance: submitting without the evidence is refused with what is missing.
FR-4 (Must): Work sent back (by the next team, a redo request or the lead) shows as Redo everywhere until it is done again. [Phase 44]
FR-5 (Must): Team leads approve finished work and hand it over, alone or in batches; handovers can be approved or rejected with a report. [Phases 5d, 31]
FR-6 (Should): Overview, List, Sheet, Board, Calendar, Coverage, Reports and Team views, with filters and saved presets, plus My work for every person. [Phases 1 to 6, 36]
FR-7 (Should): Studio sessions are booked and presenters registered, with releases and monthly fees. [Phases 10, 16.1]
FR-8 (Should): The Legacy catalog holds the recording details of older content and what is ready to hand off. [Phases 34, 36]

### 3.2 Departments

FR-10 (Must): Admin creates departments from templates; heads configure statuses, types, fields, names and rights, with versions. [Phase 5c]
FR-11 (Must): Each department has a flow: stages with who works them, lead review, what must be done first, where work goes next, targets and limits. Only finished work moves on. [Phase 12]
  Acceptance: a member cannot move work past a review stage; the lead approves or returns with a note.
FR-12 (Must): Departments ask each other for work through Requests; a request becomes a task in the receiving lead's intake. [Phases 5c, 12]
FR-13 (Should): Boards, lists, sheets, timeline (Gantt with dependencies and the critical path), calendar, dashboards with widgets, reports and a data manager per department. [Phases 5c, 12b, 23]
FR-14 (Should): The Company overview shows every department's state for owners and managers. [Phase 5c]

### 3.3 Dev studio and documents

FR-20 (Must): Sprints configurable per department (length, start day, naming, points or hours, capacity, rituals, carry-over), with planning, burndown and burnup, stand-ups, review, retrospective and velocity. [Phase 12b.1]
FR-21 (Must): The Dev flow: Backlog, To do, In progress, Code review, QA, Ready to release, Released, with pull request state on the card and a merged pull request moving the task on. [Phase 12.2]
FR-22 (Should): A roadmap of projects by quarter with progress, health, open bugs and the next milestone; a portfolio across departments. [Phase 12b.2]
FR-23 (Must): Specs and docs: documents from templates (SRS, product brief, technical design, decision record, test plan, release notes, runbook, postmortem), versions, named reviewers and approval; a change after approval starts a new version. [Phase 12b.3]
FR-24 (Must): Requirement IDs in a document are traced to the tasks that build them; uncovered requirements stand out. [Phase 12b.3]
FR-25 (Must): Documents are stored as Markdown exactly as written or imported, and shown as a formatted company document (header with logo, document control, contents, styled body) in the app, the PDF and the HTML export. [Phase 46]
  Acceptance: an imported `.md` file's stored text equals the file; raw HTML in a document is shown as text; the formatted view, PDF and HTML show the same document.
FR-26 (Must): A library per department with folders, documents and files, search through titles, text and names, pins, recent documents, duplicating, moving, import (Word, Markdown, text, web page) and export (Word, Markdown, HTML, PDF). [Phases 26, 46]
FR-27 (Should): The repository's documentation (docs/library.json) appears in the Dev library and follows the files on every deploy, without overwriting edits made in the app or restoring deleted documents. [Phase 46]
FR-28 (Should): Releases with semantic versions and deployments per environment, incidents with a timeline, test cases and runs linked to requirements, and DORA measures. [Phase 12b.5]

### 3.4 Communication

FR-30 (Must): Team chat with groups and direct messages, mentions, replies, pins, reactions, files, voice notes, read receipts, presence and search. [Phases 3, 7c]
FR-31 (Should): Voice and video calls in chat, and group calls. [Phases 5a, 10]
FR-32 (Should): A company inbox: mailboxes given by email managers, conversations, signatures, send later; sending through SMTP or a web API. [Phases 4, 14]
FR-33 (Should): Announcements and policies with confirmation and reminders. [Phase 18]
FR-34 (Should): Notifications in the app (the bell), by email, and as web push where allowed. [Phases 7b, 15]

### 3.5 People and attendance

FR-40 (Must): HR keeps employee records, documents, the org chart, equipment, leave with line manager and HR approval, hiring, joiners and leavers, performance, training and cases. [Phase 7]
FR-41 (Must): Attendance at a paired kiosk by QR, PIN, badge or face, checked against the office network and location, with breaks and lunch. [Phases 9, 10b]
FR-42 (Must): Face check-in is optional per person, off until HR switches it on, and always sits beside badge and PIN. [Phase 9 step 2]
FR-43 (Should): Check-ins without signal are kept on the phone and sent later. [Phase 19]
FR-44 (Must): Attendance kept by hand where needed, corrections with approval, and payroll input for everyone. [Phase 21]
FR-45 (Should): Recognition between colleagues. [Phase 21]

### 3.6 Finance and Chapa

FR-50 (Must): Accounts, bills, invoices, claims, purchasing, budgets, payroll and reports. [Phase 8]
FR-51 (Must): Chapa payments per business are synced in full (every page and date window), shown with filters, and reconciled; failed or unverified payments go to follow-up. [Update 1.0 phase 3, Update 1.2 phases 1 and 2]
  Acceptance: a sync reports how many transactions Chapa returned and how many were stored; a key that cannot be decrypted is named as such.
FR-52 (Should): Owners see Chapa and Noor income; access to Chapa is granted per person. [Phase 39]

### 3.7 Customer support

FR-60 (Must): A support desk with queues, automatic assignment, targets, conversations laid out like Team chat, and a customer panel. [Phases 19 to 20, 39]
FR-61 (Must): Customers reach support from the website widget, the support app, Telegram bots and the Telegram Mini App, in English and Amharic. [Update 1.1 phases 11 to 13]
FR-62 (Must): Browser calls through a phone menu (IVR) and queues to signed-in agents, with mute, hold, transfer, conference, call-backs and recordings with controlled access. [Update 1.1 phase 14, Update 1.2 phases 8 and 9]
FR-63 (Should): A knowledge base of how-to guides searched by customers and agents. [Update 1.1 phase 15]
FR-64 (Must): Customer support requests to other departments with approval chains and allowed moves per person. [Update 1.2 phase 7]
FR-65 (Should): Customers rate the agent at the end of a conversation. [November 2026]
FR-66 (Should): SMS from tickets with delivery reports (i-Conic). [Update 1.0 phase 7]

### 3.8 Legacy CMS (Noor)

FR-70 (Must): Noor's data is mirrored and read through the gate (ADR-10); live Noor only for Admin and granted people. [November 2026]
FR-71 (Must): Records with a filter builder, saved views and column choices; date-first views and reports exported to PDF, Excel and CSV. [Update 1.0 phase 2, Update 1.2 phases 3 and 4]
FR-72 (Should): The academic content manager adds units, lessons, quizzes and notes to Noor through Noor's own forms, in batches, with a report. [November 2026]
FR-73 (Should): Noor parents and students are matched by phone to support and payments. [November 2026]

### 3.9 Assistant

FR-80 (Should): An assistant on every page, aware of the person's role, answering in English and Amharic (Ge'ez and Latin), offering only what the role can do. [Phases 13 to 13d, 30]
FR-81 (Should): Agent mode carries out steps itself (opens pages, presses tabs and buttons) and stops before typing and risky steps. [Phases 22, 38]
FR-82 (Could): Routines: recorded steps shared and run again. [Phases 13d, 33]

### 3.10 Planning, performance and presentations

FR-85 (Should): Strategic plans with a logframe, indicators, actuals, risks and evaluation. [Phase 25]
FR-86 (Should): KPIs from recorded work, KRAs per role and position, scorecards and OKRs. [Phase 17]
FR-87 (Should): Presentations for every department from data and templates, in the company's colours, exported to PowerPoint and PDF, with a phone remote and meeting mode. [Phases 12c, 24]

### 3.11 Fun mode

FR-90 (Could): Points from work, games, music and playlists, a pet, focus mode, UI styles. [Phases 40, 41]
FR-91 (Could): Seed Town: a 3D town with homes, vehicles, town folk, Grand Prix, archery, football, Seed Strike and Seed Core, online and against bots. [Phases 41 to 45]
FR-92 (Could): The guest arcade (`/arcade`) for visitors without an account, nothing sent to the server, with locked Windows and Android kiosk builds. [Phase 45]

### 3.12 Administration and platform

FR-95 (Must): Admin manages people (deactivate, reactivate, delete), roles and permissions (View, Edit, Delete, Update per area), department positions and access. [Phases 1, 44]
FR-96 (Must): The sign-in policy: password rules, lockouts, two-step sign-in, passkeys, Google and Microsoft sign-in; sessions and devices can be ended. [Phase 15]
FR-97 (Must): Backups on a schedule (every table, gzipped, optionally encrypted) to the server, Google Drive or S3-compatible storage, with a test restore. [Phase 15.3]
FR-98 (Should): Platform pages: database with a read-only console, API usage, status and deploys, developer integration with OpenAPI, system health, errors. [Phases 15.5, 28]
FR-99 (Should): Branding (logo, favicon, name), colour themes, UI styles and fonts for everyone or per person. [Phases 13c, Update 1.0 phase 8]

## 4. Non-functional requirements

NFR-1 Security: every action, list and export is permitted by the viewer's role, access and position, checked on the server (ADR-4).
NFR-2 Secrets: provider keys are stored sealed with the server's encryption secret; no secret is in the repository or a log.
NFR-3 Privacy: a versioned privacy notice, a retention schedule applied daily, Download my data, and a log of who opened whose record. [Phase 16.5]
NFR-4 Traceability: every important action is in the append-only audit trail (ADR-5).
NFR-5 Availability: the app answers `/api/health`; a watchdog restarts it when it stops answering; a failed deploy keeps the previous release.
NFR-6 Recoverability: a restore from the latest backup is possible on a new server ([RECOVERY.md](../RECOVERY.md)).
NFR-7 Performance: page timings are recorded per section; a section that often takes over 2 seconds is a bug. Seed Town holds its frame cap by adapting resolution.
NFR-8 Phones: every staff page works at phone width with touch-sized controls and a bottom tab bar.
NFR-9 Language and calendar: Amharic shows correctly everywhere names and content can be Amharic; dates in the Ethiopian calendar for people who choose it.
NFR-10 Low bandwidth: a Light mode for slow connections; kiosk check-in works offline.
NFR-11 Accessibility: colour is never the only signal; controls have labels; light, dark and high contrast.
NFR-12 Consistency: no emojis in the product (ADR-9); plain words in sentence case.

## 5. Interfaces

IR-1 Chapa: transactions, balances and webhooks per business, with the date window and paging Chapa supports.
IR-2 Noor: Noor's admin pages, read and written through the gate with one session per account.
IR-3 Telegram: Bot API for support bots and alerts; the Mini App inside Telegram.
IR-4 SMS: i-Conic for messages and delivery reports.
IR-5 Email: SMTP or a web API (Brevo, Resend) for sending; IMAP for mailboxes.
IR-6 AI providers: chosen in Admin; the assistant works without one in its written flows.
IR-7 GitHub and GitLab: repositories, pull requests, checks and merge events; CI and deploy events through `POST /api/dev/<dept>/events` with an API key.
IR-8 Myseed App: `POST /videos` and `GET /videos/ID` for publishing; the support SDK and API (`/api/support/v1`).
IR-9 Notion, Office and Power BI: documents to and from Notion; Office exports; Power BI and Excel feeds.
IR-10 Scheduler: `GET /api/cron/checks` with `Authorization: Bearer <CRON_SECRET>`.

## 6. Data

DR-1 Curriculum: grades, subjects, units and parts; items identified by code, as in the curriculum tracker.
DR-2 History: audit events are never edited or deleted; corrections refer to the event they correct.
DR-3 Files that belong to records are stored in the database so a backup holds them; media links point at the company's storage places and are checked weekly.
DR-4 Department documents are Markdown text up to 1,000,000 characters, with versions, reviewers and approvals; documents from the repository record their file and its last copied hash.
DR-5 Backups hold every table in `TABLES`; restoring checks each table's rows.
DR-6 Times are stored in UTC and shown in the workspace time zone.

## 7. Open requirements

Requirements accepted but not yet built are tracked in the [roadmap](../ROADMAP.md) and summarised in the [progress report](PROGRESS.md): native Android and iPhone builds, SMS as a support channel, connecting the Myseed App's support, a staging site, the remaining Amharic labels, and the open Seed Town items.
