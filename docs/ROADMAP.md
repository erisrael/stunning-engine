# Roadmap

How new work is added without disturbing what already runs:

- Schema changes are additive only (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`); nothing is renamed or dropped.
- New areas are separate modules with their own routes, server files and tables, switchable in Settings.
- Departments sit beside the existing roles (recording, editing, uploading, publication, manager, admin), which keep working unchanged.

## Phase 1: Admin data control (done)

- [x] Data manager (`/admin/data`): create, rename, fill, move, merge and delete grades, subjects, units, parts and items, in bulk with preview
- [x] Data health: broken imports, wrong placements, placeholder names, duplicates, subjects not offered, empty units, parts with no item; each with a fix and/or Move to trash
- [x] Import batches with Undo import
- [x] Trash with restore (row snapshots), purged after 30 days
- [x] Bulk Set status with a required reason saved in stage notes and the audit log
- [x] List view bulk bar: rename, fill field, set status, export selected, move to trash
- [x] Deleting an item also removes its part when nothing else uses it, so Overview stops listing it
- [x] Overview and Coverage: multi-select grade and subject filters; subjects follow the chosen grades
- [ ] Row selection and bulk actions in Sheet view

## Phase 2: Editorial workflow (done)

- [x] Assign work (`/assign`): Grade → Subject or Subject → Grade, select whole units or single parts, filter (not done, unassigned, by assignee), search and sort; assign to one or several people (evenly in part order, one unit per person, or balanced by current workload), set or clear the stage due date, remove assignees; one notice per person
- [x] Checklists (`/checklists`): templates per stage with required lines and lines the team lead must verify; create, edit, duplicate, switch off, delete, search, filter, sort, bulk actions, JSON import and export; start from the workspace's standard lines
- [x] Checklist per person when assigning (different people can get different checklists); copied onto the work, so later template edits do not change work in progress; changeable on the item page
- [x] Lead verification of checklist lines on the item page; required and verify lines must be met before the handoff; re-ticking a line clears its verification
- [x] Handovers (`/handovers`): send a batch to the next team (List view bulk bar or New handover); the receiver accepts what arrived or marks items missing with a note (sent back as rework to the sender and their lead); To check / Sent / All tabs, filters by status, stage, person and dates, search, sorting, CSV export, editable note, cancel before anything is checked
- [x] Stage progress imports notify the next team, both leads and the managers
- [x] New permissions (Admin, Roles and permissions): Handovers page, Assign work in bulk, Manage checklist templates, Verify checklist items; added to existing roles automatically
- [ ] Unread handover count on the sidebar

## Phase 3: Chat (done)

- [x] Automatic end-to-end keys for direct chats: protected by the login password (derived in the browser at sign-in, never stored); no passphrase to type. Created right after sign-in so others can write at once. Password changes re-protect the same keys. Old passphrase users move over once. After an administrator password reset, the person starts fresh keys
- [x] File storage: Supabase Storage when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set (direct browser upload, up to 25 MB, private bucket created automatically), otherwise the database (up to 8 MB, no setup)
- [x] Files and images in chat; encrypted on the device in direct chats (name included)
- [x] Voice messages (up to 5 minutes), deleted 10 minutes after someone other than the sender first plays them, or after 7 days unplayed; cleaned up by the scheduled checks and while chats are open
- [x] Reactions (quick bar, up to 3 per person), polls (single or several answers, anonymous option, close and reopen), stickers, GIFs (GIPHY_API_KEY), edit, pin (group admins; either person in direct chats)
- [x] Question cards: the person asked answers right in the chat; the card shows the answer
- [x] Channels: only admins post; public (Find channels) or private; invite links for groups and channels; the creator manages admins, members and settings; new permission "Create channels"
- [x] Push notifications (Web Push) on browser and phone: every notification and every chat message (except muted chats); signing keys generated automatically; installable app (Add to Home Screen, required on iPhone)
- [x] Calls: one-click Jitsi video call, or share a Google Meet link (both open in a new tab)
- [x] In-app calls with our own ringing (Phase 5a)
- [ ] Connecting a Google account to create Meet links automatically

## Phase 4: Email (done)

- [x] Email account (SMTP) in Email, Settings, with presets for Gmail (app password), Google Workspace, Zoho and Microsoft 365; or SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM in the hosting settings. Passwords stored encrypted (key from APP_SECRET, or generated once). Test button
- [x] Your own domain (cPanel) preset with the four setup steps; Check login from the app's server (server name, port 465/587 reachable, sign-in) with errors that say what to do; Check inbox delivery (SPF, DKIM, DMARC, MX)
- [x] Sender addresses per employee: the mailbox is created at the provider, then registered here with its own sign-in or as an alias of the main account; one default address for everyone else
- [x] Compose (`/email`): recipients by person, role, team leads, chat group members and outside addresses; check recipients before sending; one email each (personal placeholders), hidden list (BCC) or together with CC and BCC; Markdown message (raw HTML removed); attachments up to 10 MB; preview; send a test to yourself
- [x] Templates: create, edit, delete, search; shared or private; placeholders {{first_name}}, {{name}}, {{email}}, {{role}}, {{sender_name}}, {{date}}
- [x] Sent log with the result per recipient; search, filters (status, sender, dates, only mine), sorting, CSV export; resend to failed recipients
- [x] Permissions: Send email (Admin and Managers by default; can be given to any role) and Manage email settings (Admin)
- [ ] Email copies of important notifications (per person, by type) and scheduled sending

## Phase 5: Departments and new modules (done)

- [x] New roles: Owner, Developer, Content (Studio), Marketing; each department sees only its own section by default (permissions adjustable per role in Admin)
- [x] Departments (Admin, Departments): people come from the department's roles; positions Head, Lead, Member. Heads and leads see and assign all the department's work; members see their own; Admin sees everything; owners read everything
- [x] Dev team (`/dev`) and Marketing (`/marketing`), one shared engine: projects (campaigns) with keys, status, lead, dates, budget and milestones; tasks with codes (WEB-12), type, status, priority, assignee, estimate and spent hours, progress, dates, labels and comments; Board (drag and drop), List (filters, search, sorting, bulk status/priority/assignee/project/due date, delete, export selected), Calendar; CSV import and export; assignment and comment notifications
- [x] Marketing KPIs: targets per campaign and dated KPI entries (reach, impressions, clicks, leads, sign-ups, spend) with progress against target
- [x] Studio (`/studio`): notes (Markdown), exams (from the question bank, points, time, pass mark, printable with answer key), flash card decks (paste, CSV import/export, study preview), placed on grade, subject, unit and part; review flow draft, in review, approved, published (editing published work starts a new version); question bank with single/several-answer, true/false, short and essay questions, difficulty, tags, approval, CSV import/export
- [x] Owners (`/owners`): products (videos, notes, exams, decks, questions), production health, published per week, work per stage, curriculum coverage per grade, people per department, Dev and Marketing progress per project, monthly marketing KPIs
- [x] Department reports: heads and leads (and production managers) write periodic reports with the period's numbers filled in; owners are notified and read them
- [x] Chat: owners are hidden from people without "Start direct chats with owners" (Admin, Managers and owners have it); owners can message anyone, and those people can reply
- [ ] Dev integrations (GitHub issues and pull requests), time tracking per task

## Phase 5a: Calls with our own ringing (done)

In-app voice and video calls with ringing on the other side and a clear end, built on what the app already has (database, push, polling). No paid service and no outside signalling service.

- [x] Voice and Video buttons in direct chats; groups keep the Jitsi and Meet links
- [x] Ringing module (`calls` and `call_signals` tables, `/api/calls`): ringing, accepted, declined, busy, missed, cancelled, ended, failed. The open app checks for incoming calls every 2.5 seconds; a closed app or phone gets a push notification with Answer and Decline that stays until answered or replaced by "Missed call"
- [x] Incoming screen with the caller's name, ringtone and vibration, Accept and Decline; the caller hears ringback and sees Ringing, then Busy, Declined or No answer (45 seconds, saved as missed and notified)
- [x] Knowing it ended: hanging up ends it for both within a second; a closed tab hangs up as it closes; a lost connection ends it after 15 seconds without a heartbeat (the length counts only until the last heartbeat)
- [x] Call card in the chat (Voice call 12:34, Missed voice call, Declined, No answer) with Call back
- [x] During a call: mute, camera on/off, switch camera (phones), screen share (computers, video calls), timer, connection quality, minimise to a corner while using the app
- [x] Media directly between the two devices (WebRTC), encrypted end to end; free public STUN, and Cloudflare's TURN relay (free for 1,000 GB a month) for networks that block direct connections, set in Settings, Calls with Test relay, or CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN
- [ ] Group calls of up to 4 people in the app
- [ ] Continuous ringing on a locked phone: comes with the native app (Phase 5b)

## Phase 5b: Native app shell

The same app inside a small native app for Android and iPhone, so calls ring like a phone call and notifications are reliable. The pages stay the web app; nothing is built twice.

- **Shell**: Capacitor, loading the live site, so every web update reaches the app without a store release; offline screen when there is no network
- **Android first**:
  - Firebase Cloud Messaging (free) for high-priority call pushes that wake the phone
  - Full-screen incoming call over the lock screen with continuous ringtone, Accept and Decline, using Android's self-managed calls (ConnectionService), so it also works with Bluetooth headsets and pauses for real phone calls
  - Distribution: install file (APK) shared with staff at no cost, or Google Play (one-time USD 25)
- **iPhone**:
  - Apple's VoIP push (PushKit) and the system call screen (CallKit), which Apple requires for call ringing
  - Needs an Apple Developer account (USD 99 a year); staff install through TestFlight or the App Store
- **Also in the shell**: app badge with unread count, camera and microphone permissions asked once, sign-in kept securely, deep links from emails and notifications into the right page
- **Desktop**: stays the installable web app (Add to Home Screen / Install); a desktop shell only if needed later
- **Order**: 5a works in the browser first; 5b then adds native ringing on top of the same `calls` table

## Phase 5c: Departments as complete as the workflow

Goal: Dev, Marketing and Studio work as fully as the production workflow does, with a home dashboard, the same family of views (Overview, List, Sheet, Board, Calendar, Team, Reports), checklists, handoffs and saved views. And almost nothing should be fixed in code: each department is set up from Admin.

### Where things stand

| | Production workflow | Dev and Marketing | Studio |
|---|---|---|---|
| Home dashboard | Per role, cards and panels the person can choose | None (opens on the board) | None (opens on the content tabs) |
| Overview | Tree of grades, units and parts with progress, filters | Projects tab (flat) | None |
| List | Filters, sorting, bulk edit, export, saved views | Filters, sorting, bulk edit, export | Per type lists |
| Sheet (inline grid) | Yes | No | No |
| Board | Stages as columns | Statuses as columns, drag and drop | No |
| Calendar | Sessions and releases | Due dates | No |
| Team and workload | Capacity, effort, corrections | No | No |
| Reports | PDF and Excel | Department reports (owners) | Department reports |
| Checklists, handoffs, approvals | Yes | No | Review flow only |
| Configuration | Settings: stages, checklists, lists, calendar | Fixed in code (statuses, types, KPIs in `src/lib/work.ts`) | Fixed in code |

### 1. Configuration first (Admin, Departments, Configure)

One configuration per department, stored as data and versioned, so changes never need a deploy. Every list below can be added to, renamed, reordered, coloured and switched off. Nothing is deleted while tasks still use it.

- **Names**: what the department calls a project (Project, Campaign, Course), a task (Task, Ticket, Piece) and a milestone (Milestone, Sprint, Phase).
- **Statuses**: the workflow columns. Each one has:
  - Category: open, active, in review, done or cancelled. Dashboards and reports count by category, so renamed statuses keep working.
  - Colour and an optional limit on the number of tasks in it at once (shown on the board).
  - Optional: who may move tasks out of it (for example only leads close "In review").
  - Optional: allowed next statuses.
- **Task types**: icon and colour, the extra fields the type shows, a default checklist, and a default assignee or reviewer. Examples: Bug, Feature, Social post, Design.
- **Custom fields**: text, long text, number, money, date, single choice, multiple choice, person, link, checkbox, rating. Each field sets:
  - Whether it is required, and in which status it becomes required.
  - Whether it shows on board cards, in the list or on the dashboard.
  - Who may edit it.
- **Priorities and labels**: editable lists.
- **Project template**: default milestones, fields, checklist and starting tasks for a new project or campaign.
- **KPIs**: the department's numbers, each with a unit, a target per project and per period, and whether higher is better.
  - Marketing's six KPIs become editable.
  - Dev can track things like releases, bugs closed and uptime.
- **Positions and rights**: what Head, Lead and Member may each do, as switches:
  - Create projects, assign others and delete.
  - See everyone's tasks, edit fields, close tasks and approve.

  More positions can be added (for example Reviewer).
- **Notifications**: which events notify whom. Events are assigned, status changed, mentioned, due soon (how many days before), overdue, and review requested.
- **Optional features**, switched on per department:
  - Sprints or cycles
  - Time tracking
  - Subtasks and dependencies
  - Review step (a status that needs a second person)
  - Budget
  - KPIs
  - Requests from other departments
- **New departments from a template**: Dev, Marketing, Studio, Support, Sales or Blank. A department becomes a sidebar section with its own role, positions, dashboard and views, so HR, Finance and others can start here before their full modules (Phases 7 to 9).

### 2. Department home dashboard

Each department opens on its own dashboard, like the role dashboards in production.

- **Widget library**, all reading the department's configuration:
  - Number cards: open, in progress, in review, overdue, due this week, done this week, unassigned, blocked, my open tasks.
  - Charts:
    - Done per week (throughput)
    - Tasks by status, type, priority or person
    - Burndown and burnup per project or sprint
    - Cycle time (how long from start to done)
    - Workload per person (estimate hours against capacity)
    - KPI against target
    - Budget against spent
  - Lists: my tasks, overdue, waiting for my review, recently changed, upcoming milestones, projects at risk.
  - Calendar strip for the next two weeks, and the activity feed.
  - Studio extras: in review, approved and published per week; coverage by grade and subject; question bank by difficulty.
- **Layout**:
  - Widgets can be placed on a grid, resized (small, wide, tall), reordered and hidden.
  - The Head sets the department default, which can differ per position (members see "my work" first, leads see team health).
  - Each person can adjust their own copy and reset to the default.
- **Filters at the top**: project, person, type, label and period. They apply to every widget and can be saved.
- **Owners**: choose which department widgets appear on the Owners dashboard.

### 3. Views, matching the workflow

All views share the same filter bar and saved views (private or shared with the department), and remember the last one used.

- **Overview**: a tree of project, milestone and task with progress and totals rolled up. It can be expanded or collapsed, and filtered. It also feeds the presentation mode planned in Phase 6.
- **List**:
  - Choose, order and resize columns, including custom fields.
  - Group by status, person, project, type or a field, with totals per group.
  - Keeps the existing bulk edit and export.
- **Sheet**: a spreadsheet-style grid for planning, where you type straight into cells (title, person, dates, estimate, fields). You can paste rows from Excel, and undo.
- **Board**:
  - Swimlanes by person, project, priority or type.
  - Task limits per column.
  - Choose which fields cards show.
  - Collapse columns, and add tasks quickly inside a column.
- **Calendar**: month and week. Drag to change dates; projects and milestones appear too.
- **Timeline (Gantt)**: projects, milestones and tasks as bars, with dependencies, drag to reschedule, today line and critical path.
- **Team and workload**:
  - Per person: assigned estimate hours against weekly capacity, overdue tasks and time logged.
  - Leads move work between people from this view.
- **Reports**:
  - A weekly or monthly department report as PDF or Excel, using the dashboard's filters.
  - Fills in the department report for owners automatically.

### 4. Workflow features carried over

- **Checklists**: the existing checklist engine, per task type and per status. Lines can need a lead's check before the task moves on (as in production).
- **Handoffs and reviews**: moving a task into a review status asks for a reviewer. The reviewer approves or sends it back with a note, and the history is kept.
- **Requests between departments**:
  - Each department can have a request form, for example "Request a design from Marketing", "Report a bug to Dev" or "Ask Studio for an exam".
  - Requests land in an intake column for the lead to accept, assign or decline.
  - The person who asked is kept informed.
- **Task details**: subtasks, dependencies (blocked by), watchers, @mentions in comments, file attachments, activity history, recurring tasks and task templates.
- **Time**: a start and stop timer on a task, plus time entries feeding the workload view and later Payroll costing (Phase 8).
- **Automations**: simple when-then rules per department, for example:
  - When status becomes Done, set progress to 100% and notify the reporter.
  - When a bug is created, assign the on-duty developer.
  - When every subtask is done, move the parent to In review.
- **Dev only (optional)**: GitHub link, so issues and pull requests show on the task, and merging moves it on.

### 5. Studio on the same footing

Studio keeps its content types (notes, exams, flash cards, question bank) and gains the same dashboard, Board (by review status), List with saved views, Calendar, Team and assignment. Its review stages and checklists become configurable the same way: who writes, who reviews, and what must be checked before publishing.

### 6. Data model (additive only)

- `dept_config`: one row per department with its configuration as JSON and a version number. Every change is in the audit log, and the previous version can be restored.
- `departments`: departments made from templates. Dev, Marketing and Studio are seeded from today's code values, so nothing changes until someone edits them.
- `dept_tasks.fields` (JSON) for custom field values, `dept_tasks.parent_id` for subtasks, and `dept_task_links` for dependencies.
- `dept_dashboards`: widget layouts per department, per position and per person.
- `saved_views` (existing table), with the department view as its page.
- `dept_time_entries`, `dept_sprints`, `dept_automations`, `dept_requests` and `dept_task_watchers`.

### 7. Order of delivery

1. **Configuration foundation** (done): a Configure tab in Dev and Marketing (heads by default; Admin always), also linked from Admin, Departments. It covers:
   - Names and code prefix.
   - Statuses with category, colour, column limit, "on board" and "only with the right".
   - Task types and priorities (order sets sorting), and suggested labels.
   - Custom fields (11 kinds, required from a status category, per type, on cards, as list columns, leads-only) and project statuses.
   - KPIs with units, rights per position, form features and notifications.

   Changes are saved together as a version, with a history and restore. Keys in use can be switched off but not removed, and the configuration can be exported and imported as JSON. Tasks store their status category, so Owners and reports count correctly after renames. Board, List, Calendar, the task and project forms, CSV import and export, and the Owners dashboard all read the configuration.
2. **Department dashboard**: widget library, layouts, filters, and the Owners selection.
3. **Views**:
   - List columns and grouping, board swimlanes and limits, saved views.
   - Then the Sheet and the Overview tree.
4. **Timeline, Team and workload, Reports**, then time tracking.
5. **Checklists, reviews, requests between departments, subtasks and dependencies, automations, sprints.**
6. **Studio on the same footing.**
7. **New departments from templates.**

Each step ships on its own and keeps today's screens working until its replacement is ready.

## Phase 6: Overview visualizer, help and onboarding

- **Visualizer mode on Overview**: a full-screen presentation that runs by itself, cycling through grades and subjects with progress per stage, recent completions and what is next. Meant for a wall screen or a meeting. It has play/pause, speed and filters, follows the current Overview filters, and refreshes its data while running.
- **Help section under Profile** (`/profile/help`):
  - User training manual, one chapter per role (Recording, Editing, Uploading, Publication, Team lead, Manager, Admin, and later each department), with screenshots
  - Workflow guides: step-by-step walkthroughs of common tasks (start and submit work, accept a handoff, import progress, assign work, fix data in the Data manager, restore from Trash)
  - Searchable, with links from each page's header to the matching chapter
- **Tooltips**: short explanations on buttons, status chips, columns and filters across the app, written once in one place so wording stays consistent
- **Get started**: a first-login tour for new users with short animations showing their role's daily flow, a checklist of first steps, and a "Replay tour" option in Help. Progress is saved per user, so the tour shows only once unless replayed.

## Phase 7: HR (people operations)

What HR does in the app, as its own module (`/hr`) with HR Manager and HR Officer roles. Employees get self-service; team leads see their own team only.

- **Employee records**: personal and contact details, emergency contacts, job title, department, line manager, employment type (full time, part time, contract, intern), start date, probation end, contract end; ID and contract documents with expiry reminders. Sensitive fields (salary grade, ID numbers) visible to HR and Finance only
- **Org chart and reporting lines**, drawn from departments and managers
- **Recruitment**: job openings, applicant pipeline (applied, screening, interview, offer, hired, rejected), interview scheduling with scorecards, offer letters, and conversion of a hire into an employee and user account
- **Onboarding and offboarding** checklists (reusing the checklist engine): account and email creation, equipment issue, first-week training; on leaving, access removal, asset return and the final-settlement handoff to Finance
- **Leave management**: leave types (annual, sick, maternity and paternity, compassionate, unpaid), balances and accrual by policy, requests approved by the team lead then HR, team leave calendar, public holidays (Ethiopian calendar supported); approved leave feeds capacity and attendance
- **Performance**: goals, review cycles (self, lead, optional 360), ratings, one-to-one notes; production and dev metrics attached as evidence
- **Training and certifications**: courses, completion tracking, renewal reminders
- **Employee relations**: confidential disciplinary and grievance cases with restricted access
- **Equipment register**: cameras, microphones, laptops and who holds them, with condition and return dates
- **Self-service**: own profile, payslips, leave balance and requests, attendance record, documents
- **Reports**: headcount, joiners and leavers, turnover, leave usage, absenteeism and lateness (from Attendance), training completion

## Phase 8: Finance

A Finance module (`/finance`) with Finance Manager and Accountant roles, separation between preparing and approving, and every change in the audit log.

- **Payroll**: salary structures, allowances, deductions, configurable Ethiopian income tax brackets and pension (employee 7%, employer 11%), overtime and unpaid absence taken from Attendance, payroll runs (HR prepares, Finance checks, owner approves), payslips as PDF in self-service, bank transfer file export, period locking
- **Expenses and reimbursements**: claims with receipt upload, approval by the team lead then Finance, paid status
- **Budgets**: per department, dev project, marketing campaign and production line; actual against budget with alerts when nearing the limit
- **Purchasing**: purchase requests, approvals, purchase orders, vendor list, goods received, invoice matching
- **Payables and receivables**: bills, invoices, payments, recurring costs, bank and cash accounts, petty cash
- **Revenue**: income by product and channel, feeding the Owners dashboard
- **Reports**: profit and loss by department, cost per published video (hours from timers and attendance multiplied by cost rates), payroll summary, tax and pension reports; Excel export for the accountant or accounting software

## Phase 9: Attendance

Attendance (`/attendance`) with a kiosk tab for check-in by face, and a team-leader fallback when there is no hardware or it fails.

- **Kiosk tab** (`/attendance/kiosk`): a tablet or laptop at the entrance, signed in as a kiosk device (no personal account). Face recognition runs in the browser (on-device face embeddings with a liveness check, such as blink or head turn, against photos); no camera images are uploaded, only the match result. Check in and check out with the time, plus a PIN or QR badge as an alternative
- **Enrolment and consent**: HR enrols each person's face (several captures) only with their written consent; anyone can choose PIN instead; biometric templates are encrypted, never exported, and deleted when the person leaves or withdraws consent
- **Offline tolerance**: when the network is down, the kiosk keeps check-ins with their real times and sends them later, signed so they cannot be altered
- **Team-leader entry when hardware is missing or broken**: the lead marks each team member present, late, absent, half day or on leave, with a reason. Entries are labelled as manual and reviewed by HR, and every change is in the audit log. When a kiosk stops reporting, leads and HR are alerted and the day switches to manual entry
- **Mobile check-in** (optional) with a location check, for field work such as on-location recording
- **Shifts and rules**: working hours per team, grace period, late and early-leave rules, overtime, weekends and holidays; approved leave from HR shows automatically
- **Daily board**: present, late, absent and on leave per team, for leads and HR
- **Corrections**: people request a correction (forgot to check out), the lead approves, HR sees the trail
- **Reports**: monthly timesheets, lateness, absence and overtime per person and team; feeds Payroll in Finance; Excel export
- **Privacy**: biometric data is processed only for attendance, kept to the minimum, and covered by a written policy employees sign

