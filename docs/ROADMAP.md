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
- [x] Row selection and bulk actions in Sheet view (Phase 10)

## Phase 2: Editorial workflow (done)

- [x] Assign work (`/assign`): Grade → Subject or Subject → Grade, select whole units or single parts, filter (not done, unassigned, by assignee), search and sort; assign to one or several people (evenly in part order, one unit per person, or balanced by current workload), set or clear the stage due date, remove assignees; one notice per person
- [x] Checklists (`/checklists`): templates per stage with required lines and lines the team lead must verify; create, edit, duplicate, switch off, delete, search, filter, sort, bulk actions, JSON import and export; start from the workspace's standard lines
- [x] Checklist per person when assigning (different people can get different checklists); copied onto the work, so later template edits do not change work in progress; changeable on the item page
- [x] Lead verification of checklist lines on the item page; required and verify lines must be met before the handoff; re-ticking a line clears its verification
- [x] Handovers (`/handovers`): send a batch to the next team (List view bulk bar or New handover); the receiver accepts what arrived or marks items missing with a note (sent back as rework to the sender and their lead); To check / Sent / All tabs, filters by status, stage, person and dates, search, sorting, CSV export, editable note, cancel before anything is checked
- [x] Stage progress imports notify the next team, both leads and the managers
- [x] New permissions (Admin, Roles and permissions): Handovers page, Assign work in bulk, Manage checklist templates, Verify checklist items; added to existing roles automatically
- [x] Unread handover count on the sidebar (Phase 10)
- [x] Team flow on Home: team members work from a board of their own work (To do, In progress, Done not sent, With team lead), fill in checklists, links and lengths right on the card, mark work done and send it to the team lead one at a time or all at the end of the day
- [x] Only team leads hand over: the lead approves or returns (with a note) what the team sends, hands over what is ready to the next team's lead, accepts what arrives and assigns it, all from the lead desk on Home
- [x] Permissions: team members see only their own work (no Overview, lists, board, reports or item pages); team leads see the whole workflow from recording to published; publication keeps item pages and the calendar

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
- [x] Connecting a Google account to create Meet links automatically (Phase 10)

## Phase 4: Email (done)

- [x] Email account (SMTP) in Email, Settings, with presets for Gmail (app password), Google Workspace, Zoho and Microsoft 365; or SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM in the hosting settings. Passwords stored encrypted (key from APP_SECRET, or generated once). Test button
- [x] Your own domain (cPanel) preset with the four setup steps; Check login from the app's server (server name, port 465/587 reachable, sign-in) with errors that say what to do; Check inbox delivery (SPF, DKIM, DMARC, MX)
- [x] Sender addresses per employee: the mailbox is created at the provider, then registered here with its own sign-in or as an alias of the main account; one default address for everyone else
- [x] Compose (`/email`): recipients by person, role, team leads, chat group members and outside addresses; check recipients before sending; one email each (personal placeholders), hidden list (BCC) or together with CC and BCC; Markdown message (raw HTML removed); attachments up to 10 MB; preview; send a test to yourself
- [x] Templates: create, edit, delete, search; shared or private; placeholders {{first_name}}, {{name}}, {{email}}, {{role}}, {{sender_name}}, {{date}}
- [x] Sent log with the result per recipient; search, filters (status, sender, dates, only mine), sorting, CSV export; resend to failed recipients
- [x] Permissions: Send email (Admin and Managers by default; can be given to any role) and Manage email settings (Admin)
- [x] Email copies of important notifications (per person, by type) and scheduled sending (Phase 10)

## Phase 5: Departments and new modules (done)

- [x] New roles: Owner, Developer, Content (Studio), Marketing; each department sees only its own section by default (permissions adjustable per role in Admin)
- [x] Departments (Admin, Departments): people come from the department's roles; positions Head, Lead, Member. Heads and leads see and assign all the department's work; members see their own; Admin sees everything; owners read everything
- [x] Dev team (`/dev`) and Marketing (`/marketing`), one shared engine: projects (campaigns) with keys, status, lead, dates, budget and milestones; tasks with codes (WEB-12), type, status, priority, assignee, estimate and spent hours, progress, dates, labels and comments; Board (drag and drop), List (filters, search, sorting, bulk status/priority/assignee/project/due date, delete, export selected), Calendar; CSV import and export; assignment and comment notifications
- [x] Marketing KPIs: targets per campaign and dated KPI entries (reach, impressions, clicks, leads, sign-ups, spend) with progress against target
- [x] Studio (`/studio`): notes (Markdown), exams (from the question bank, points, time, pass mark, printable with answer key), flash card decks (paste, CSV import/export, study preview), placed on grade, subject, unit and part; review flow draft, in review, approved, published (editing published work starts a new version); question bank with single/several-answer, true/false, short and essay questions, difficulty, tags, approval, CSV import/export
- [x] Owners (`/owners`): products (videos, notes, exams, decks, questions), production health, published per week, work per stage, curriculum coverage per grade, people per department, Dev and Marketing progress per project, monthly marketing KPIs
- [x] Department reports: heads and leads (and production managers) write periodic reports with the period's numbers filled in; owners are notified and read them
- [x] Chat: owners are hidden from people without "Start direct chats with owners" (Admin, Managers and owners have it); owners can message anyone, and those people can reply
- [x] Dev integrations (GitHub issues and pull requests), time tracking per task (Phases 5c and 7b)

## Phase 5a: Calls with our own ringing (done)

In-app voice and video calls with ringing on the other side and a clear end, built on what the app already has (database, push, polling). No paid service and no outside signalling service.

- [x] Voice and Video buttons in direct chats; groups keep the Jitsi and Meet links
- [x] Ringing module (`calls` and `call_signals` tables, `/api/calls`): ringing, accepted, declined, busy, missed, cancelled, ended, failed. The open app checks for incoming calls every 2.5 seconds; a closed app or phone gets a push notification with Answer and Decline that stays until answered or replaced by "Missed call"
- [x] Incoming screen with the caller's name, ringtone and vibration, Accept and Decline; the caller hears ringback and sees Ringing, then Busy, Declined or No answer (45 seconds, saved as missed and notified)
- [x] Knowing it ended: hanging up ends it for both within a second; a closed tab hangs up as it closes; a lost connection ends it after 15 seconds without a heartbeat (the length counts only until the last heartbeat)
- [x] Call card in the chat (Voice call 12:34, Missed voice call, Declined, No answer) with Call back
- [x] During a call: mute, camera on/off, switch camera (phones), screen share (computers, video calls), timer, connection quality, minimise to a corner while using the app
- [x] Media directly between the two devices (WebRTC), encrypted end to end; free public STUN, and Cloudflare's TURN relay (free for 1,000 GB a month) for networks that block direct connections, set in Settings, Calls with Test relay, or CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN
- [x] Group calls of up to 4 people in the app (Phase 10)
- [ ] Continuous ringing on a locked phone: comes with the native app (Phase 5b)

## Phase 5b: Native app shell (built last, after every other phase)

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

## Phase 5c: Departments as complete as the workflow (done)

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
2. **Department dashboard** (done): Dev, Marketing and Studio open on their own Dashboard tab.
   - Widgets for Dev and Marketing:
     - Numbers: not finished, in progress, in review, overdue, due this week, done in the period, unassigned, my open work.
     - Charts: done and created per week, days to finish, work by status, type or priority, workload per person, KPIs against target, budget and spend, money fields.
     - Lists: my work, overdue, waiting for review, recently changed, upcoming milestones, projects at risk.
     - Also the next two weeks and the activity feed.
   - Widgets for Studio: drafts, review, approved and published; published per week; work by type and status; published by grade; question bank by difficulty; review queue, my work, recent and activity.
   - Customize: add, remove, reorder and resize widgets. Save for yourself, or (heads) as the default for heads, leads or members. Members start with their own work, heads and leads with team health.
   - Filters: period, project, type and person. People who can't see everyone's work get only their own numbers.
   - **Company overview** (`/company`, also the Owners page Overview) for owners, managers and Admin (new permission "Company overview"):
     - A switcher between Overall, Production, Dev, Studio and Marketing. Each department shows its own dashboard, read only.
     - Overall shows progress per department, finished work per week across the company, and money: budgets on live projects, spend recorded as a Spend or Cost KPI, and money fields.
     - Revenue, expenses and payroll have a slot that Finance (Phase 8) fills.
3. **Views** (done): Dev and Marketing gain Sheet and Overview tabs beside Board, List, Projects and Calendar.
   - **List**:
     - Choose and order columns, including custom fields, project, milestone, dates, estimates, labels and creator.
     - Group by status, assignee, project, type, priority, milestone, or a choice, person or checkbox field. Groups fold, and show counts and totals of hours and money.
   - **Board**:
     - Swimlanes by assignee, project, type, priority, milestone or a field. Dragging between lanes changes the assignee, project, type or priority.
     - Choose what cards show, and fold columns (remembered per browser).
     - Quick add: type a title in a column and press Enter.
   - **Sheet**:
     - Type straight into cells (title, type, status, priority, assignee, project, dates, hours, progress, labels, custom fields). Each cell saves on Enter.
     - Add rows at the bottom, and paste rows from Excel or Google Sheets in the visible column order (a header row is skipped).
     - Undo the last 20 changes.
   - **Overview**: a tree of project, milestone and task, with progress, done, overdue and estimated hours rolled up. Expand all or collapse all.
   - **Saved views**: the tab, filters, columns, grouping, swimlanes and card contents under a name. Views are private, or shared with the department by heads and leads.
4. **Timeline, Team and workload, Reports, time tracking** (done):
   - **Timeline:** a Gantt of projects, milestones and tasks. Drag a bar to move it, or drag its edge to change the due date. Dependency arrows are drawn, and the critical path is outlined.
   - **Team:** open estimated hours against weekly capacity (editable, 40 hours by default), due this week, overdue, logged this week and done. Leads move work between people here.
   - **Report:** a printable report (save as PDF) and an Excel workbook for any period. The owners' report facts for Dev, Marketing and created departments now include hours and project progress.
   - **Time:** a timer on a task (one per person, with a running chip in the header) and manual time entries. Spent hours follow the entries.
5. **Task depth** (done):
   - **Checklists:** per type, with lines a lead verifies. A task cannot be done with unticked or unverified lines.
   - **Review step:** a reviewer must be chosen before In review. Only the reviewer or a lead approves the task or sends it back with a note.
   - **Subtasks:** one level deep. The parent can't be done before them, and its progress follows them.
   - **Dependencies:** "blocked by", with loops refused and blocked work kept from starting.
   - **Task details:** watchers, @mentions in comments, file attachments (up to 8 MB) and the history of each task.
   - **Recurring tasks:** daily to quarterly. The next one is created when the current one is done.
   - **Task templates:** title, details, type, priority, estimate, checklist and subtasks.
   - **Automations:** when created, moved to a status, or all subtasks done, then assign, set priority or status or progress, or notify.
   - **Sprints:** one active at a time, with a "current sprint" filter.
   - **Requests between departments:** a Requests page for everyone. A head or lead accepts (and assigns) or declines with a reason, and the person who asked is told.
6. **Studio on the same footing** (done):
   - Work gets an assignee and a due date.
   - A Board follows the review flow (drag to submit, approve, publish or send back with a note). There is also a Calendar, a Team view and saved views.
   - Configure (Studio heads and Admin) sets a review checklist, copied on submission. It can be required before approving and publishing.
7. **New departments from templates** (done):
   - Admin creates a department in Admin, Departments: Support, Sales, Operations, HR, Finance or Blank. Each template brings its statuses, types, fields, KPIs, automations and request settings.
   - People are added with a position. The department lives at `/d/<key>` with every view, appears in the sidebar, the Company overview, owners' reports and requests, and can be archived and restored.

Each step ships on its own and keeps today's screens working until its replacement is ready.

## Phase 5d: Production teams in depth

Every production team runs the same loop: the lead assigns; team members start, fill in the card, mark done and send to the lead; the lead approves or returns with a note and hands approved work over to the next team's lead, who accepts it or marks it missing and assigns it. Only finished work moves on. Each team is configured on its own in Settings, Teams.

### Rules per team (done)

- [x] **Settings, Teams** (Admin and managers), one card per team, saved with the other settings and in the audit log:
  - **Work the lead can assign**: only parts the previous team finished and handed over (default for Editing, Uploading and Publication), or every planned part to plan ahead. Recording always sees every planned part.
  - **Team lead review**: members' work goes to the lead to approve (default); off, sending it makes it ready for handover and the lead is told.
  - **What the lead hands over**: only work the lead approved (default), or anything the team marked done.
  - **Work in progress per person**: most parts one person may have started and not marked done (0: no limit).
  - **Days to finish**: sets the team's due date when work arrives, if none is set (Editing 3, Uploading 2, Publication 2).
  - **How the team works**: the team's own steps, one per line, shown to the team on Home ("How Editing works").
- [x] Only finished work reaches the next team:
  - The New handover list and the lead desk offer only approved work (or done work, by the rule above); parts in progress, paused, blocked or not started never show.
  - Handing over refuses unfinished work with the reason, for leads, managers and Admin alike; imports and status corrections are unaffected.
  - The next team's Assign page lists only parts that arrived, and says how many are left out (still in progress, not started, or sent back as missing).
  - Parts marked missing go back to the sender's team and leave the receiving team's lists.
- [x] Recording members see parts assigned to them before anyone has started them (drafts) on their Home board; Start puts them into production.
- [x] The item page offers "Hand over" only on approved work.

### Recording

- **Lead**: adds parts (New item, curriculum import, spreadsheet import), assigns on Assign work (by grade or subject, whole units or single parts, one or several people, due date, extra checklist), reviews, hands over to Editing in batches.
- **Members**: Start (timer), camera codes or raw links with minutes, checklist (presenter and script, audio, framing and light, board legible, files backed up), Done, Send.
- **Hands over**: approved parts with at least one recording logged and the required checklist ticked.
- Next:
  - [x] Session planning: book a studio slot, presenter and camera per part, with a week view for the lead (Phase 10).
  - [x] Retake requests from Editing or Publication land as a new Recording task with the reason (redo; Phase 10 adds a notice to the team's leads).

### Editing

- **Lead**: accepts or marks missing what Recording handed over, assigns accepted parts (Home, To assign; or Assign work), reviews the master, returns with a note or approves, hands over to Uploading.
- **Editors**: Start, edited master, captions and thumbnail links (captions and thumbnail required by default, Settings, Workflow), final length, checklist (cuts against script, audio cleaned, graphics and spelling, captions synced, export preset), Done, Send.
- Next:
  - [x] Review comments pinned to a time in the master ("0:42: trim the silence") (Phase 10).
  - [x] Version compare: the lead sees what changed since the last return (Phase 10).

### Uploading

- **Lead**: accepts from Editing, assigns, approves, hands over to Publication.
- **Uploaders**: Start, the video ID or link per required destination (Settings, Destinations), processing state, playback and details checks, checklist (matches the approved master, metadata, processing finished, playback end to end, captions attached), Done, Send.
- Next:
  - [x] Upload straight from the app to YouTube, with the ID filled in automatically (Phase 10). The Myseed App upload needs the app's own upload API.

### Publication

- **Lead and reviewers**: receive the handover (Handovers: Received or Missing), Start review, checklist (educational accuracy, placement, thumbnail and title, release window), Review (approve, or request changes and send back to any earlier team), Schedule, Confirm live per destination. Published when every required destination is live.
- Next:
  - [x] Release calendar with drag to reschedule, and a weekly release plan per subject (Phase 10).

### Training material (done)

- [x] Workflow presentation: one loop, the four teams, statuses, each team's steps with screenshots, the handover rule, the team settings and the recorded tutorial.
- [x] Recorded tutorial (8:36, captioned): sign-in as each person, from adding parts to published, including a return with a note and a part that stays with Recording because it is still in progress.

## Phase 6: Overview visualizer, help and onboarding (done)

- [x] **Visualizer mode on Overview** (`/overview/present`, the Present button): a full-screen presentation that runs by itself. It cycles through the whole picture, each grade (or subject), recent completions and what is in process. It has play/pause, previous/next, speed, full screen, keyboard (arrows, Space, Esc), follows the Overview's filters, and refreshes every minute
- [x] **Help section under Profile** (`/profile/help`, also in the account menu):
  - Training manual, one chapter per role (team member, team lead, Publication, Overview, Manager, Admin, Owner, Departments, plus Getting around and Chat, calls and email), with screenshots; the person's own chapters come first
  - Workflow guides for common tasks (start and send work, approve and hand over, accept and assign, assign in bulk, import progress, fix data, restore from Trash, present the Overview)
  - Searchable; the question mark next to each page's title opens the matching chapter
- [x] **Tooltips**: status chips, Overview cells, action buttons and the Home board columns explain themselves on hover, all written once in `src/lib/help.ts`
- [x] **Get started**: a first-login tour per role with a short animation of how work moves, then a checklist of first steps. Saved per user (shown once per role), with "Replay tour" in Help
- [x] Chapters for each department created from templates (Phase 10), and more screenshots as screens settle

## Phase 7: HR (people operations) (done)

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

### Order of delivery

1. **People records** (done): HR Manager and HR Officer roles (`hr.access`, `hr.manage`, `hr.sensitive`, `hr.cases`); employee records linked to accounts, created in one go from existing accounts; salary grade, ID, tax and bank details in their own table, seen by `hr.sensitive` only and never written to the audit log; documents with expiry dates (ID documents need `hr.sensitive`); reminders to HR 30 days before documents and contracts end and 14 days before probation ends; org chart from line managers; equipment register with issue, take back and history; **My record** for everyone (own details, contact self-service, documents, equipment, people who report to them); line managers see their team read only
2. **Leave** (done): leave types with defaults from the Labour Proclamation 1156/2019 (annual 16 days plus 1 per 2 years of service, built up monthly; sick, maternity, paternity, compassionate, marriage, unpaid), editable by the HR Manager; balances (prorated from the start date, with HR adjustments such as days carried over); requests counted in working days without weekends and public holidays, half days, overlap and balance checks; approved by the line manager then HR (HR can decide first, and records agreed leave directly); cancelling; who-is-off calendar (own team, or everyone for HR); public holidays shared with Settings, with Ethiopian holidays for any year in one click (Fasika computed; the lunar Muslim holidays added by hand); approved leave writes to capacity
3. **Recruitment, onboarding and offboarding** (done): openings with a hiring manager; applicant pipeline (applied, screening, interview, offer, hired, not selected) with CVs; interviews that notify the interviewers, who open the CV and add scorecards from My record; hire into an employee on probation under the hiring manager, with an app account (ordinary roles only, unless the person hiring manages users) and onboarding started; onboarding and offboarding checklists ticked by HR, the line manager or the person, editable by the HR Manager; offboarding sets the last day, tells the line manager, can remove app access, and holds the final-settlement line for Finance
4. **Performance, training and cases** (done): goals shared by the person and their line manager; one-to-one notes; review cycles (self review, then the line manager) with production stage work, hours, department tasks, goals and leave attached as evidence; courses assigned to people, completion and renewal reminders; confidential cases for `hr.cases` only, kept out of the audit log's details
5. **Reports** (done): headcount by department, type and status; joiners and leavers by month; turnover; leave taken by type; training completion; hiring; CSV download. Absenteeism and lateness come with Attendance (Phase 9)

## Phase 7b: Workspace polish, security and integrations (done)

- [x] Sidebar: My space at the top; the four work views as one Work views entry; department sub-links; a tooltip on every entry and top-bar control; each person hides entries with the gear; Admin sets each role's sidebar (Admin, Sidebar)
- [x] Presentation: customizable slides, analyzer (bottleneck, pace and forecast, leaders, load), comparisons (period, groups, stage funnel), today/week/month/all-time, detailed mode, voice mode, exports to PowerPoint, video, image, PDF, CSV, JSON and narration script
- [x] Animated "Show me how" explainers on key pages, in Help chapters and in the longer get-started tours; Help shows each person only their own chapters (managers and Admin can show every role's)
- [x] Dev team: GitHub repositories (CI, pull requests linked to task codes, issues, milestones, releases, commits). Finance departments: exports to Sage 50 (Peachtree), QuickBooks and Xero with account mapping. Power BI, Excel and Google Sheets feeds with API keys (Admin, Integrations)
- [x] Admin, View as: see the app as any role, department, team lead or person, read only, with chat, email and private documents closed
- [x] Sessions and devices: IP, device, last active; end sessions, sign a person out everywhere, block and unblock devices; everyone sees and ends their own on Profile
- [x] Team page: team leads see their own team's members; members see only themselves
- [x] Profiles: photo, cover, headline, skills with levels, education and study status, experience, languages, links, files (CV, certificates) seen by the person, their lead or manager, HR and Admin, and sections each person can hide; People directory searchable by skill
- [x] Forgotten passwords: reset with Google (Gmail) or an emailed link (Admin, Sign-in)

## Phase 7c: Chat upgrades, feedback and safety (done)

- [x] Admin, Chat: file size, total and per-person storage, voice auto-delete on or off and its timing, file and message retention, GIFs; storage use; delete any chat
- [x] Team leads and department heads create and manage groups
- [x] Online status and last seen; sent and seen ticks; Seen by with the time each person saw a message
- [x] Search (words, names, #tags, @mentions, dates; direct chats on the device), Go to a date, shared media (photos and videos, files, voice, links)
- [x] @mention picker, clickable #tags, forwarding to many people, groups and channels at once
- [x] Contact cards when tapping a person, with contact details each person shares by choice (Profile, Contact details)
- [x] Feedback to Admin from any page; safety policy; reports on messages, people and chats, handled in Admin, Safety reports

## Phase 8: Finance (done)

A Finance module (`/finance`) with Finance Manager and Accountant roles, separation between preparing and approving, and every change in the audit log.

- [x] **Accounts and journal**: bank, cash, petty cash and mobile money accounts with balances; money in, payments and transfers; a Sage-style chart of accounts; closed months that cannot change
- [x] **Payroll**: salary structures (basic, taxable and tax-free allowances, deductions), configurable Ethiopian income tax brackets (Proclamation 979/2016 by default) and pension (7% and 11%), overtime and unpaid days entered per run or filled from Attendance; HR or Finance prepares, the Finance Manager checks, the owner approves, Finance pays; payslips (print or PDF) in Claims and pay; bank transfer file; tax and pension report; closing the month
- [x] **Expense claims**: with receipts, line manager (or team lead) then Finance, paid status
- [x] **Budgets**: per department, project, campaign and production line; spend including payroll; alerts at the chosen level and at 100% to Finance and department heads
- [x] **Purchasing**: requests, approval (above the limit, the Finance Manager), ordering from a vendor, delivery, billing with a flag when the bill differs from the approved amount
- [x] **Payables and receivables**: bills with attachments and monthly repeats; invoices with VAT and numbering; vendors and customers
- [x] **Revenue**: money in by product and channel, feeding the Company overview's Money section
- [x] **Reports**: revenue, spending and net; profit and loss by department and ledger account; cost per published video (spending and payroll per video, and logged hours at the average hourly cost); payroll and tax and pension reports; Excel downloads
- [x] Finance view in the Company overview switcher with spend against each department's budget (Phase 10)

## Phase 9: Attendance

Attendance (`/attendance`, in everyone's My space) with a kiosk at the entrance, check-in from the app or from a phone at the site, and a team-lead fallback when there is no kiosk or it fails.

### Step 1: Attendance without biometrics (done)

- [x] **Days are computed, not typed**: check-ins and check-outs are events; each day's result (present, late, half day, absent, on leave, holiday, day off, not in yet) comes from the person's shift, approved leave (half days included, unpaid leave counted), public holidays and any hand-made record. Late minutes, leaving early, overtime, hours worked (break taken off on long days) and missing check-outs follow from it. Nothing counts before "Count attendance from" (or the first check-in), so nobody is absent for days before attendance started
- [x] **Shifts and rules** (Attendance, Setup; permission "Attendance for everyone", given to HR and Admin): shifts with start, end, grace, break and working days; a default shift and a shift per person; leaving early, overtime threshold, half-day hours; work on days off and holidays is all overtime
- [x] **Check-in methods**, switched on per workspace: from the app anywhere; from a phone only within the site's radius (location read once, at the press of the button); at a kiosk
- [x] **Kiosk** (`/kiosk`): HR adds a kiosk and gets a one-time setup link (and QR code) valid for a day; the tablet or laptop then holds the kiosk's own token, never a person's sign-in. People scan their badge (USB or Bluetooth scanner, or the camera where the browser reads QR codes) or type their number and PIN on a keypad. Welcome or goodbye with the time and lateness. A second scan within a minute is ignored. Five wrong PINs lock that number on that kiosk for ten minutes
- [x] **Offline tolerance**: without a network the kiosk keeps check-ins on the device with their real time, signed with the kiosk's key so they cannot be altered, shows how many are waiting, and sends them when the network is back (oldest first, each recorded once, up to 72 hours late by default)
- [x] **Badges and PINs**: printable badges with a QR code each (new badges retire the old ones); HR sets a starting PIN shown once; everyone sets their own PIN on their Attendance page
- [x] **Team-lead entry when the kiosk is missing or broken**: the daily board for the lead's team (people who report to them, and members of the production teams they lead) with present, late, not in yet, absent, on leave and half day; tick people and record present, late, half day, absent or on leave with optional times and a required reason. Labelled hand-made, the person is told, HR reviews it (Review tab), every change is in the audit log
- [x] **Kiosk alert**: a kiosk silent for 30 minutes during working hours tells HR and the leads to record days by hand, once per silence; the board shows a banner
- [x] **Corrections**: people ask to correct a day (forgot to check out); the line manager approves (HR when there is none, or anytime); approving replaces that day's time in or out, and the old times stay, voided, for the trail
- [x] **Timesheets**: per month, per person: days present, late (and minutes), absent, half days, leave, hours, overtime, missing check-outs; Excel with a summary and every day. HR sees everyone, leads their team
- [x] **Payroll**: Finance, Payroll, "Fill from Attendance" sets each payslip's overtime hours and unpaid days (absent without leave, half of each half day, unpaid leave) in a draft run; still changeable by hand
- [x] **Privacy**: a written attendance and privacy policy, editable by HR, shown to everyone on their Attendance page

### Step 2: Face check-in at the kiosk (done)

Guidelines for the organisation (law, consent, enrolment, kiosk placement, trial, risks, retention, incidents): [FACE-CHECKIN.md](FACE-CHECKIN.md).

- [x] Face reading in the kiosk's browser with models served by the app itself; a blink is required (liveness); only a face code (128 numbers) is sent, never a picture, and matched on the server, so enrolled codes never reach the kiosk
- [x] Enrolment by HR with the person present: the consent text (versioned) and a tick that the form was signed, then five guided captures; captures of different people are refused; switched on per workspace with a match strictness
- [x] Face codes sealed with the workspace key, kept out of backups, exports and the audit log; deleted when the person withdraws (their Attendance page), when HR deletes them, or automatically when they leave
- [x] Kiosk "Check in with my face", with prompts (one face, closer, middle, blink), falling back to badge or PIN when not recognised or offline; recorded as "Kiosk, face"

### Later

- [x] Absence and lateness in HR reports and performance reviews (Phase 10)
- [x] Shift rotas (different shifts on different weeks) and night shifts across midnight (Phase 10)

## Phase 10: Completing the open items

Everything still open across the earlier phases, in three batches, then face check-in, then the native app shell (Phase 5b) last.

### Batch A: production workflow (done)

- [x] Sidebar badges: handover batches waiting for you (sent to you or your team) and attendance corrections waiting for your decision
- [x] Redo and retake requests also notify the team leads of the stage that has to redo the work
- [x] Review notes pinned to a time in the master (m:ss): the lead adds them on the card, the person doing the work ticks them off, open notes start the return message, and the team member is told
- [x] "Changed since you returned it": the lead sees what was done after a return (links, checklist, lengths, notes) from the history
- [x] Studio sessions (`/sessions`): the Recording lead (or a manager) books a studio, start, length, presenter and camera operator for several parts at once; studio and operator clashes are refused; unassigned parts can go to the operator; the operator is told; sessions move by dragging to another day or with Move, and are marked recorded or cancelled; the session shows on the recorder's card; studios are listed in Settings, Lists
- [x] Calendar: scheduled releases drag to another day (Publication and managers); Release plan view with planned and live releases per subject for the next eight weeks
- [x] Sheet view: tick rows (or all) for the same bulk actions as the List view

### Batch B: insights (done)

- [x] Finance view in the Company overview (owners and Finance only): revenue, spending, payroll and net for the year; each department's spend and payroll against its budget, with the alert level, over-budget in red and a marker for an even pace through the year; month by month; other budgets
- [x] Absence and lateness in the HR report (per month and per department, with an absence rate; in the CSV) and in performance review evidence (days absent, late arrivals and minutes in the period)
- [x] Night shifts that end the next morning: a check-out after midnight closes the night that started the day before, hours and overtime count across midnight, corrections and hand-made times understand it
- [x] Rotas: one shift per week for up to four weeks, repeating from a chosen week; the board, timesheets and payroll use the shift of each day

### Batch C: communication and integrations (done)

- [x] Email copies of notifications: each person chooses, per type, which notices also come by email (Notifications, Preferences). They go through an outbox in the background, tried three times, using the workspace's email account
- [x] Send later in Email: pick a date and time in the send dialog; scheduled messages are listed with their state and can be cancelled; they go out with the scheduled checks (within about ten minutes)
- [x] Group calls in the app for up to four people in a chat group (voice or video): a call page in its own tab, a direct connection between each pair of browsers (encrypted, no media through the server), mute, camera, leave; a Join card in the chat and a notice to the group; a fifth person is told the call is full; closing the tab leaves the call
- [x] Google account per person (Profile, Google account), using the workspace's Google OAuth client: "Start a Google Meet" in a group chat creates the meeting and posts the link; the Uploading card uploads the master straight from the computer to YouTube (unlisted) and fills in the video ID
- [x] Help: a chapter for every department written from its own setup (statuses, types, required fields, checklists, review, requests, KPIs), plus Attendance and Studio sessions chapters

**Google setup (Admin, once).** In the Google Cloud project that holds the sign-in client (Admin, Sign-in): enable the Google Calendar API and the YouTube Data API v3; add the scopes `calendar.events` and `youtube.upload` to the OAuth consent screen; add the redirect URI `https://<your site>/api/google/callback` to the OAuth client. Until the consent screen is published, only test users added there can connect. These Google steps follow Google's documented APIs and could not be run here without a real Google account; try one Meet link and one short YouTube upload after setting it up.

### Then

- [x] Face check-in at the kiosk (Phase 9, step 2), with written guidelines (docs/FACE-CHECKIN.md)
- [ ] Order from here:
  1. Phase 15: Foundations (sign-in, scheduled jobs, backups, tests, monitoring): done, except passkeys, slow-page timing and setting up the staging site
  2. Phase 10b: attendance by printed QR and office network: done, except SMS
  3. Phase 11: navigation by role, Profile tabs: done
  4. Phase 12: department workflows; 12b Dev studio; 12c presentation studio
  5. Phase 16: Myseed's own needs (presenter releases and fees, file locations, Myseed App upload, Amharic and the Ethiopian calendar, data protection)
  6. Phase 17: KRAs, KPIs and OKRs
  7. Phase 13: assistant
  8. Phase 18: worth having
  9. Phase 14: Mail
- [ ] Native app shell (Phase 5b), last

## Phase 10b: Attendance by printed QR and office network (done, except SMS)

For now there is no kiosk tablet: a QR code is printed and put up at the entrance. People scan it with their phone to check in, take breaks and lunch, and check out. Being on the office Wi-Fi proves they are on site. The kiosk (Phase 9) stays for later; everything below works alongside it.

### 10b.1 Who sets up what

- [x] **Admin sets up how attendance is taken** (new permission "Attendance capture setup", Admin only): which methods are on (printed QR, office network, kiosk, face, phone location, app anywhere), the sites and their networks, the QR posters, kiosks, devices, PIN rules, offline rules.
- [x] **HR manages the attendance itself** ("Attendance for everyone", as today): shifts and rotas, grace, overtime, break and lunch rules, reviewing hand-made days and flagged check-ins, corrections, timesheets, badges and PINs for people, reports.
- [x] Attendance, Setup splits into **Capture** (Admin) and **Rules** (HR); each sees only their part.

### 10b.2 The printed QR

- [x] Admin makes a **QR poster** per site (or per door): a printable A4 page with the QR code, the site name, a short address to type (for phones that cannot scan, for example `myseed.app/in`), and three lines of instructions.
- [x] The QR opens the check-in page in the app on the person's phone, already signed in after the first time (the phone is remembered).
- [x] **One tap, what makes sense now**: the page shows the person's name, the time and only the buttons that fit their state:
  - not in yet: **Check in**;
  - in: **Start break**, **Start lunch**, **Check out**;
  - on a break or at lunch: **Back from break** / **Back from lunch**.
  Then a clear confirmation with the time and any lateness, and the page closes itself.
- [x] **The QR alone is not enough**, because a photo of the poster works anywhere. A scan counts only when at least one of these, chosen by Admin per site, also holds:
  - **Office network** (default): the phone is on the office Wi-Fi, recognised by the office's internet address (see 10b.3);
  - **Location**: the phone is within the site's radius (when the person allows location);
  - **This person's phone**: the device was registered to them (see 10b.5).
  A scan that fails the check is refused with the reason ("Connect to the office Wi-Fi and scan again").
- [x] **Changing the code**: Admin can make a new code for a poster at any time (old prints stop working), for example after a photo of it was shared; reprinting is one click.

### 10b.3 Checking by the office network

- [x] What a web app can really see: the **public internet address** the office network uses to reach the internet. A browser cannot read the Wi-Fi name, the router or the phone's hardware (MAC) address, so the check is by address.
- [x] Admin adds each site's addresses (single addresses or ranges); a **Use this network** button fills in the address Admin is on, when Admin is at the office.
- [x] Addresses that change (many home and office internet plans): Admin is told when check-ins start failing for everyone at a site, and can update the address from the alert; a name that follows the address (dynamic DNS) is also accepted.
- [x] The address is read correctly behind the hosting's proxy (the forwarded address, from the hosting only), so it cannot be faked by the phone.
- [x] Optional: **check in without scanning** when on the office network: the Attendance page in the app shows the same buttons, so the QR is only the quick way in.

### 10b.4 Breaks and lunch

- [x] New kinds of check-in: break start and end, lunch start and end.
- [x] HR sets per shift: the lunch window and length (for example 12:00 to 14:00, 60 minutes), short breaks allowed (for example two of 15 minutes), and whether breaks are paid.
- [x] Hours worked count the real breaks taken when recorded (instead of the shift's fixed break); breaks and lunch that run over are flagged; someone still on a break at the end of the day is flagged like a missing check-out.
- [x] The daily board shows who is on a break or at lunch now; timesheets show break and lunch time per day; payroll takes unpaid break overruns only if HR switches that on.

### 10b.5 People without a smartphone, or with a broken camera

No extra device is needed; in order of preference:

- [x] **Type the short address** instead of scanning: any phone with a browser opens `myseed.app/in` (printed on the poster) and gets the same buttons; the office network check still applies.
- [x] **Shared check-in on an office computer**: any computer already at the office (reception, a team lead's laptop) can open **Check-in for others** (allowed on the office network only). The person types their number and PIN; the computer is not signed in as them, and the check-in is recorded as theirs with "shared computer" as the way. This is the kiosk without buying a tablet.
- [x] **The team lead checks them in**: in the app the lead scans the person's badge QR with their own phone (or picks them from the team list) and records the time; it is labelled "by the team lead" and HR reviews it, like today's hand-made days.
- [ ] **Basic phones (no browser)** (not built; it needs an SMS gateway with a running cost), optional and later: check in by SMS ("IN 12 4826" to a number) through an SMS gateway; it has a running cost per message, so it is a separate choice.

### 10b.6 Stopping misuse

- [x] **Devices**: a phone is registered to one person the first time they check in from it (Admin chooses: anyone's first phone, or approved by HR). A phone used for two people within a short time is flagged, and the second check-in waits for HR.
- [x] **Time window**: QR and network check-ins are accepted only around shift times (for example from an hour before the start); outside it they are flagged.
- [x] **Flagged check-ins** go to HR's Review tab with the reason (another person's phone, outside the time window, unusual address); HR accepts or rejects, and the person is told.
- [x] Every check-in records how it was made (QR, office network, shared computer, team lead, kiosk, face), the device and the address, all visible to HR on the day's detail.

Built: Attendance has a **Capture** tab (Admin, new permission "Attendance capture setup") and **Rules** (HR). Pages: `/in` (the QR and the typed short address), `/in/shared` (an office computer), `/attendance/poster` (the printable poster). The office address is read from the hosting's proxy header, counted from the end (`TRUSTED_PROXY_HOPS`, default 1; `TRUST_CLOUDFLARE=1` behind Cloudflare). Without a proxy in front of the app (`next start` reached directly) no address is known, so the network check cannot pass: put Nginx or Caddy in front on the VPS.

### 10b.7 Order of delivery

1. Capture and Rules split, and the Admin permission.
2. Sites with office addresses; QR posters with codes; the one-tap check-in page with the network check.
3. Breaks and lunch, in the rules, the day's result, the board and timesheets.
4. Shared check-in on an office computer; the team lead's scan; device registration and flags.
5. Optional: SMS check-in.

## Phase 11: Navigation that follows the person's role (done)

Today a developer sees "Departments, Dev team" with sub-links, and every department page repeats a bar of ten tabs (Dashboard, Board, List, Sheet, Overview, Timeline, My report, Repositories, Projects, Calendar). My record, Leave and Claims and pay sit at the top of My space.

### 11.1 Departments as the person's own sidebar

- [x] For someone working in a department (Developer, Marketing, Content, or a member of a department made from a template), the department becomes their sidebar, the way Recording or Editing is for production staff. No "Departments" heading, no nesting.
- [x] Sections, each view at its own address (`/dev/board`, `/dev/list`...; the old `?tab=` links keep working):
  - **My work**: Home (the department dashboard) and My board (their own tasks as a board, see Phase 12).
  - **Work**: Board, List, Sheet.
  - **Plan**: Projects (with the count), Overview, Timeline, Calendar.
  - **Insights**: Report ("My report" for members), Team (leads).
  - **Tools**: Repositories (Dev), Accounting (Finance departments), Requests.
  - **Manage**: Configure (heads), Checklists and templates.
- [x] What a person sees follows their position: members get My work, Board, List, Calendar, My report and Requests; leads add Team, Overview, Timeline, Sheet and the lead desk; heads add Configure. Admin, Sidebar can still hide entries per role.
- [x] The tab bar on department pages goes. Each page has its title, its own filters and one compact "View" switch only where it helps (Board, List and Sheet of the same tasks).
- [x] People who oversee several departments (Admin, managers, owners, the Company overview) keep a "Departments" group with each department folded underneath.
- [x] Someone with roles in more than one department switches with the role switcher; the sidebar follows the active role.

### 11.2 My space, and the Profile with tabs

- [x] My space keeps only daily things: Home or My work, Attendance (daily check-in), Questions, and an **Approvals** entry for people who approve anything (leave, claims, attendance corrections, handovers waiting), with one count.
- [x] **Profile** (the avatar menu, and a Profile entry at the bottom of the sidebar) gets tabs:
  - Profile: photo, headline, skills, contact details.
  - My record: HR record and documents (today `/me`).
  - Leave: balances and requests (today `/leave`).
  - Pay and claims: payslips, claims, purchase requests (today `/pay`).
  - Attendance history and kiosk PIN (today's day stays on Attendance).
  - Account: password, sessions and devices, Google account, notifications, preferences.
  - Help.
- [x] `/me`, `/leave` and `/pay` move there; their old addresses send people to the right tab. Notifications and emails link to the new places.

Built: `src/server/nav.ts` picks the person's own department from the active role (Developer: Dev, Marketing, Content: Studio) or a position in a department made in Admin; production staff and people who oversee (Admin, managers, owners, Company overview) keep today's sidebar with each department's views folded. Views live at `/dev/board`, `/marketing/list`, `/d/<key>/timeline`; `?tab=` links are redirected with their filters. Studio keeps its own tabs (they are content types) and lists them in the sidebar for Studio people. Profile has tabs Profile, My record, Leave, Pay and claims, Attendance history and Account; `/me`, `/leave` and `/pay` redirect there. `/approvals` gathers leave, claims, attendance corrections and reviews, handovers and timer corrections.

## Phase 12: Department workflows as complete as production

Production teams work as a loop: the lead assigns, members start, fill in the card, mark done and send to the lead, the lead approves or returns, and only finished work is handed over. Departments today have statuses, a review step and requests, but not this loop. The same engine is built once and set up per department.

### 12.1 One flow engine for every department

- [ ] **Configure, Flow** (heads and Admin): the stages a task goes through, each mapped to a status category, and for each stage:
  - who works it (a position, a role, or the assignee),
  - whether the lead reviews before it moves on (approve, or return with a note),
  - what must be done first (checklist, required fields, links),
  - where it goes next and who receives it (another stage, another position such as QA, or another department through Requests),
  - a "days to finish" target and a work-in-progress limit per person,
  - the stage's own steps, shown on Home (like "How Editing works").
- [ ] **Member board** (Home for members): To do, In progress, Done not sent, With lead; start and pause with the timer, fill in the card (checklist, links, fields, attachments), Done, then Send one or all; returned work comes back with the lead's note.
- [ ] **Lead desk** (Home for leads): To approve (approve or return with notes, see what changed since a return), Ready for the next stage (hand over as a batch), Arriving (accept or send back as missing), To assign (with each person's load), and the flow at a glance.
- [ ] Only finished work moves on, as in production: unfinished or returned work never shows to the next stage.
- [ ] Templates bring a ready flow; everything stays editable and versioned like the rest of Configure.

### 12.2 Dev team (first)

- [ ] Stages: Backlog, To do, In progress, Code review (tech lead), QA (tester position), Ready to release, Released.
- [ ] The card: the branch and pull request (from the GitHub link), the tests and docs checklist, estimate and time spent, the acceptance criteria.
- [ ] Code review: the lead sees the pull request status and checks from GitHub, approves or returns with comments; a merged pull request can move the task on by itself.
- [ ] QA: the tester accepts what arrives, passes it or sends it back as a bug with steps to reproduce; passed work waits in Ready to release; a release groups tasks and marks them Released, with release notes.
- [ ] Bugs and requests from other departments land in the lead's intake to triage (priority, sprint, assignee).

### 12.3 Marketing, Studio and departments from templates

- [ ] **Marketing**: Brief (from a request or the lead), Draft (writer or designer), Review (lead; and the requester when asked), Approved, Scheduled (channel and time on the content calendar), Published (the link), Results (reach, clicks and the other KPIs logged against the campaign).
- [ ] **Studio**: Assigned (note, exam or deck on a grade, subject and part), Draft, Subject review (reviewer checklist), Approved, Published; a new version starts the loop again.
- [ ] **Templates**: Support (Intake, Triage, In progress, Waiting on the requester, Resolved), Sales (Lead, Qualified, Proposal, Won or Lost), Operations, HR and Finance requests, each with its flow, checklists and guide.
- [ ] Help: each department's chapter describes its own flow from the configuration (extends the Phase 10 chapters).

## Phase 12b: Dev studio (the software lifecycle in one place)

What exists today: a Timeline view (a Gantt chart with dependencies, drag to reschedule and the critical path) in every department; sprints as a simple switch (one active sprint, a "current sprint" filter); GitHub repositories with pull requests and checks; task templates. Phase 12 adds the Dev flow (code review, QA, release). This phase makes Dev a complete studio for planning, specifying, building, testing and releasing software, close to what teams know from Jira, Linear, GitHub and Confluence.

### 12b.1 Sprints, configurable for any department (Admin)

- [ ] **Admin, Departments, Sprints** for every department that works in sprints (Dev first; Marketing, Studio or any department can switch them on):
  - sprint length (1 to 4 weeks), start day, naming ("Sprint 14" or by date), working days;
  - capacity per person (hours or story points), and whether estimates are hours or points;
  - the rituals to show: planning, daily stand-up, review, retrospective, each with a day and time;
  - what happens to unfinished work at the end: moves to the next sprint, or back to the backlog.
- [ ] **Sprint planning**: the backlog beside the sprint, drag tasks in, see capacity fill per person, the sprint goal.
- [ ] **During the sprint**: burndown and burnup, scope added after the start marked, daily stand-up notes per person (yesterday, today, blockers).
- [ ] **Sprint review and retrospective**: what was finished, what moved on, velocity (average of the last three sprints), and the retrospective board (went well, to improve, actions), with the actions becoming tasks.

### 12b.2 Planning views (beyond today's Timeline)

- [ ] **Roadmap**: projects and epics on quarters, with their progress, the team on each, and the release they target.
- [ ] **Gantt** (the Timeline, extended): baselines (planned against actual), milestones as diamonds, the critical path, task groups folded by epic, resource load under the chart, export to PDF, Excel and MS Project XML.
- [ ] **Epics, stories, tasks and sub-tasks** (the usual hierarchy), story points, acceptance criteria per story, and "definition of done" per department.
- [ ] **Projects list with progress**: every project with status, health (on track, at risk, late, from dates and progress), percent done by points or hours, open bugs, the next milestone and release, the lead and the team; filters and a portfolio view for heads and owners.

### 12b.3 Specifications and documents (SRS and the rest)

- [ ] **Docs space per project**, with pages that link to tasks and back (a task shows the requirement it comes from, a requirement shows its tasks and their state):
  - **SRS** (software requirements specification), following the usual IEEE 830 / ISO 29148 outline: purpose and scope, users, functional requirements (each with an ID, priority by MoSCoW, acceptance criteria), non-functional requirements (performance, security, availability, usability), interfaces, data, constraints and assumptions;
  - **Product brief / PRD**, **technical design** (architecture, data model, interfaces, decisions), **architecture decision records**, **test plan**, **release notes** (filled from the tasks of the release), **runbook** and **postmortem**.
- [ ] **Requirements traceability**: each requirement through to its tasks, pull requests, tests and the release; a matrix view shows what is not covered.
- [ ] **Versions and approval**: each document has versions, a review by named reviewers and an approved state; changes after approval start a new version.
- [ ] **Export**: Word and PDF with the company's cover page.

### 12b.4 Myseed templates and specs

- [ ] Ready templates, written for Myseed's own products (the learning app, the content manager, the Studio tools), in the documents above: an SRS for a learning feature (grade, subject, unit and part; video playback; offline use; Amharic and other languages; low bandwidth), a technical design template with Myseed's stack, a test plan with the devices Myseed students use, a release checklist and release notes template, a postmortem template.
- [ ] Project templates that bring the epics, milestones, tasks and documents for common work: "New app feature", "Content import pipeline", "New grade or subject rollout", "Mobile release", "Bug bash".
- [ ] Admin and Dev heads can edit them and add their own.

### 12b.5 Development tools and integrations (industry standard)

- [ ] **Git hosting**: GitHub (exists) and GitLab; branches and pull requests linked by task code (WEB-12) in the branch name or title; checks and review state on the task; a merged pull request moves the task on.
- [ ] **CI/CD**: build and deploy status from GitHub Actions or GitLab CI on the task and the release; deployments per environment (development, staging, production) with time and version.
- [ ] **Releases**: versions (semantic, 1.4.0), release trains, the tasks in each, release notes generated, and the deploy that shipped it.
- [ ] **Quality**: test cases and test runs linked to requirements (pass, fail, blocked), bugs from failed tests with steps to reproduce; code coverage and quality numbers from the CI when available.
- [ ] **Incidents**: error reports from Sentry (or similar) open bugs automatically; incidents with severity, timeline and a postmortem.
- [ ] **Standard formats**: import from and export to Jira (CSV and JSON), Trello and Asana boards; webhooks out (task created, status changed, release shipped) and an API key for other tools; Slack or Telegram notices for a channel.
- [ ] **DORA measures**: deployment frequency, lead time for changes, change failure rate and time to restore, from the releases, deploys and incidents.

### 12b.6 Dev studio presentation

- [ ] A presentation mode for Dev (as the Overview has for production, see Phase 12c): the roadmap, each project's progress and health, the current sprint (burndown, goal, what is done), the latest release and what is next, quality and DORA measures, cycling by itself or presented by hand, exported to PowerPoint, PDF or video.

## Phase 12c: Presentation studio (all departments)

What exists today: the Overview's presentation mode for production, with customizable slides, an analyzer (bottleneck, pace and forecast, leaders, load), comparisons, periods, detailed and voice modes, and exports to PowerPoint, video, image, PDF, CSV and JSON.

- [ ] **One studio for every department**: production, Dev, Marketing, Studio, HR (headcount, attendance), Finance (budgets, spend) and the Company overview, each with its own slide types; owners can build a company deck from several departments.
- [ ] **Building a presentation**: a slide list to add, remove, reorder (drag) and duplicate; per slide the data (department, filters, period), the chart type, the title and a speaker note; saved presentations per person or shared with the team; a few ready decks (weekly team meeting, monthly owners' review, sprint review, campaign results).
- [ ] **Themes and layout**: light, dark and the company's colours and logo; title, chart, two charts side by side, big number, table, image, quote; the font size for big rooms.
- [ ] **Animations and transitions**: per slide (fade, slide, zoom), charts that build up (bars growing, lines drawing, numbers counting up), points that appear one by one, a highlight that moves to what matters (the bottleneck, the late project), a progress bar for the deck; all switchable off for calm viewing and respecting "reduce motion".
- [ ] **Explainers**: each chart can show a short plain sentence of what it says ("Editing is the slowest stage this week: 6 parts waiting, 2 days on average"), written from the numbers by fixed rules (not an AI), with a "why" note and the next action to take.
- [ ] **For productivity**: a meeting mode with the agenda, a timer per slide, and "actions" captured during the meeting that become tasks for the right people afterwards; a "since last time" slide that shows what changed since the previous meeting; goals and targets shown against the actual numbers.
- [ ] **Presenting**: presenter view with notes and the next slide on the presenter's screen, a laser pointer and drawing on the slide, a remote from a phone (next, previous) through the app, auto-play for a TV in the office that refreshes every minute.
- [ ] **Sharing**: a read-only link for a set time, exports (PowerPoint with editable charts, PDF, video with the narration), and a schedule that emails the deck as PDF every week.

## Phase 13: Assistant (a guide, not an AI)

A helper in the corner of every page that explains the app and walks people through tasks, built from fixed, written flows (no language model, nothing sent outside).

- [ ] **Talking to it**: a small chat panel with buttons to choose from, and a box to type in. Typed text is matched against keywords and synonyms written for each flow ("assign", "give videos to", "hand over"...). Anything it cannot match is offered the closest flows and the Help search.
- [ ] **Doing a task with it**: a flow asks one thing at a time with pickers taken from the app (people in the team, grade, subject and unit, parts not done), shows a summary, and on Confirm runs the same action as the page would, with the same permission checks. Example for an Editing lead: "Assign videos" → choose the editor → choose grade, subject and unit → tick parts (only parts that arrived from Recording) → due date → confirm → done, with a link to see them.
- [ ] **Show me**: instead of doing it, the assistant takes the person there and points: it dims the page, highlights the button or tab to press with a short note, waits for the click and moves to the next step (works on every page through marked elements).
- [ ] **First flows**, per role: assign work; approve and hand over; accept arrivals and assign; start, finish and send my work; ask for leave; claim an expense; check in or correct attendance; book a studio session; review a task (departments); "where is...?" (every page by name); "what does ... mean?" (statuses and terms from Help).
- [ ] **Monitoring** (Admin, Assistant): how often each flow is started and finished, where people give up, what people typed that matched nothing (to write new flows), by role and by week, and an export.
- [ ] **Setup** (Admin, Assistant): flows on or off per role, the wording and the keywords of each flow, and short answers to common questions.

## Phase 14: Mail, a company inbox in the app (last, before the app shell)

Today Email composes, sends and keeps a sent log through the company account; there is no inbox.

- [ ] **How it connects**: each person's company mailbox (cPanel or any host) over IMAP for reading and the existing account or relay for sending. Passwords are stored sealed; nobody else, Admin included, can read another person's mail. Google Workspace and Microsoft 365 mailboxes can connect through their own sign-in instead of a password.
- [ ] **Looks and works like Gmail**: Compose button; Inbox, Starred, Snoozed, Sent, Drafts, Spam, Trash and the mailbox's own folders as labels; a list with sender, subject, preview and date; conversations grouped; reading pane; reply, reply all and forward; attachments; star, mark read or unread, archive, delete, move; search; keyboard shortcuts (c, r, a, f, e, j and k); undo send for a few seconds; scheduled sending (exists); signatures; templates (exist).
- [ ] **Safety**: messages shown in a sandbox with scripts removed and outside pictures blocked until "Show images"; attachments downloaded on request; size limits.
- [ ] **Syncing**: new mail checked every minute while Mail is open and with the scheduled checks; headers are kept in the app for a fast list, bodies fetched when opened.
- [ ] **If the host blocks IMAP** (some hostings block mail ports): fall back to the mailbox's webmail link, and keep sending through the relay; the setup check (exists for SMTP) gets an IMAP check that says which case applies.

## Phase 15: Foundations (first, before Phase 10b)

Small pieces that protect everything else: sign-in, scheduled jobs, backups, tests and monitoring. Everything here is set up by Admin in Admin, Sign-in and Admin, System, with safe defaults.

### 15.1 Sign-in and accounts, configurable

- [x] **Password rules** (Admin): minimum length, letters and numbers, optional check against known leaked passwords (through the Have I Been Pwned range check, which never sends the password), optional change every N days, no reuse of the last N.
- [x] **Wrong attempts**: after N wrong passwords (default 5) the account waits (default 15 minutes, growing on repeats); many failures from one address slow that address down; a "too many attempts" message that does not say whether the account exists; the person and Admin are told of a lockout.
- [x] **Two-step sign-in**, methods switched on by Admin (all but passkeys):
  - **authenticator app** (Google Authenticator, Microsoft Authenticator, Authy: TOTP codes), set up by scanning a QR on Profile, Account;
  - **email code** as a fallback;
  - **passkeys** (fingerprint or face on the phone or laptop, WebAuthn): still to do;
  - **recovery codes** (10, shown once, each works once).
  Admin chooses per role: off, optional, or required (default required for Admin, HR and Finance roles); "remember this device for N days". Admin can reset a person's two-step sign-in, recorded in the audit log.
- [x] **Sign in with another account (OAuth 2 / OpenID Connect)**, each provider switched on and set up by Admin (client ID and secret, stored sealed):
  - Google (Gmail and Google Workspace), Microsoft (Microsoft 365 / Entra ID), and any OpenID Connect provider (Zoho, Keycloak and others);
  - allowed email domains per provider (for example only `@myseed.et`);
  - linking: a sign-in matches an existing account by verified email; a person can link or unlink providers on Profile, Account;
  - Admin can make a provider the only way in for some roles.
- [x] **Sign-up**, Admin chooses: off (Admin creates accounts, today), invitation only (a link valid for a few days, with the role chosen by whoever invites), or open to allowed domains with Admin approval and a starting role; new people are linked to their HR record when one exists.
- [x] **Sessions**: idle sign-out and maximum session length per role (shorter for Admin, HR, Finance); a notice by email and in the app on a sign-in from a new device (with its address; no country lookup); existing Sessions and devices page stays.
- [x] **Sign-in log**: every sign-in, failure, lockout, two-step change and provider link, with time, device and address, for Admin; each person sees their own on Profile, Account.
- [ ] **Passkeys** (WebAuthn) as another second step.

Done in step 1: Admin, Sign-in has tabs Rules, Google, Microsoft, SSO, Sign-up, Two-step by person and Sign-in log; Profile has Sign-in and security; new pages `/login/verify` and `/signup`. Tested with a mock OpenID Connect provider; Google and Microsoft still need a try with real accounts.

### 15.2 Scheduled jobs that always run

- [x] Three ways, any of them enough: a timer inside the server (every 10 minutes; enough on a VPS), `/api/cron/checks` with `CRON_SECRET` for an outside schedule (a free GitHub Actions workflow, `.github/workflows/schedule.yml`, or a VPS cron line), and page visits as a fallback. A lease stops two runs overlapping. Admin, System shows when they last ran and turns red after 30 minutes.
- [x] Each job recorded with its last run, result, time taken and error: work alerts, trash, chat files, HR and training reminders, chat retention, budgets, kiosks, face data, email outbox, backups, housekeeping. A job failing twice in a row alerts Admin; one failing job no longer stops the others.

### 15.3 Backups and recovery

- [x] Automatic daily backup (every table, including files kept in the database), gzipped and optionally encrypted with a passphrase (AES-256-GCM), to the server's disk, Google Drive (a "Myseed backups" folder, only files the app made) and optional S3-compatible storage (R2, B2, Wasabi, S3, MinIO); 7 daily, 4 weekly and 12 monthly kept (configurable).
- [x] Admin, System: backups kept in each place with downloads, Back up now, history, and a **test restore** (into a throwaway in-memory database, every table's rows compared) monthly by itself or on demand.
- [x] Command-line backup and restore read the new files (`BACKUP_PASSPHRASE` for encrypted ones).
- [ ] A **staging site**: the steps are written (docs/RECOVERY.md); setting up the second service is for whoever runs the hosting.
- [x] A written recovery plan: docs/RECOVERY.md (who does what, restoring, losing the server, account takeover, moving to a VPS). Names and phone numbers to fill in.

### 15.4 Tests in the project

- [x] The server and browser checks live in `tests/` (`npm test`, `npm run test:e2e`, `npm run test:all`), each on its own copy of a seeded throwaway database, never the one in `.env`.
- [x] GitHub Actions on every push (`.github/workflows/ci.yml`): type check, build, server tests, browser tests; screenshots kept when they fail. On Render, set Auto-Deploy to "After CI Checks Pass" so a failing run blocks deploying.

### 15.5 Knowing when something breaks (free, nothing outside)

- [x] Errors from the server (every page, action and API), people's browsers and scheduled jobs, kept in the app and grouped by kind, with how often, where and who; email addresses, numbers and keys masked. Mark fixed; it opens again if it comes back.
- [x] Alerts to Admin on new errors, failed backups and failing jobs: the bell always, email and Telegram (free bot) when set up; a test button.
- [x] Uptime: `/api/health` for any checker; the GitHub schedule checks it every 10 minutes and GitHub emails when it fails.
- [x] Admin, System, Health: database, scheduled jobs, backups, errors, email, file storage, Google, encryption key, outside schedule, server memory.
- [ ] Slow pages: timing per page (with Phase 18's speed work).

## Phase 16: Myseed's own needs

### 16.1 Presenter and teacher releases and fees

- [ ] **Presenters** as people in the app (teachers and guests, with or without an account): contact, subjects, a signed **release** (consent to be filmed and for the videos to be used, where, for how long), the scanned form, its expiry.
- [ ] A session or part cannot move past Recording without a valid release for its presenter (switchable); expiring releases warn HR and the Recording lead.
- [ ] **Fees**: a rate per session, per part or per hour; recorded sessions build a monthly statement per presenter; Finance pays it as a bill (with withholding tax set in Finance).
- [ ] Students or others appearing in videos: a release per person, linked to the parts.

### 16.2 Where the files live

- [ ] Admin sets the company storage locations (a shared Google Drive, a NAS path, a cloud bucket) and the folder pattern (grade, subject, unit, part); links outside the allowed places are flagged on the card.
- [ ] A weekly **link check**: raw, master, captions and thumbnail links that no longer open are listed for the team leads.
- [ ] When someone leaves, the leaver checklist lists the files still in their personal storage.

### 16.3 Publishing to the Myseed App

- [ ] The Uploading card uploads to the Myseed App through its API (as for YouTube), filling in the ID and checking playback; Publication confirms live through the same API.

### 16.4 Amharic and the Ethiopian calendar

- [ ] The interface in Amharic and English (and Afaan Oromo later), chosen per person; every label, message and email from one set of translations.
- [ ] Dates shown in the Ethiopian calendar as an option per person and per workspace (Settings already has the switch marked "planned"), in date pickers too; holidays and payroll months follow it where chosen.

### 16.5 Data protection for everyone's records

- [ ] A privacy notice for staff, shown at first sign-in and when it changes, with acceptance recorded.
- [ ] A retention schedule set by Admin and HR (for example attendance 5 years, chat 1 year, applicants 6 months) applied automatically, with what was removed logged.
- [ ] **Download my data** for each person (their record, leave, pay, attendance, profile and messages they sent).
- [ ] An access log of who opened HR and salary records, for HR managers and Admin.

## Phase 17: Performance management: KRAs, KPIs and OKRs

One system for "what each person and team is responsible for, how it is measured, and what we are trying to achieve this quarter", fed by the work already in the app, so most numbers fill themselves in. Everything is configurable by HR and Admin, with department heads setting their own within the rules.

### 17.1 The parts and how they fit

- **KRA (key result area)**: an area a role or position is responsible for, for example for an Editor: Quality, Delivery, Teamwork; for a Recording lead: Throughput, Planning, Team. Each KRA has a weight (they add up to 100%).
- **KPI (key performance indicator)**: a number that shows how a KRA is going, for example "Parts edited per week", "Returned by the lead (%)", "On time (%)". Each KPI belongs to a KRA, with its own weight inside it.
- **OKR (objectives and key results)**: what a company, department, team or person wants to achieve in a cycle (usually a quarter), with 2 to 5 measurable key results each. OKRs are about change and ambition; KRAs and KPIs are about the steady job.
- **Scorecard**: for a person, team or department and a period, every KPI's actual against its target, scored, rolled up by KRA and overall. Scorecards and OKR results feed performance reviews (Phase 7).

### 17.2 The KPI library (HR and Admin)

- [ ] Each KPI has: name and plain description, unit (count, %, hours, days, money, score), direction (higher or lower is better), how often it is measured (weekly, monthly, quarterly), how a period's value is formed (sum, average, latest, rate), and red, amber and green bands.
- [ ] **Where the number comes from**, chosen per KPI:
  - **from the app** (no typing), from a catalogue of measures the app already has:
    - production: parts finished per stage, on-time rate, cycle time per stage, returned by lead or marked missing (quality), redo requests received, review notes per part, published per week;
    - departments: tasks done, story points, cycle time, reopened tasks, bugs found after release, requests answered in time, campaign KPIs (reach, leads, spend), budget used against plan;
    - people: attendance (punctuality, absence rate, overtime), training completed, leave balance used;
    - finance: spend against budget, invoices paid on time;
  - **a formula** of other measures (for example published ÷ planned × 100);
  - **typed in** by the person, their lead or HR (with evidence attached), for things the app cannot see (for example customer satisfaction from a survey);
  - **imported** from a spreadsheet or Power BI feed.
- [ ] Fairness built in: values per working day (leave and holidays excluded); a quantity KPI paired with a quality KPI (the setup warns when a KRA has only quantity measures); minimum sample sizes before a percentage counts.

### 17.3 KRAs per role and position

- [ ] **KRA templates** per role and position (Editor, Editing lead, Developer, Tech lead, Marketing officer, HR officer, Accountant...), with their KPIs, weights and default targets; ready templates for Myseed's roles to start from.
- [ ] People get their template automatically from their role and position (and their department's version of it); a lead or HR can adjust one person's targets, with the reason, approved by HR; changes after the period starts need approval and are logged.
- [ ] Targets: one number, a range, or per person; set per period or rising over time (for example +5% each quarter).

### 17.4 Scorecards

- [ ] **Scoring**, configured by HR: how an actual becomes a score (straight percentage of target capped at 120%, bands to a 1-5 scale, or pass or fail), how KPIs roll up into KRAs and KRAs into an overall score, and the rating labels (for example Exceeds, Meets, Below).
- [ ] **My scorecard** (on Home and Profile): this period's KPIs with actual, target, trend and colour, clicking through to the work behind each number (which parts, which tasks, which days).
- [ ] **Team and department scorecards** for leads and heads; a company scorecard for owners; comparisons across periods and teams (never ranking individuals on a public screen unless HR allows it).
- [ ] Periods close on a date set by HR; after closing, numbers are frozen; late corrections go through HR with a reason.

### 17.5 OKRs

- [ ] **Cycles** set by Admin and HR: length (quarter by default), dates, a planning window before the start, a mid-cycle review and a scoring window at the end.
- [ ] **Levels and alignment**: company, department, team and personal objectives; each can support a higher one, shown as a tree; limits configurable (for example at most 5 objectives and 5 key results each).
- [ ] **Key results**: start value, target, current value and unit; updated by hand at check-ins or linked to a KPI or app measure so they move by themselves; milestone-type key results (done or not done) allowed.
- [ ] **Check-ins** weekly (configurable): progress, confidence (on track, at risk, off track) and a short note; reminders to owners; off-track key results flagged to the lead.
- [ ] **Scoring** at the end: 0.0 to 1.0 per key result (or percentage), the objective's average, a short reflection; the method is configurable.
- [ ] **Visibility** per objective: everyone, the department, or private to the person and their lead.
- [ ] Planned tasks and projects can be linked to a key result, so the work behind it is visible.

### 17.6 Using it day to day

- [ ] Home widgets: my KPIs this period, my key results to update, my team's off-track items.
- [ ] The presentation studio (Phase 12c) gets KPI, scorecard and OKR slides; monthly owners' review deck includes the company scorecard and OKR progress.
- [ ] Performance reviews (Phase 7) attach the period's scorecard and OKR results as evidence; HR can run a calibration view (spread of ratings per department).
- [ ] Notifications: check-in reminders, KPIs turning red, targets changed, periods closing.
- [ ] Permissions (configurable in the matrix): HR manages the library, templates, scoring and cycles; heads and leads set targets and OKRs for their teams within the rules; everyone sees their own; owners see the company.
- [ ] Exports: Excel per period, and the Power BI feed.

## Phase 18: Worth having

- [ ] **Announcements and policies**: company and department news on Home, with optional "I have read this" for policies; a list of who has not confirmed yet.
- [ ] **Phones and slow connections**: every page checked on a small phone, with a light mode that loads less (no animations, smaller images, fewer refreshes) for slow networks.
- [ ] **Usage view** for Admin: which pages and features are used, by role and team, and who has not signed in for a while, to plan training (no tracking of content).
- [ ] **Speed with years of data**: a test workspace filled with five years of data (tens of thousands of parts and tasks, a million attendance events), the slow pages fixed, and limits on lists with paging everywhere.
