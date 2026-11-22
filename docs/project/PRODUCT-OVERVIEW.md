# Product overview: Myseed Ops

Myseed Ops (the Myseed Content Manager, at **https://ops.myseed.com.et**) is the company's own operations system. It started as the tracker for producing Myseed's educational content (Recording, Editing, Uploading and Publication) and grew into one workspace for every department: production, Dev, Studio, Marketing, HR and attendance, Finance and Chapa payments, customer support with calls and Telegram, the Noor CMS (Legacy CMS), mail, chat, planning and performance, presentations, and Fun mode with Seed Town.

This overview is for anyone joining the Dev team or reviewing the product. The detailed, as-built requirements are in the [requirements specification](SRS.md); how it is built is in the [technical design](ARCHITECTURE.md).

## 1. The problem it solves

Myseed produces video lessons and notes for the Ethiopian curriculum (grade, subject, unit and part) and runs the services around them: the learning app, the Noor platform, payments, support. Before Myseed Ops this work lived in spreadsheets, chat groups and separate tools, with no single owner per part, no history and no view across teams. The system gives:

- one owner and one status per part of the curriculum per stage, with evidence (camera codes, files, live links) before work moves on;
- the same discipline for every department: boards, flows with lead review, requests between departments, reports;
- the company's operations in one place, with permissions enforced on the server and an append-only history.

## 2. Who uses it

| People | Roles in the app | What they do here |
| --- | --- | --- |
| Production teams | Recording, Editing, Uploading, Publication | Take parts, record and log camera codes, edit and deliver masters, upload, publish with verified links, hand over to the next team |
| Managers | Manager, Assistant Manager, Owner | Plan and assign, follow coverage and handovers, approve, read reports and the company overview |
| Departments | Developer, Content (Studio), Marketing, HR Manager, HR Officer, Finance Manager, Accountant, Customer Support, Sales and Outreach, Operations | Work in their department's board and flow; requests to other departments |
| Administrators | Admin | People, roles and permissions, settings, integrations, backups, the platform |
| Customers | No account (widget, Telegram, support app) | Ask for help, chat, call support, rate the help |
| Guests | No account (`/arcade`) | Play the guest arcade on a kiosk |

Each role has a permission matrix (View, Edit, Delete, Update per area) and grade and subject access, set in Admin.

## 3. What is in it

| Module | What it does | Main pages |
| --- | --- | --- |
| Production workflow | Curriculum structure; items per part; stages with start, pause, block, submit, accept, return, reopen; evidence gates; handovers; redo; coverage; Legacy catalog | Overview, Work views, Handovers, Curriculum, Coverage, Reports, My work |
| Departments | Configurable statuses, types, fields and flows per department; boards, lists, sheets, timeline, calendar, dashboards; requests between departments; data managers | Company overview, each department |
| Dev studio | Sprints, roadmap, Gantt with baselines, specs and docs with review and traceability, repositories, releases, incidents, test cases, DORA measures | `/dev/...` |
| Studio | Notes, exams, flash cards and questions with subject review and publishing | `/studio` |
| Document library | Folders, documents (Markdown, shown formatted), files, search, import and export, Notion | Specs and docs in each department |
| Team chat and calls | Groups and direct messages, mentions, replies, voice notes, files, voice and video calls | Chat |
| Mail | A company inbox: mailboxes, conversations, signatures, send later | Email |
| HR | Employee records, documents, org chart, leave, hiring, joiners and leavers, performance, training, cases | HR, People |
| Attendance | Kiosk check-in by QR, PIN, badge or face, office network and location checks, breaks, offline check-in, corrections, payroll input | Attendance, the kiosk |
| Finance | Accounts, bills, invoices, claims, purchasing, budgets, payroll, reports | Finance |
| Chapa | Payments from Chapa per business: sync, transactions, reconciliation, follow-up | Finance, Chapa |
| Customer support | Desk with queues and assignment, live chat, Telegram bots and Mini App, website widget, support app, browser calls with an IVR, call records, knowledge base, requests with approvals | Support, Customer Support Requests, Call records |
| Legacy CMS (Noor) | Noor's data mirrored and read safely (gated and paced), records with filters, reports, academic content manager, Noor admin pages through Noor's own forms | Legacy CMS |
| Assistant | Help in every page, role-aware, in English and Amharic; agent mode that does steps itself; routines | The assistant panel |
| Planning and performance | Strategic plans with indicators and evaluation; KPIs, KRAs, scorecards and OKRs | Strategy, Performance |
| Presentations | Slides as data for every department, templates, decks, meeting mode, PowerPoint export, a phone remote | Present |
| Fun mode | Points from work, games, music, a pet, focus mode, and Seed Town (a 3D town with games: Grand Prix, archery, football, Seed Strike and Seed Core) | Fun |
| Admin and platform | People, roles, permissions, settings, branding, integrations, API usage, database console, status and deploys, errors, backups | Admin, Settings |

## 4. Where it runs

| Surface | Who | Notes |
| --- | --- | --- |
| Web app | Staff | ops.myseed.com.et, installable as an app; phone layouts with a bottom tab bar |
| Kiosk | Staff at the entrance | `/kiosk` on a paired tablet or laptop, installable separately ([KIOSK-SETUP.md](../KIOSK-SETUP.md)) |
| Support widget, support app, Telegram Mini App and bot | Customers | [SUPPORT-SDK.md](../SUPPORT-SDK.md), [CALL-CENTER-SETUP.md](../CALL-CENTER-SETUP.md) |
| Android and iPhone shell | Staff | A thin shell around the site ([APP-SHELL.md](../APP-SHELL.md)); native builds still open |
| Windows app | Staff and kiosks | Electron launcher for Seed Town and the arcade kiosk; Seed Town Offline runs on its own |
| Guest arcade | Visitors | `/arcade`, locked to the arcade; Android and Windows kiosk builds |

## 5. Principles the product keeps

- **Server-enforced permissions** for every action, list, export and notification.
- **Additive changes only** to the database; new areas are separate modules that can be switched on in Settings.
- **An append-only history** (the audit trail) of who did what and when.
- **Free and self-run first**: no paid service unless the owner chooses one; errors and monitoring are kept in the app.
- **Plain words, no emojis**, monochrome icons, light and dark, phones to wide screens.
- **Ethiopian context**: Amharic (Ge'ez and Latin input), the Ethiopian calendar, Africa/Addis_Ababa time, low-end Android phones and unstable connections.

## 6. Where it is going

The [roadmap](../ROADMAP.md) lists every phase and what is still open; the [progress report](PROGRESS.md) summarises where things stand today.
