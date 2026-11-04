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

## Phase 5b: Native app shell (web part done; native builds to do on a machine with Android Studio and Xcode)

Done: installable with shortcuts (Check in, Chat, Email, Announcements), an offline page in English and Amharic instead of the browser's error, the unread count on the app's icon, the service worker for everyone, and `capacitor.config.json` ready for the native shell. The steps for the native Android and iPhone shells (Firebase and ConnectionService on Android, PushKit and CallKit on iPhone) are in [APP-SHELL.md](APP-SHELL.md).

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
  4. Phase 12: department workflows (done); 12b Dev studio; 12c presentation studio
  5. Phase 16: Myseed's own needs (presenter releases and fees, file locations, Myseed App upload, Amharic and the Ethiopian calendar, data protection)
  6. Phase 17: KRAs, KPIs and OKRs
  7. Phase 13: assistant (done)
  8. Phase 18: worth having
  9. Phase 14: Mail (core done)
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
- [x] **No check-in without proof of place**: the Attendance page button checks in only through the office network (Capture), the phone's location at the site, or "from the app anywhere" when Admin switches that on (now off by default; an older "on" is ignored). With QR posters alone, people scan the poster; a check-in without the poster's code needs the office-network method.
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

## Phase 12: Department workflows as complete as production (done)

Production teams work as a loop: the lead assigns, members start, fill in the card, mark done and send to the lead, the lead approves or returns, and only finished work is handed over. Departments today have statuses, a review step and requests, but not this loop. The same engine is built once and set up per department.

### 12.1 One flow engine for every department

- [x] **Configure, Flow** (heads and Admin): the stages a task goes through, each mapped to a status category, and for each stage:
  - who works it (a position, a role, or the assignee),
  - whether the lead reviews before it moves on (approve, or return with a note),
  - what must be done first (checklist, required fields, links),
  - where it goes next and who receives it (another stage, another position such as QA, or another department through Requests),
  - a "days to finish" target and a work-in-progress limit per person,
  - the stage's own steps, shown on Home (like "How Editing works").
- [x] **Member board** (Home for members): To do, In progress, Done not sent, With lead; start and pause with the timer, fill in the card (checklist, links, fields, attachments), Done, then Send one or all; returned work comes back with the lead's note.
- [x] **Lead desk** (Home for leads): To approve (approve or return with notes, see what changed since a return), Ready for the next stage (hand over as a batch), Arriving (accept or send back as missing), To assign (with each person's load), and the flow at a glance.
- [x] Only finished work moves on, as in production: unfinished or returned work never shows to the next stage.
- [x] Templates bring a ready flow; everything stays editable and versioned like the rest of Configure.

### 12.2 Dev team (first)

- [x] Stages: Backlog, To do, In progress, Code review (tech lead), QA (tester position), Ready to release, Released.
- [x] The card: the branch and pull request (from the GitHub link), the tests and docs checklist, estimate and time spent, the acceptance criteria.
- [x] Code review: the lead sees the pull request status and checks from GitHub, approves or returns with comments; a merged pull request can move the task on by itself.
- [x] QA: the tester accepts what arrives, passes it or sends it back as a bug with steps to reproduce; passed work waits in Ready to release; a release groups tasks and marks them Released, with release notes.
- [x] Bugs and requests from other departments land in the lead's intake to triage (priority, sprint, assignee).

### 12.3 Marketing, Studio and departments from templates

- [x] **Marketing** (the requester joining the review is not built yet; Scheduled uses the Channel and Publish on fields): Brief (from a request or the lead), Draft (writer or designer), Review (lead; and the requester when asked), Approved, Scheduled (channel and time on the content calendar), Published (the link), Results (reach, clicks and the other KPIs logged against the campaign).
- [x] **Studio**: Studio Home shows the writer's own work (to write, with the reviewer's note when returned; in review; approved) and a review desk (to review, to publish, nobody writing it). Subject reviewers (Studio, Configure) approve or return work in their subjects besides heads and leads; nobody reviews their own work; heads and leads publish. "New version" sends approved or published work back through the loop.: Assigned (note, exam or deck on a grade, subject and part), Draft, Subject review (reviewer checklist), Approved, Published; a new version starts the loop again.
- [x] **Templates**: Support (Intake, Triage, In progress, Waiting on the requester, Resolved), Sales (Lead, Qualified, Proposal, Won or Lost), Operations, HR and Finance requests, each with its flow, checklists and guide.
- [x] Help: each department's chapter describes its own flow from the configuration (extends the Phase 10 chapters).

Built: Configure has a **Flow** tab (`src/lib/dept-flow.ts`, `src/components/app/dept-flow-editor.tsx`). Each stage is one of the department's statuses with a kind: Intake (leads triage and plan), Work (the assignee; optional "not started" status such as To do, lead approval, accept on arrival, checklist before Done, a per-person limit), Check (heads and leads, or named people such as testers; return as a bug with steps to reproduce), Release, End. Each has a next stage, an optional hand-over to another department as a request, a target in days and its own steps. "Start from a ready flow" adds Dev, Marketing, Support, Sales, Operations, HR, Finance or Simple (statuses, fields and checklist lines it needs; nothing removed). New departments from templates start with their flow on, and so do Dev and Marketing (their ready flows are the defaults; in Dev, heads and leads do QA until testers are named). Home (`src/components/app/dept-flow.tsx`, `src/server/dept-flow.ts`) shows members their own board and leads a desk (Intake, To check, Arriving, To approve, Ready for the next stage, Ready to release with drafted release notes, To assign, the team now, the flow at a glance). Members cannot drag work into another stage on the Board; leads can, and the task's place in the flow follows. Cards show the GitHub pull request with its checks and merged state; a stage can move on by itself when the pull request is merged (scheduled checks, job "flow-merges"). Tasks keep `flow_state`, `flow_since`, `flow_from`, `flow_note` and `release_id`; releases are in `dept_releases` (schema 26). Tests: `tests/server/flow.test.ts`, `tests/e2e/flow.e2e.mjs`.

### Files on an external disk (production)

- [x] Settings, Workflow, "How Recording hands over the raw footage" and "How Editing hands over the master, captions and thumbnail": an external disk (the disk's name and the folder or file on it), a storage link, or either chosen each time. The cards, the item page and the Uploading card show the disk and folder; requirements read "on the disk" or "linked".

## Phase 12b: Dev studio (the software lifecycle in one place) (done)

What exists today: a Timeline view (a Gantt chart with dependencies, drag to reschedule and the critical path) in every department; sprints as a simple switch (one active sprint, a "current sprint" filter); GitHub repositories with pull requests and checks; task templates. Phase 12 adds the Dev flow (code review, QA, release). This phase makes Dev a complete studio for planning, specifying, building, testing and releasing software, close to what teams know from Jira, Linear, GitHub and Confluence.

### 12b.1 Sprints, configurable for any department (Admin)

- [x] **Configure, Sprints** (department heads and Admin) for every department that works in sprints (Dev first; Marketing, Studio or any department can switch them on):
  - sprint length (1 to 4 weeks), start day, naming ("Sprint 14" or by date), working days;
  - capacity per person (hours or story points), and whether estimates are hours or points;
  - the rituals to show: planning, daily stand-up, review, retrospective, each with a day and time;
  - what happens to unfinished work at the end: moves to the next sprint, or back to the backlog.
- [x] **Sprint planning** (add and remove with a button rather than dragging): the backlog beside the sprint, drag tasks in, see capacity fill per person, the sprint goal.
- [x] **During the sprint**: burndown and burnup, scope added after the start marked, daily stand-up notes per person (yesterday, today, blockers).
- [x] **Sprint review and retrospective**: what was finished, what moved on, velocity (average of the last three sprints), and the retrospective board (went well, to improve, actions), with the actions becoming tasks.

### 12b.2 Planning views (beyond today's Timeline)

- [x] **Roadmap**: projects and epics on quarters, with their progress, the team on each, and the release they target.
- [x] **Gantt** (baselines saved in Tools and drawn under each bar on the Timeline, red where a task slipped, with a switch; slipped tasks listed in Tools; MS Project XML; the critical path. Resource load under the chart and a PDF or Excel of the chart itself: still open): baselines (planned against actual), milestones as diamonds, the critical path, task groups folded by epic, resource load under the chart, export to PDF, Excel and MS Project XML.
- [x] **Epics, stories, tasks and sub-tasks** (an Epic task type with child tasks and progress in Tools, Epics and baseline) (the usual hierarchy), story points, acceptance criteria per story, and "definition of done" per department.
- [x] **Projects list with progress** (on the Roadmap, and a Portfolio across departments in Tools for heads and owners): every project with status, health (on track, at risk, late, from dates and progress), percent done by points or hours, open bugs, the next milestone and release, the lead and the team; filters and a portfolio view for heads and owners.

### 12b.3 Specifications and documents (SRS and the rest)

- [x] **Docs space per project** (Specs and docs), with pages that link to tasks and back (a task shows the requirement it comes from, a requirement shows its tasks and their state):
  - **SRS** (software requirements specification), following the usual IEEE 830 / ISO 29148 outline: purpose and scope, users, functional requirements (each with an ID, priority by MoSCoW, acceptance criteria), non-functional requirements (performance, security, availability, usability), interfaces, data, constraints and assumptions;
  - **Product brief / PRD**, **technical design** (architecture, data model, interfaces, decisions), **architecture decision records**, **test plan**, **release notes** (filled from the tasks of the release), **runbook** and **postmortem**.
- [x] **Requirements traceability**: each requirement through to its tasks, pull requests, tests and the release; a matrix view shows what is not covered.
- [x] **Versions and approval**: each document has versions, a review by named reviewers and an approved state; changes after approval start a new version.
- [x] **Export**: Word and PDF (print) with a cover page (the workspace name; the logo is still to add).

### 12b.4 Myseed templates and specs

- [x] Ready templates, written for Myseed's own products (the learning app, the content manager, the Studio tools), in the documents above: an SRS for a learning feature (grade, subject, unit and part; video playback; offline use; Amharic and other languages; low bandwidth), a technical design template with Myseed's stack, a test plan with the devices Myseed students use, a release checklist and release notes template, a postmortem template.
- [x] Project templates that bring the epics, milestones, tasks and documents for common work: "New app feature", "Content import pipeline", "New grade or subject rollout", "Mobile release", "Bug bash".
- [x] Admin and Dev heads can edit them and add their own.

### 12b.5 Development tools and integrations (industry standard)

- [x] **Git hosting**: GitHub (exists) and GitLab; branches and pull requests linked by task code (WEB-12) in the branch name or title; checks and review state on the task; a merged pull request moves the task on.
- [x] **CI/CD**: build and deploy status from GitHub Actions or GitLab CI on the task and the release; deployments per environment (development, staging, production) with time and version.
- [x] **Releases**: versions (semantic, 1.4.0), release trains, the tasks in each, release notes generated, and the deploy that shipped it.
- [x] **Quality**: test cases and test runs linked to requirements (pass, fail, blocked), bugs from failed tests with steps to reproduce; code coverage and quality numbers from the CI when available.
- [x] **Incidents**: error reports from Sentry (or similar) open bugs automatically; incidents with severity, timeline and a postmortem.
- [x] **Standard formats**: import from and export to Jira (CSV and JSON), Trello and Asana boards; webhooks out (task created, status changed, release shipped) and an API key for other tools; Slack or Telegram notices for a channel.
- [x] **DORA measures**: deployment frequency, lead time for changes, change failure rate and time to restore, from the releases, deploys and incidents.

### 12b.6 Dev studio presentation

- [x] A presentation mode for Dev (Dev, Present; with the releases and DORA slides of Phase 12c): the roadmap, each project's progress and health, the current sprint (burndown, goal, what is done), the latest release and what is next, quality and DORA measures, cycling by itself or presented by hand, exported to PowerPoint, PDF or video.

Built (12b): Configure has a Sprints tab; Dev starts with sprints on, in story points. Pages /dev/sprint (planning with the backlog beside the sprint and capacity per person, burndown and burnup with scope added after the start, stand-ups with blockers sent to the leads, review and close with carry-over, the retrospective with actions made into tasks, velocity from the last three sprints, the definition of done), /dev/roadmap (projects by quarter with health, and DORA measures) and /dev/docs (SRS, PRD, technical design, decision records, test plan, release notes, runbook and postmortem from templates; versions; named reviewers; requirement IDs such as FR-1 traced to tasks; Word and PDF). Server: `src/server/dev-studio.ts`; templates: `src/lib/dev-docs.ts`; tests: `tests/server/dev-studio.test.ts`. Tools (/dev/tools, any department): releases with semantic versions and deployments per environment reported by CI/CD; incidents from Sentry or by hand, each filing a bug, with a timeline and time to restore for DORA; test cases linked to requirements, failed runs filing bugs; traceability from requirement to tasks, pull or merge requests (GitHub and GitLab), tests and release; five Myseed project templates plus the head's own; epics with progress; baselines and slipped tasks; a portfolio across departments; import from Jira, Trello and Asana; export to Jira CSV and MS Project XML; an API key (`POST /api/dev/<dept>/events`), signed webhooks, Slack and Telegram notices. Server: `src/server/dev-tools.ts`, `src/server/dev-plan.ts` (schemas 35 and 36); tests: `tests/server/dev-tools.test.ts`, Tools in `tests/e2e/flow.e2e.mjs`. Still open: the Dev presentation (12b.6) and drawing baselines on the Timeline chart.

## Phase 12c: Presentation studio (all departments) (done; video export still open)

What exists today: the Overview's presentation mode for production, with customizable slides, an analyzer (bottleneck, pace and forecast, leaders, load), comparisons, periods, detailed and voice modes, and exports to PowerPoint, video, image, PDF, CSV and JSON.

- [x] **A presentation for every work department** (Insights, Present; heads and leads): the week in numbers, the flow at a glance, finished and new week by week, the sprint burndown, project health and "since last time", each with a plain sentence of what it says, why and the next action (fixed rules); arrow keys, Play every 15 seconds, speaker notes, full screen, choosing slides (kept on that computer), transitions that respect "reduce motion". `src/server/present.ts`, `src/components/app/dept-present.tsx`.
- [x] **One studio for every department**: every work department (Dev with releases and DORA measures) and a **company deck** (/present, sidebar Company presentation) with production, departments, people, attendance, money, customer support and recognition, each slide shown only to those allowed to see its numbers.
- [x] **Building a presentation** (Deck): add, remove and order slides; minutes per slide; saved for yourself or for the team (heads and leads); ready decks (weekly team meeting, sprint review, projects and delivery, monthly owners' review, people and attendance).
- [x] **Themes and layout**: light and dark with the app, big text for big rooms, the transition per deck; slide kinds: big numbers, bars, lines, stages, progress, list, table, text. The logo and workspace name on every slide; the logo and theme colour on the PowerPoint cover.
- [x] **Animations and transitions**: fade, slide or zoom; numbers count up, bars grow, stages and points appear one by one; all off with "reduce motion".
- [x] **Explainers**: each slide has a plain sentence of what it says, why, and the next action, written from the numbers by fixed rules.
- [x] **For productivity**: meeting mode with the agenda, a timer per slide against its minutes and for the whole meeting, actions captured during the meeting that become tasks (in the chosen department for the company deck); a "since the last meeting" slide.
- [x] **Presenting**: presenter view in a second window (notes, next slide, timer) that moves the main screen; laser pointer (L) and drawing (D); Play for an office TV that refreshes the numbers every minute. A phone as the remote: the deck shows a QR, and the phone's page has big Next and Previous buttons and shows the slide (for four hours).
- [x] **Sharing**: a read-only link to a copy of the slides for a set number of days (views counted, can be stopped); PowerPoint with editable charts; PDF by printing; a summary of the deck by email every week on a chosen day. (Video export: still open.)


Built (12c): `src/lib/deck.ts` (slides as data), `src/server/decks.ts`, `src/server/deck-page.ts`, `src/components/app/deck/` (player, presenter view), `/present`, `/p/<link>` (schema 39). Tests: `tests/server/decks.test.ts`, the Present part of `tests/e2e/flow.e2e.mjs`.
## Phase 13: Assistant (a guide, not an AI) (done; more flows to write over time)

A helper in the corner of every page that explains the app and walks people through tasks, built from fixed, written flows (no language model, nothing sent outside).

- [x] **Talking to it**: a small chat panel with buttons to choose from, and a box to type in. Typed text is matched against keywords and synonyms written for each flow ("assign", "give videos to", "hand over"...). Anything it cannot match is offered the closest flows and the Help search.
- [x] **Doing a task with it** (written so far: ask for leave, start my next task, assign work in a department with a flow; production assigning stays a "show me" for now): a flow asks one thing at a time with pickers taken from the app (people in the team, grade, subject and unit, parts not done), shows a summary, and on Confirm runs the same action as the page would, with the same permission checks. Example for an Editing lead: "Assign videos" → choose the editor → choose grade, subject and unit → tick parts (only parts that arrived from Recording) → due date → confirm → done, with a link to see them.
- [x] **Show me**: instead of doing it, the assistant takes the person there and points: it dims the page, highlights the button or tab to press with a short note, waits for the click and moves to the next step (works on every page through marked elements).
- [x] **First flows**, per role: assign work; approve and hand over; accept arrivals and assign; start, finish and send my work; ask for leave; claim an expense; check in or correct attendance; book a studio session; review a task (departments); "where is...?" (every page by name); "what does ... mean?" (statuses and terms from Help).
- [x] **Monitoring** (Admin, Assistant): how often each flow is started and finished, where people give up, what people typed that matched nothing (to write new flows), by role and by week, and an export.
- [x] **Setup** (Admin, Assistant; the built-in wording stays as written, Admin adds keywords and answers): flows on or off per role, the wording and the keywords of each flow, and short answers to common questions.

Built (13): a button in the corner of every page opens the assistant (`src/components/app/assistant.tsx`), with the person's own flows as buttons and a box to type in. Flows, places ("where is ...?") and the glossary ("what does ... mean?") are written in `src/lib/assistant.ts`; typed text is scored against their keywords plus Admin's. "Do" flows ask one thing at a time with pickers from the app and run the same actions as the pages; "show me" opens the page, dims it, outlines what to press with a note and moves on when it is pressed (carrying on across pages). Admin, Assistant (/admin/assistant): flows on or off per role, extra keywords, short answers, and usage (started, finished, where people gave up, what matched nothing, per week, export). Tests: `tests/server/assistant.test.ts`, and the assistant in `tests/e2e/flow.e2e.mjs`.

## Phase 13b: A smarter assistant, by voice, in every department (done)

- [x] **AI answers (optional, Admin, Assistant)**: with an Anthropic API key (stored sealed) and the switch on, what people type or say goes to Claude (Opus 5.5 by default; Sonnet or Haiku for cost), which answers from the person's own data, read with their own permissions through the pages' functions: what waits for them, their work in every department and production, a department's tasks, its statuses and people, leave balances and requests, attendance now, colleagues by name, production parts, and the Help. Admin chooses the model, how hard it thinks, the roles left out, a daily limit per person, whether it may prepare actions, and sees the usage (questions, people, actions confirmed, by role). Without a key, or for roles left out, the keyword assistant stays.
- [x] **It never acts by itself**: to ask for leave, create, start, move, assign or comment on a task, or check in or out, it shows a card with what will happen and Confirm. The card is sealed (it cannot be changed in the browser, only its own person can confirm it, it expires after 30 minutes) and Confirm runs the page's own action with the usual checks.
- [x] **Voice**: a microphone beside the assistant and in it (Alt+V), in English or Amharic (the browser's speech recognition; Chrome, Edge, Safari), answers read aloud when asked by voice (switch in the panel). Commands work at once without the AI: "open leave" (any page by name), "go back", "scroll down", "top", "close", "new conversation". Alt+A opens the assistant.
- [x] **Every department**: new flows Create a task (any department the person works in, with the person and due date), Check in or out now, Ask another department, Read and write my email, Message a colleague, Approve leave, claims and corrections (leads, HR, Finance), Add or update an employee (HR), Record a bill, payment or claim (Finance); more pages by name (HR, Finance, Dev team, Marketing, Studio, Handovers, Coverage, Reports, Calendar, Company).
- [x] **Smarter keywords**: typing mistakes are forgiven ("leav", "assgin", "atendance").
- [x] **Colourful icons** (Google style): every sidebar icon keeps its own colour (Home blue, Attendance green, Email red, People purple, Finance green...), with lighter shades in dark mode, and Home's quick actions on tiles of their colour; "One colour" in the account menu (Corners, text and icons) turns them back.

Built (13b): `src/server/assistant-ai.ts` (settings, the tools, sealed proposals, Confirm, usage; a stand-in model with `AI_FAKE=1` for tests), `src/components/app/assistant.tsx` (voice, commands, AI answers and proposal cards), `src/app/(app)/admin/assistant/ai-admin.tsx`, `src/components/app/app-icon.tsx`. Tests: `tests/server/assistant-ai.test.ts`, `tests/e2e/assistant-ai.e2e.mjs`.

- [ ] Later: answers streamed word by word; reading a page's contents aloud; more actions (approve leave, hand over, book a session) once people trust the first ones; colourful icons in the Admin and department tabs.

## Phase 13c: Navigation, looks and branding (done)

- [x] **No tab bars on top of pages that the sidebar already lists**: Admin, HR, Finance, Settings, Owners, Email, Studio and Attendance (for leads, HR and Admin) show their parts as links under their sidebar entry, and those links switch the page (Admin's links did not switch it before).
- [x] **Looks, per person** (account menu): colourful or one-colour icons; the icon pack (Lucide outline, Phosphor filled, Phosphor duotone); outline strokes thin, regular or bold; the font (Jakarta, Inter, Atkinson for easy reading, Nunito, Lora, Noto Ethiopic first); high contrast (darker text and borders, strong focus rings). Applied before the page shows, kept on that computer.
- [x] **Admin, Branding**: a banner for Home, production, each department (built-in and created), HR, Finance, Attendance and People: an uploaded picture (up to 3 MB) or a colour, with a title and a line; and any sidebar entry's icon (from a pack of 90 icons, each in both packs) and colour, for everyone.
- [x] **QR check-in inside the app**: Admin, Attendance setup, Capture: "Scan the QR in the app" (with the printed QR on); the Attendance page then has Scan the QR, which opens the camera and reads the poster on the phone (the browser's reader, or jsQR), then checks in through the usual page and checks.

## Phase 13d: Assistant per role, more operations, tutorials and routines (done)

- [x] **Options per role** (Admin, Assistant): AI answers, voice, routines, which actions the AI may prepare, the suggestions shown first, and a daily limit for AI questions.
- [x] **More operations** (prepared, then run on the person's Confirm through the pages' own functions): leave (ask, cancel), check in or out, attendance corrections, expense claims, notifications read; tasks in any department (create, start, finish, send to the lead, move, change priority or due date, comment, assign, approve, return); requests to another department; approving or rejecting leave, claims and corrections; running a routine. New reads for the AI: what waits for my approval, my notifications, my routines.
- [x] **Tutorials**: 22 written how-tos for every department plus Help's guides, as numbered steps with the page to open (How-to tutorials in the assistant; found by typing or voice; the AI can open them).
- [x] **Routines** (no AI key needed): Record a routine in the assistant, do the task as usual (clicks and typing, page by page; never passwords), save it with a name, the values to ask each time and who may use it (only me, my departments, everyone). Run it from the assistant ("run weekly notes", a button, voice, or the AI). Approval as Admin sets it: the person confirms, their line manager first, or Admin first (told by a notice; Routines page to approve or reject with a note); optionally a "Do it" press per step. It runs in the person's own browser, ringing each button as it presses it; it stops and asks when something is not where it was; every run is recorded.

## Phase 14: Mail, a company inbox in the app (core done)

Each person reads and sends their company email under Email. Admin (email managers) gives the mailboxes; people never get a password, so they cannot change it, set forwarding or filters, or open webmail or a phone app with it.

- [x] **How it connects**: a mailbox is a sender address with its own sign-in and "Inbox" on (Email, Settings, Who has a mailbox). Reading over IMAP (cPanel: the incoming server, port 993 with SSL; set once in Email, Settings, Mailboxes), sending through the same account or the web API relay when the hosting blocks SMTP, with a copy put in Sent.
- [x] **The cPanel connection** (recommended): cPanel address, user name and an API token (Security, Manage API Tokens), sealed. With it Admin, from the app:
  - **creates** a mailbox on the company domain for a person, with a space limit, and a long random password nobody sees;
  - **takes over** an existing mailbox: its password is changed to one nobody sees, so old phones and webmail sign-ins stop;
  - sets a **new password** at any time, turns the inbox in the app off or on, and **removes** it (optionally deleting the mailbox and its mail at cPanel).
  Without the token, a mailbox can still be connected by typing its password.
- [x] **Private by default**: nobody reads another person's mail. Admin can allow email managers to open a mailbox read-only; each opening is recorded in the audit log and the person gets a notice; nothing is marked read, moved or sent from it.
- [x] **Looks and works like webmail**: Compose; Inbox, Drafts, Sent, Archive (made when first used), Junk, Trash and the mailbox's own folders with unread counts; the list with sender, subject, attachment and date; filters Unread and Starred; search (sender, subject, text); the message beside the list; reply, reply all, forward (with the attachments); attachments to open or download; star, read or unread, archive, junk or not junk, delete (to Trash, then for good), move; pages of 50; keyboard c, j, k, Enter, u, r, a, f, e, #, s and /; a few seconds to undo sending; drafts saved on close and opened again.
- [x] **Safety**: messages shown in a frame with no scripts (scripts, frames, forms and event handlers also removed), outside pictures blocked until "Show images", links in a new tab; attachments fetched when asked, pictures and PDFs opened, everything else downloaded; 20 MB of attachments per message.
- [x] **Syncing**: new mail checked every minute while Email is open; the scheduled checks keep the unread count on the sidebar and notify "New email" (one notice that counts up). Mailbox mail is not added to the sent log, which email managers read.
- [x] **Setup check**: "Check the server" finds the server and tries the IMAP and SMTP ports from the app's server (says when the hosting blocks them), "Check cPanel" signs in to the API, and "Check" per mailbox signs in to it.
- [x] Conversations grouped in the list (same subject, without Re: and Fwd:, with a switch), a preview line under each subject, a signature per mailbox added to new messages and replies, and **Send later** from the mailbox: checked when written, sent by the scheduled jobs, listed until it goes, cancelling puts it back in Drafts, and the person is told if it fails (schema 44).
- [ ] Still open: formatting in the message (bold, lists, links), and Google Workspace or Microsoft 365 mailboxes through their own sign-in.

## Phase 15: Foundations (first, before Phase 10b)

Small pieces that protect everything else: sign-in, scheduled jobs, backups, tests and monitoring. Everything here is set up by Admin in Admin, Sign-in and Admin, System, with safe defaults.

### 15.1 Sign-in and accounts, configurable

- [x] **Password rules** (Admin): minimum length, letters and numbers, optional check against known leaked passwords (through the Have I Been Pwned range check, which never sends the password), optional change every N days, no reuse of the last N.
- [x] **Wrong attempts**: after N wrong passwords (default 5) the account waits (default 15 minutes, growing on repeats); many failures from one address slow that address down; a "too many attempts" message that does not say whether the account exists; the person and Admin are told of a lockout.
- [x] **Two-step sign-in**, methods switched on by Admin:
  - **authenticator app** (Google Authenticator, Microsoft Authenticator, Authy: TOTP codes), set up by scanning a QR on Profile, Account;
  - **email code** as a fallback;
  - **passkeys** (fingerprint or face on the phone or laptop, WebAuthn);
  - **recovery codes** (10, shown once, each works once).
  Admin chooses per role: off, optional, or required (default required for Admin, HR and Finance roles); "remember this device for N days". Admin can reset a person's two-step sign-in, recorded in the audit log.
- [x] **Sign in with another account (OAuth 2 / OpenID Connect)**, each provider switched on and set up by Admin (client ID and secret, stored sealed):
  - Google (Gmail and Google Workspace), Microsoft (Microsoft 365 / Entra ID), and any OpenID Connect provider (Zoho, Keycloak and others);
  - allowed email domains per provider (for example only `@myseed.et`);
  - linking: a sign-in matches an existing account by verified email; a person can link or unlink providers on Profile, Account;
  - Admin can make a provider the only way in for some roles.
- [x] **Email verification**, Admin chooses (Admin, Sign-in, Email verification): off, new people who join (invitation or sign-up), or everyone after a grace period. A one-time link is emailed and sign-in waits until it is opened; Google, Microsoft and single sign-on count as confirmed; a changed email is confirmed again; Admin is never locked out, can resend the link or mark an address confirmed. Nobody is held back while no email account is set up.
- [x] **Sign-up**, Admin chooses: off (Admin creates accounts, today), invitation only (a link valid for a few days, with the role chosen by whoever invites), or open to allowed domains with Admin approval and a starting role; new people are linked to their HR record when one exists.
- [x] **Sessions**: idle sign-out and maximum session length per role (shorter for Admin, HR, Finance); a notice by email and in the app on a sign-in from a new device (with its address; no country lookup); existing Sessions and devices page stays.
- [x] **Sign-in log**: every sign-in, failure, lockout, two-step change and provider link, with time, device and address, for Admin; each person sees their own on Profile, Account.
- [x] **Passkeys** (WebAuthn) as another second step: added on Profile, Account (fingerprint, face or a security key, one per device), used at sign-in with "Use a passkey" instead of a code, switched on or off by Admin; checked with `@simplewebauthn/server` against this site's address. Tests: `tests/e2e/passkeys.e2e.mjs` (Chrome's virtual authenticator).

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
- [x] Slow pages: how long each section takes to open as people use it (a full load from the browser's timing, a move inside the app from the click), shown in Admin, Usage as the slowest pages with their average, share over 2 seconds and slowest time; only the section and the time are kept (`page_timings`, schema 43).

## Phase 16: Myseed's own needs

### 16.1 Presenter and teacher releases and fees (done)

- [x] **Presenters** (Production, Presenters; HR, managers and the Recording lead): teachers, guests and students with contact, subjects and the other names they appear under on parts (Teacher) and sessions (Presenter); a signed **release** (signed on, valid until, where the videos may be used) with the scanned form.
- [x] With "Releases required" on, a part cannot leave Recording without a valid release for its presenter (a Recording requirement like the others); releases ending within the warning days (default 30) or ended warn HR and the Recording leads, once each.
- [x] **Fees** per session, part or hour; a monthly statement per presenter from the sessions marked recorded; sent to Finance, who make it a bill for the presenter as a vendor with one press. (Withholding tax follows Finance's own bill rules.)
- [x] Students or others in videos are presenters of kind Student with their own release, linked to parts by name.

### 16.2 Where the files live (done)

- [x] Admin, Files and publishing: the company's storage places (Drive folder, NAS path, bucket) and the folder pattern (grade, subject, unit, code); links on parts outside those places are listed there.
- [x] A weekly **link check** of every current raw, master, captions and thumbnail link; the ones that no longer open are listed and the team leads are told.
- [x] Links outside the company's places can be listed per person (for a leaver), from the same function as the Admin list.

### 16.3 Publishing to the Myseed App (done, needs the app's real API address)

- [x] The Uploading card ("Record upload", destination Myseed App) has Send to the Myseed App: the approved master with the part's details goes to the app's API (POST /videos, key sealed in Admin, Files and publishing), and the app's ID is recorded as the upload; Check the app (GET /videos/ID) records the upload complete and playback checked when it plays, and live with the app's link when the app says it is live. Tested against a stand-in app; the real app must answer in that shape.

### 16.4 Amharic and the Ethiopian calendar (dates done; translation continues)

- [x] **Dates in the Ethiopian calendar**, per person (account menu, Language and calendar: Gregorian, Ethiopian or both) and per workspace (Settings, Calendar display, for people who have not chosen). Every date the pages show is converted ("ጥቅምት 24, 2019"), checked against known dates over 20 years (`src/lib/ethiopian.ts`). Ethiopian public holidays were already in Leave.
- [x] **Amharic for the interface, first part**, per person (account menu): the sidebar, the top bar, page titles, tabs, common buttons, statuses and the assistant (about 180 labels in `src/lib/amharic.ts`; a label is shown in Amharic when its text has an entry, so more are added by adding lines).
- [x] **Picking dates in the Ethiopian calendar**: for people using it, any date field gets a picker beside it while it has focus (Ethiopian day, month and year, with Pagume's 5 or 6 days). It fills the field with the same day without changing the pages (`src/components/app/ethiopian-picker.tsx`; checked in `tests/e2e/branding.e2e.mjs`).
- [x] **More Amharic**: 57 more labels for performance, recognition, customer support, attendance records, payroll and presentations.
- [ ] Still open: every remaining label, message and email in Amharic (and Afaan Oromo later); payroll months following the Ethiopian calendar.

### 16.5 Data protection for everyone's records (done)

- [x] A privacy notice for staff (Admin, Privacy; a template to start from), shown before anything else at sign-in and again when it changes (a new version), with acceptance recorded and a list of who has not accepted.
- [x] A retention schedule set by Admin and HR managers (attendance, applicants not hired, read notifications, page visits, assistant records, audit and access logs) applied every day by the scheduled checks, or now by a button, with what was removed written to the audit log. Chat keeps its own retention (Admin, Chat).
- [x] **Download my data** (Profile, and from the notice): account, roles, profile, HR record and documents list, leave, attendance and corrections, payslips, claims, tasks, comments, notifications, sign-ins, routines, as one JSON file; never the password. Chat messages are end-to-end encrypted, so they stay in Chat.
- [x] An access log of who opened someone else's HR record or payslip (one line per person and record each hour), for HR managers and Admin (Admin, Privacy).

## Phase 17: Performance management: KRAs, KPIs and OKRs (done)

The detailed plan (data model, the measure catalogue from the app's own data, scoring, screens, permissions, the decisions to make first and the order of work) is in [PHASE-17-PLAN.md](PHASE-17-PLAN.md).

One system for "what each person and team is responsible for, how it is measured, and what we are trying to achieve this quarter", fed by the work already in the app, so most numbers fill themselves in. Everything is configurable by HR and Admin, with department heads setting their own within the rules.

### 17.1 The parts and how they fit

- **KRA (key result area)**: an area a role or position is responsible for, for example for an Editor: Quality, Delivery, Teamwork; for a Recording lead: Throughput, Planning, Team. Each KRA has a weight (they add up to 100%).
- **KPI (key performance indicator)**: a number that shows how a KRA is going, for example "Parts edited per week", "Returned by the lead (%)", "On time (%)". Each KPI belongs to a KRA, with its own weight inside it.
- **OKR (objectives and key results)**: what a company, department, team or person wants to achieve in a cycle (usually a quarter), with 2 to 5 measurable key results each. OKRs are about change and ambition; KRAs and KPIs are about the steady job.
- **Scorecard**: for a person, team or department and a period, every KPI's actual against its target, scored, rolled up by KRA and overall. Scorecards and OKR results feed performance reviews (Phase 7).

### 17.2 The KPI library (HR and Admin)

- [x] Each KPI has: name and plain description, unit (count, %, hours, days, money, score), direction (higher or lower is better), how often it is measured (weekly, monthly, quarterly), how a period's value is formed (sum, average, latest, rate), and red, amber and green bands.
- [x] **Where the number comes from**, chosen per KPI:
  - **from the app** (no typing), from a catalogue of measures the app already has:
    - production: parts finished per stage, on-time rate, cycle time per stage, returned by lead or marked missing (quality), redo requests received, review notes per part, published per week;
    - departments: tasks done, story points, cycle time, reopened tasks, bugs found after release, requests answered in time, campaign KPIs (reach, leads, spend), budget used against plan;
    - people: attendance (punctuality, absence rate, overtime), training completed, leave balance used;
    - finance: spend against budget, invoices paid on time;
  - **a formula** of other measures (for example published ÷ planned × 100);
  - **typed in** by the person, their lead or HR (with evidence attached), for things the app cannot see (for example customer satisfaction from a survey);
  - **imported** from a spreadsheet or Power BI feed.
- [x] Fairness built in: values per working day (leave and holidays excluded); a quantity KPI paired with a quality KPI (the setup warns when a KRA has only quantity measures); minimum sample sizes before a percentage counts.

### 17.3 KRAs per role and position

- [x] **KRA templates** per role and position (Editor, Editing lead, Developer, Tech lead, Marketing officer, HR officer, Accountant...), with their KPIs, weights and default targets; ready templates for Myseed's roles to start from.
- [x] People get their template automatically from their role and position (and their department's version of it); a lead or HR can adjust one person's targets, with the reason, approved by HR; changes after the period starts need approval and are logged.
- [x] Targets: one number, a range, or per person; set per period or rising over time (for example +5% each quarter).

### 17.4 Scorecards

- [x] **Scoring**, configured by HR: how an actual becomes a score (straight percentage of target capped at 120%, bands to a 1-5 scale, or pass or fail), how KPIs roll up into KRAs and KRAs into an overall score, and the rating labels (for example Exceeds, Meets, Below).
- [x] **My scorecard** (on Home and Profile): this period's KPIs with actual, target, trend and colour, clicking through to the work behind each number (which parts, which tasks, which days).
- [x] **Team and department scorecards** for leads and heads; a company scorecard for owners; comparisons across periods and teams (never ranking individuals on a public screen unless HR allows it).
- [x] Periods close on a date set by HR; after closing, numbers are frozen; late corrections go through HR with a reason.

### 17.5 OKRs

- [x] **Cycles** set by Admin and HR: length (quarter by default), dates, a planning window before the start, a mid-cycle review and a scoring window at the end.
- [x] **Levels and alignment**: company, department, team and personal objectives; each can support a higher one, shown as a tree; limits configurable (for example at most 5 objectives and 5 key results each).
- [x] **Key results**: start value, target, current value and unit; updated by hand at check-ins or linked to a KPI or app measure so they move by themselves; milestone-type key results (done or not done) allowed.
- [x] **Check-ins** weekly (configurable): progress, confidence (on track, at risk, off track) and a short note; reminders to owners; off-track key results flagged to the lead.
- [x] **Scoring** at the end: 0.0 to 1.0 per key result (or percentage), the objective's average, a short reflection; the method is configurable.
- [x] **Visibility** per objective: everyone, the department, or private to the person and their lead.
- [x] Planned tasks and projects can be linked to a key result, so the work behind it is visible.

### 17.6 Using it day to day

- [x] Home widgets: my KPIs this period, my key results to update, my team's off-track items.
- [x] The presentation studio (Phase 12c) gets KPI, scorecard and OKR slides; monthly owners' review deck includes the company scorecard and OKR progress.
- [x] Performance reviews (Phase 7) attach the period's scorecard and OKR results as evidence; HR can run a calibration view (spread of ratings per department).
- [x] Notifications: check-in reminders, KPIs turning red, targets changed, periods closing.
- [x] Permissions (configurable in the matrix): HR manages the library, templates, scoring and cycles; heads and leads set targets and OKRs for their teams within the rules; everyone sees their own; owners see the company.
- [x] Exports: a spreadsheet per period (CSV for Excel), and two Power BI feeds: closed months' scorecards (a row per person and KPI) and OKRs (objectives everyone may see, with their key results).


Built (17), with the plan's suggested decisions as settings HR can change (Performance, Periods and settings):
- monthly scorecards and quarterly OKRs;
- percent of target capped at 120%, with bands or pass and fail also possible per KPI;
- scorecards shown beside HR reviews as evidence, without setting the rating; OKRs do not feed the rating;
- everyone sees their own scorecard (switchable to leads and HR only while targets are tuned);
- OKRs visible to everyone by default.

How the numbers work:
- 16 measures from production stages, department tasks, attendance, customer support and kudos (`src/server/measures.ts`), added up as numerators and samples so teams count correctly.
- In the running month, monthly amounts are compared with the part of the month gone.
- Attendance KPIs stay empty without attendance records.
- Rates need a minimum sample before they count.

Rules and screens:
- Ready templates: Recording, Editing, Uploading, Publication, Developer, Tech lead, Customer support agent, Everyone else. Weights must add up to 100, and a template with only quantity KPIs gets a warning.
- A lead's target change to a started month, and corrections to a closed month, wait for HR. Months close by themselves on the set day or by HR, and their scorecards freeze.
- Team, company and calibration views; a CSV export.
- OKRs: the tree from company to person, limits, check-ins with confidence, off-track key results told to the owner of the objective they support, key results that move with a measure, and tasks linked to a key result.
- Weekly check-in reminders, and KPIs turning red.
- Company deck slides (scorecards, objectives); scorecards on HR reviews.

Code: `src/server/performance.ts`, `src/lib/performance.ts`, `/performance` (schema 40, permissions `perf.library` and `perf.view_company`). Tests: `tests/server/performance.test.ts`, `tests/e2e/performance.e2e.mjs`.
## Phase 18: Worth having (done)

- [x] **Announcements and policies**: Admin, HR managers and owners announce to everyone, departments or roles; a department's head to their own department. News or a policy to confirm, pinned, with an end date. Shown at the top of every page until read ("Got it") or confirmed ("I have read this"), and as a notice. The author sees who has read or confirmed and who has not, and reminds them. Page: /announcements.
- [x] **Phones and slow connections**: every main page checked at phone width (390 px) by a browser test (`tests/e2e/mobile.e2e.mjs`); a Light mode in the account menu (no animations, no banner pictures, background checks three times less often).
- [x] **Usage view** (Admin, Usage): page visits per section and per role over 30 days, people using the app each day, and who has not signed in for 14 days or more. Only the section of each visit is kept (no ids, nothing on the page).
- [x] **Speed with years of data**: `npm run perf:big` fills a throwaway workspace with five years of data (20,000 parts, 40,000 tasks, 1,000,000 attendance events) and times the queries behind the busiest pages; all were under 30 ms on a laptop (limit 300 ms).

## Phase 19: App shell (the employee app on phones)

Phase 5b made the web app installable and prepared the native shell. This phase finishes the app staff carry every day, so the things they do on a phone feel native. Steps for the native builds are in [APP-SHELL.md](APP-SHELL.md).

- [x] **QR check-in inside the app**: a scan button in the top bar (and on Attendance, Me) opens the camera and reads the entrance poster. The phone's own reader is used when there is one, else jsQR. It is on whenever the printed QR is on, and Admin can switch it off in Capture.
- [ ] **Native builds**: the Android APK (then Google Play) and the iPhone build (TestFlight), from `capacitor.config.json`. These need a machine with Android Studio and Xcode.
- [ ] **Native camera scanner** in the shell (Capacitor barcode scanner) for older phones without a usable web camera. It uses the same code check, so the site's office network and location rules still apply.
- [x] **Check-in without signal** (in the web app; the native shell will use the same):
  - The QR at the entrance opened with no signal shows the offline page with Check in and Check out, which keeps the check-in on the phone with its real time. The check-in pad does the same when the network drops.
  - Saved check-ins are sent when the app is next opened online. They are taken once by their id, within the hours Admin allows for offline check-ins, at the QR's site, and marked for HR to review (the office network and location could not be checked).
  - Tests: `tests/server/offline-checkin.test.ts`, and the end of `tests/e2e/qr-checkin.e2e.mjs`.
- [ ] **Reliable notifications and ringing**: Firebase on Android and PushKit with CallKit on iPhone, for calls and urgent notices, including incoming customer support calls for agents.
- [ ] **Biometric sign-in**: fingerprint or face to open the app, with the password kept in the phone's secure storage.
- [ ] **Deep links**: links in emails and notifications open the right page in the app.
- [ ] **Customer support in the Myseed App**: the student app embeds the support widget (Phase 20) through its web view or calls the API, so students and parents reach support without leaving the app.

## Phase 20: Customer support (done; the Myseed App still to connect, SMS later)

A real help desk for the customers of Myseed's apps, inside this workspace. It was built here rather than as a separate system so that agents, attendance, notifications, recognition and Admin all stay in one place. Other apps connect with an SDK and an API ([SUPPORT-SDK.md](SUPPORT-SDK.md)).

- [x] **Setup** (Admin, Support setup):
  - an on and off switch, support leads, automatic assignment, and "only agents checked in at work";
  - call recording with the notice customers agree to, how long recordings are kept, auto close of solved tickets, ring time, opening hours and the away message.
- [x] **Queues**: a team of agents per kind of question. Keywords route tickets to a queue. Tickets are given to the least busy agent or in turn, or assigned by hand. Each queue has a target for the first answer and for solving; urgent tickets get a quarter of that time and high-priority tickets half.
- [x] **Assignment by the system**: a new ticket goes at once to an agent of its queue who is online in the desk and under their limit of open tickets. If nobody is free it waits, leads are told, and it is given out as soon as an agent comes online or at the next scheduled check. An agent who closes the desk drops out of assignment within three minutes.
- [x] **The desk** (/support):
  - Views: mine, unassigned, all open, late, per queue, solved, with search.
  - Each ticket has the conversation, replies and internal notes, saved replies, status, priority, queue and assignment, the customer with their app details and other tickets, calls with their recordings, and the activity.
  - Agents open tickets for phone calls, email or walk-ins.
- [x] **The SDK and API**:
  - `public/support-sdk.js` adds a Help button and panel to any web app. Mobile apps can open `/support-widget` in a web view or use `/api/support/v1`.
  - Each connected app has a public key, allowed web addresses, its first queue, a greeting and a colour, and can sign who the customer is (HMAC with the app secret).
  - Customers ask, follow answers, rate the help (1 to 5) and call.
- [x] **Calls and recordings**:
  - Customers call from the widget in the browser, with no phone number. The call rings for the ticket's agent or for every free agent of the queue; unanswered calls become "missed" and the ticket says so.
  - Calls are recorded in the agent's browser (both voices) after the customer agrees, and kept with the ticket. Each listen is logged, and old recordings are deleted after the days set.
  - Phone calls made outside the app are logged with their length and notes.
- [x] **Monitoring** (leads):
  - per agent: status, open and solved tickets, replies, average first answer and solve time, calls and minutes, missed calls, customer rating, late tickets and last activity; each agent's limit;
  - per queue: what waits and for how long;
  - the activity log and the call recordings.
- [x] **Recognition**: solved tickets count as finished work in the monthly score (on time when within the target); ratings of 1 or 2 count as work sent back.
- [ ] **Connect the Myseed App**: add the SDK or the API with the app's real key and sign its customers from its server.
- [x] **Email into tickets**: a mailbox in the app chosen in Support setup. New mail opens a ticket (from the next message on, not its old mail). Replies continue the ticket by [#number] in the subject or by the email headers, but only from the same customer, and quoted text is cut off. Agents' replies go out from that mailbox.
- [x] **Telegram**: Admin pastes the bot token, and the app sets Telegram's webhook to itself. Messages to the bot open or continue a ticket, the customer is told its number, and agents' replies go back to the chat.
- [x] **Knowledge base**:
  - agents write articles and leads publish them;
  - customers search them in the widget, and see suggestions while typing a question; each article counts reads and "did this help?" votes;
  - agents link articles in replies (`/help/<id>`); the API has `articles`.
- [ ] **SMS** as a channel (needs a paid SMS gateway).

Built: `src/server/support-desk.ts`, `src/server/support-channels.ts` (email, Telegram, knowledge base; schema 41), `src/lib/support.ts`, `src/app/(app)/support`, `src/components/app/support`, `src/app/support-widget`, `src/app/api/support` (schema 38). Tests: `tests/server/support-desk.test.ts` (53 checks), and `tests/e2e/support.e2e.mjs`, which covers the SDK on another site, assignment, a reply, and a real browser call that is recorded.

## Phase 21: Attendance kept by hand, payroll for everyone, and recognition (done)

- [x] **Attendance by HR and Admin** (Attendance, Edit records):
  - log a check-in someone missed, change a check-in's time, remove a wrong one, and clear a person's (or everyone's) days for a date range;
  - each change needs a reason; the person is told; the old entry stays, voided and struck through; everything is in the audit log.
  - Day records with in and out times (team leads and HR) remain as before.
- [x] **Employee rules** (Attendance, Employee rules):
  - warnings to the person and HR after repeated lateness or absence in a month;
  - pay deducted for every so many late days (taken in payroll with the unpaid days);
  - a monthly limit on corrections, a reminder the next morning of a missing check-out, and the notice for absence.
  - The written rules are drafted from the shifts and these settings, edited by HR and published as a policy everyone confirms (Announcements).
- [x] **Payroll for everyone**:
  - Every active account gets an HR record and shows in Payroll, Salaries ("Add everyone to payroll", and a daily job for new accounts). Salaries are then set by Finance or HR; people without one are counted.
  - Income tax follows **Proclamation No. 1395/2025** by default (2,000 birr a month free of tax, then 15% to 35%). 979/2016 is still a choice, and hand-edited brackets show as custom. Pension follows Proclamation 1268/2022 (7% and 11%).
  - Overtime rates follow the Labour Proclamation 1156/2019 (1.5, 1.75 at night, 2 on the rest day, 2.5 on holidays).
- [x] **Recognition** (/recognition; Admin switches it on, off by default):
  - A monthly score from attendance, delivery on time, quality (nothing sent back) and teamwork (kudos), with weights Admin sets.
  - The leaderboard: everyone sees the top and their own place; HR, Admin and owners see everyone and who needs support. Admin can hide scores or show the board to managers only.
  - Badges by fixed rules each month (top performer, department star, rising star, perfect attendance, always on time, zero returns, team player). Titles such as "Employee of the month" are given by HR or Admin. Kudos between colleagues come with a monthly limit.

Built: `src/server/attendance-admin.ts`, `src/components/app/attendance/records-ui.tsx`, `src/server/recognition.ts`, `src/lib/recognition.ts`, `src/app/(app)/recognition`, payroll changes in `src/server/finance.ts` and `src/lib/finance.ts` (schema 37). Tests: `tests/server/attendance-admin.test.ts`, `tests/server/recognition.test.ts` and `tests/e2e/people-ops.e2e.mjs`.

## Phase 22: The assistant as an agent, on the side (done)

- [x] **Docked on the side**: the assistant can be docked as a full-height panel on the right. It stays open between pages, and the page makes room for it on wide screens. It can float again in the corner at any time.
- [x] **Agent mode** (beside Ask mode):
  - it does what the person asks itself, with the person's own permissions and the pages' own checks: tasks, leave, check-in, corrections, claims, approvals, routines;
  - every action is shown in the panel as done or failed, kept in the agent log, and written to the audit log;
  - Admin turns it on or off for everyone (Admin, Assistant, AI) or per role (Roles: Agent mode), and limits the actions per request (8 by default);
  - Ask mode still only prepares actions to confirm.
- [x] **Earlier conversations**: every conversation is saved, listed under the history button, and can be opened again or deleted (40 per person).
- [x] **More it can read**: a search across production, every department's tasks, people and help; the person's KPI scorecard (or their team's); the team analyzer for leads; support tickets for agents; and the recognition leaderboard.
- [x] **People, as regular members see it** (Admin, People, "Who regular members see in People"):
  - a regular member sees other regular members only;
  - owners, Admin, managers and the chosen roles are hidden, and so are leads, except the member's own lead and line manager when Admin keeps those;
  - leads and the roles Admin picks see everyone;
  - it applies in People, on profiles and in the assistant.
- [x] **Calls in View as**: they pause quietly instead of showing an error.

Built: `src/server/assistant-ai.ts` (agent, conversations, write-ups), `src/components/app/assistant.tsx`, `src/server/profiles.ts` (visibility), `src/app/(app)/admin/people-visibility-admin.tsx` (schema 46). Tests: `tests/server/agent.test.ts`, `tests/e2e/agent.e2e.mjs`.

## Phase 23: The team analyzer and the import helper (done)

- [x] **Analyze** (a department's Analyze tab, for its leads, heads and Admin):
  - created against finished work per week;
  - cycle and lead time (median and 85th percentile);
  - open work in each status and how long it has waited there (the bottleneck), and where finished work waited longest;
  - each member's open work, work in progress, overdue tasks, pace, on-time rate and load against capacity;
  - the risks: overdue, stuck for a week or more, blocked, and urgent work without an owner.
  - Written insights come from the app's own rules. With the AI on, **Explain with AI** writes it up and answers a question. Every status move is now kept for this.
- [x] **The same for production** (Team and capacity, Analyze): stage leads and managers see their stage's flow, where parts wait, each person's pace, redone work, and parts stuck, paused or with nobody on them.
- [x] **Import helper** (in the import wizard's preview, when rows have errors):
  - it fixes what it safely can: spaces, hidden characters, dates in other formats or as Excel numbers, numbers with commas or units, yes/no words, emails, links, values close to an allowed one, and list separators;
  - empty and repeated rows are removed;
  - it lists every change and shows a checklist of what is still wrong;
  - the rows can be edited in a table and checked again;
  - with the AI on, **Ask AI to fix the rest** suggests values for the cells still in error, to accept one by one or all.
  - Nothing is saved until the import is confirmed.
- [x] **Paste rows** (department sheets): statuses, types, priorities and people are matched to the closest known one, dates are rewritten, and each row's problems are shown before anything is added.

Built: `src/server/team-insights.ts`, `src/components/app/team-analyzer.tsx`, `src/server/import-assist.ts`, `src/lib/import-fix.ts`, `src/app/(app)/import-export/import-helper.tsx`.

## Phase 24: Presentations in the company's colours, with templates (done)

- [x] **Templates** (Admin, Presentation templates):
  - built in: Myseed (the brand, colourful), Myseed dark, International (formal, for partners and donors), Ocean and Sunrise;
  - Admin copies one to change its colours, chart colours, fonts, logo, cover (colourful circles, one colour, split or a picture), slide background, footer and slide numbers;
  - one is the default for every deck, and each deck can choose its own.
- [x] **Import a template** from PowerPoint, Google Slides (File, Download, .pptx), Keynote (Export to PowerPoint) or Canva (Download, PPTX). The app reads the file's theme: its twelve colours, heading and body fonts, the background picture and the logo on the slide master. .potx and Office .thmx theme files work too.
- [x] **On screen**: the deck shows in its template's colours and fonts (title marker, progress bar, chart colours, boxes, background, logo and footer).
- [x] **PowerPoint export in the template**:
  - a colourful cover with the logo;
  - an agenda made from the groups, and a coloured section slide at each group;
  - a master with the brand bars, logo, footer and slide numbers;
  - coloured number tiles and stage tiles, progress bars, editable charts in the template's colours, tables with a coloured header and banded rows, the explainer box;
  - a closing slide.
  - It opens in PowerPoint, Google Slides, Keynote and LibreOffice.
- [x] **Write slides by hand** in a deck: section title, bullet points, text, quote, picture, two columns, timeline, big numbers and closing. They are kept with the saved deck and go with share links.

Built: `src/lib/deck-templates.ts`, `src/server/deck-templates.ts`, `src/components/app/deck/pptx-export.ts`, `src/app/(app)/admin/templates-admin.tsx`, changes in `deck-player.tsx`, `decks.ts` and `deck-page.ts` (schema 47). Tests: `tests/server/presentations.test.ts`, `tests/e2e/presentations.e2e.mjs`.

## Phase 25: Strategic planning, monitoring and evaluation, to international practice (done)

- [x] **The plan** (Strategy and M&E): vision, mission, values, strategic pillars, dates, and the Red/Amber/Green thresholds (on track from 90% of the target, needs attention from 70%, by default). Start from a complete example and change it.
- [x] **The results chain (logical framework)**:
  - a goal (impact), then outcomes, outputs and activities, coded as in a logframe (G1, G1.O2, G1.O2.P1, G1.O2.P1.A3);
  - each result tagged with a Balanced Scorecard perspective and a pillar, with an owner and its assumptions;
  - activities carry their dates, status and budget.
- [x] **Indicators with a full reference sheet**:
  - definition, unit, which direction is better, calculation, disaggregation, data source, collection method, means of verification, frequency (monthly to yearly), who reports it, baseline and date, and a target for each period;
  - every indicator is checked against SMART and shows what is missing;
  - indicators can be read from the app (production, tasks, attendance, support...).
- [x] **Monitoring**:
  - the person responsible enters results each period, with a comment, and is reminded when a period ends without one;
  - a second person verifies each result (data quality), and a changed result needs verifying again;
  - achievement is measured from the baseline to the target, then rated Red, Amber or Green;
  - summaries for the whole plan, by pillar, by Balanced Scorecard perspective and by level.
- [x] **Risks**: a register with category, likelihood × impact (5 × 5), mitigation, owner, status and review date, shown on a heat map.
- [x] **Evaluations** by the OECD-DAC criteria (relevance, coherence, effectiveness, efficiency, impact, sustainability), each rated on a 4-point scale with evidence. Each has a summary, findings and lessons, and recommendations with the management response, owner, due date and status.
- [x] **Documents** (Word), in Myseed's look (colourful, brand banner) or an international format (formal cover, contents, numbered sections, "Page x of y"):
  - the strategic plan;
  - the M&E plan (logframe matrix, indicator reference sheets, data collection plan, reporting and data quality);
  - the performance report for a period, with results coloured by status and a narrative by the AI when it is on;
  - the KPI dictionary;
  - an evaluation report;
  - the logical framework on its own (landscape);
  - and the indicator tracking table and risk register in Excel.
- [x] **KPI library**: each KPI gets a reference sheet (Balanced Scorecard perspective, formula, data source, frequency, owner, why it matters), listed in the KPI dictionary.

Built: `src/lib/strategy.ts`, `src/server/strategy.ts`, `src/server/strategy-docs.ts`, `src/app/(app)/strategy`, `src/components/app/strategy/strategy-client.tsx`, `src/app/api/strategy/doc` (schema 48). Tests: `tests/server/strategy.test.ts`, `tests/e2e/strategy.e2e.mjs`.

## Phase 26: The document library for Dev and every department (done)

- [x] **Folders** inside folders, with the path shown and a tree on the side. A folder cannot go inside itself, and no two in one place share a name. Removing a folder keeps what is in it (it moves up).
- [x] **Documents and files together**: documents are started in the open folder from the templates. Any file (designs, PDFs, spreadsheets, exports, up to 15 MB) can be added, renamed, moved and deleted; only whoever added a file, or a head, deletes it.
- [x] **Search** through titles, the text inside documents (with the matching words shown), and file and folder names.
- [x] **Pinned** documents (each person's own) and **recent** documents on the side. Any document can be duplicated.
- [x] **Import**: a Word (.docx), Markdown, text or web page file becomes a document, with its headings and lists kept.
- [x] **Export**: a real Word file (.docx with headings, lists, tables, bold and code), Markdown or HTML, from the list or the editor.

Built: `src/server/dev-library.ts`, `src/components/app/doc-library.tsx`, `src/app/api/dept-library/[id]`, `src/app/api/dept-docs/[id]` (schema 49). Tests: `tests/server/library.test.ts`, `tests/e2e/library.e2e.mjs`.

## Phase 27: Integrations: Office, Power BI, Notion, and any platform by its API (done)

- [x] **Microsoft Office**: any dataset downloads as an Excel workbook (a formatted table with filters), a Word document or a PowerPoint deck, in Myseed's colours. Documents, strategy reports and presentations already export to Word and PowerPoint from their own pages.
- [x] **Power BI, live Excel and Google Sheets**: each new feed key gives a Power BI data source file (.pbids, opens Power BI Desktop on the feed), the Excel Power Query, and a Google Sheets IMPORTDATA formula.
- [x] **Notion**: Admin connects an internal integration and a page. Library documents go to Notion as pages (headings, lists, code, quotes) and Notion pages come back as documents; datasets go to Notion as databases.
- [x] **Integrate a platform** (no code, no AI):
  - give the address of a provider's API documentation, its OpenAPI or Swagger file (JSON or YAML), or paste it;
  - the app finds the spec from the page (Swagger UI, Redoc, the usual addresses) or reads the page's curl examples;
  - it chooses the operation that fits (send an SMS, send an email, start a payment), matches its fields to the app's, and sets up the sign-in (API key, bearer, basic or OAuth client credentials);
  - Admin reviews it, adds the keys (kept sealed), sends a real test, and switches it on.
  - Ready presets: AfroMessage, Africa's Talking, Twilio, SendGrid, Brevo, Mailgun, Chapa, Paystack, Stripe.
  - Once on: the app sends SMS, the app's own email can go through an email provider instead of SMTP, and Finance and Admin can make payment links.
  - Every call is logged without secrets or message text.

Built: `src/server/connectors.ts`, `src/lib/connector-match.ts`, `src/server/notion.ts`, `src/server/office.ts`, `src/app/api/office/[dataset]`, `src/components/app/integrations-hub.tsx`, `src/app/actions/connect.ts` (schema 50). Tests: `tests/server/integrations.test.ts`, `tests/e2e/integrations.e2e.mjs`.

## Phase 28: Admin, Platform: database, API usage, status and deploys, developer integration, system health (done)

- [x] **Database**:
  - what it is and its version, size, speed, connections and schema version;
  - every table with its rows and size, and whether backups include it;
  - a read-only query console: SELECT, WITH, EXPLAIN or SHOW, one statement, read-only transaction, stopped after 5 seconds, 500 rows. Passwords, keys, tokens and file contents are hidden, and every query is audited.
- [x] **API usage**: calls to the app's own APIs (data feeds, the support SDK, Office and strategy downloads, health, cron) per day and per API, with errors, average and slowest time. Also calls out to connected platforms, AI questions, and when each feed key was last used.
- [x] **Status and deploys**:
  - the running version, build, commit, host, Next.js and Node, and how long it has run;
  - each part's status: database, jobs, backups, errors, email, storage, Google, encryption key, cron, AI and each connected platform;
  - errors per day over two weeks, and the history of deploys, noted each time a new build starts.
- [x] **Developer integration**: every API with its method and purpose, the app's own OpenAPI file (`/api/openapi.json`, for Postman, Swagger UI or code generators), copyable examples (feeds, support from another app, the widget, uptime checks), the feed keys and the support apps' keys.
- [x] **System health**: a score out of 100 from every check, plus database speed, memory, disk, processor load, the email queue, connected platforms, API errors, failing or late jobs, and the slowest pages.

Built: `src/server/platform.ts`, `src/app/(app)/admin/platform`, `src/app/api/openapi.json`, `src/app/actions/platform.ts`, API counting in the routes (schema 51). Tests: `tests/server/platform.test.ts`, `tests/e2e/platform.e2e.mjs`.

## Phase 29: Designed for phones (done)

- [x] **A bottom tab bar**, as in a phone app: Home, Work (the person's department or production), Chat and Alerts with their counts, and More, which opens the full menu.
- [x] **A compact view** by default: page explanations, card descriptions and table columns after the fourth (the last one, usually actions, stays) are left out. The **Details** switch in the top bar shows everything, and the choice stays on the phone.
- [x] **Touch-friendly**: bigger buttons, no zooming when typing, the assistant's button above the tab bar, and the chat button moved from the top bar to the tab bar.

Built: `src/components/app/mobile-nav.tsx`, phone styles in `src/app/globals.css`. Tests: the phone checks in `tests/e2e/mobile.e2e.mjs`.

## Phase 30: The assistant follows the role, and does HR's work (done)

- [x] **View as**: switching role while viewing as someone shows their other role (their session is never touched); errors from the switcher are a message, never a broken page.
- [x] **Only what the role can do**:
  - the assistant gets the list of pages the person can open (the same rules as the pages), and opens or suggests nothing else;
  - its tools and actions follow the person's rights: HR's for HR, the analyzer for leads, tickets for support agents, approvals for approvers;
  - anything else is refused even if asked for;
  - typed and spoken "open …" only go to the person's pages, and suggestions follow the role (HR, leads, members).
- [x] **Never breaks**: a failing AI call, network or tool becomes an answer in the panel; a plain member can open every page safely (checked in the browser).
- [x] **Better at multi-step work**: it plans, reads first, acts or proposes, then sums up; it asks one question when a detail is missing.
- [x] **HR's work**:
  - looking people up, an employee in full, today's attendance (late, absent, not in), the leave queue, what falls due (probation, contracts, documents) and the year's people numbers;
  - recording someone's day, logging a missed check-in or out, approving leave, adjusting balances, opening a case, recording a one-to-one, assigning training, drafting a job opening and posting announcements;
  - in Agent mode it does these itself, logged and audited.

Built: `src/server/page-access.ts`, changes in `src/server/assistant-ai.ts`, `src/server/assistant-ops.ts`, `src/server/auth.ts`, `src/components/app/assistant.tsx`. Tests: `tests/server/assistant-roles.test.ts`, `tests/e2e/access.e2e.mjs`.

## Phase 31: Handovers: approvals, rejections, report (done)

- [x] **Approvals lists what waits**: each handover batch on its own row with the sender and date, accepted whole right there; rejections to cross-check; and work sent to the lead, approved right there. Handovers keeps its own page, with Rejected, Report and Settings beside it.
- [x] **A rejection is checked first**: it waits on Handovers, Rejected, and holds the part. Someone other than the person who rejected it (by default the lead of the team whose work it was, or a manager) says it is right, so it goes to that team's To do at high priority, first on the board and with the reason on the card; or says it is wrong (with why), so the part moves on. A rejection outside a batch goes through the same check.
- [x] **The report**: for every part, when it was sent, when it was accepted or rejected, by whom, why, how long it took and how the check went; filters, totals and export.
- [x] **Booking a studio is optional**; Handovers, Settings can also require it or turn it off. The same page sets the cross-check, who does it and the priority.

Built: `src/server/handover-config.ts`, `src/server/handover-report.ts`, changes in `src/server/editorial.ts` and `src/server/workflow.ts`, `src/app/(app)/handovers/{rejected,report,settings}`, `src/app/(app)/approvals` (schema 52). Tests: `tests/server/handovers.test.ts`.

## Phase 32: Fixing the curriculum, and auto-assign (done)

- [x] **Curriculum, Fix** finds slips in subject names, a subject in one grade of a school level it does not otherwise belong to, two units typed as one, placeholder unit and part names (with a name from the video when it has one) and messy camera codes; fixed one at a time or all suggestions together.
- [x] **Browse and edit**: rename subjects, units and parts, change numbers, move a subject to another grade, merge two subjects, move a unit or a part. Work and placement move too; item codes stay.
- [x] **The four teams correct lesson and part names**, on the Curriculum page or right on their work card. Admin chooses which teams, and whether leads may move things. Every change is listed, and a corrected name stays when something is imported again.
- [x] **Auto-assign per team**: rules by grade and subject, then whoever has least open work or in turn; applied when work arrives, and on demand to parts already waiting. Off by default.

Built: `src/lib/curriculum-names.ts`, `src/server/curriculum-fix.ts`, `src/server/auto-assign.ts`, `src/app/(app)/curriculum`, `src/app/actions/curriculum.ts`. Tests: `tests/server/curriculum-fix.test.ts`.

## Phase 33: Routines: forms from a file, edit and delete (done)

- [x] **Fill a form from a file**: a routine's asked fields are the columns of a set template; each row is one run, checked first, kept in the file's order, and approved as one.
- [x] **Import a routine** from the steps template or an exported JSON file.
- [x] **A page per routine**: change, reorder, add and remove steps, choose what is asked each time, duplicate, export, delete with a confirmation. Someone else's shared routine can be copied.
- [x] Admin, Assistant turns imports on or off and sets the most rows in a file.

Built: changes in `src/server/routines.ts`, `src/app/(app)/routines/[id]`, `src/app/api/routines/[id]/template`. Tests: `tests/server/routines-import.test.ts`.

## Phase 34: The Legacy catalog for the Recording team (done)

- [x] **The old flow, in this app's look**: Grades by school level, a grade's subjects, units as chapters, then parts and video shots by camera code; a bar with where you are, the totals, Word, Backup and Import; add, edit and delete at each level.
- [x] **Everything is real**: a part is planned work, a shot is a recording on it, and Mark recorded sends it to Editing's incoming. Camera codes are tidied, a part with no name takes its video's title, and the same subject typed a little differently is not a second subject.
- [x] **The old backup imports**, checked and tidied first: stray letters, two units typed as one, unnamed parts, codes. Importing again updates the same rows. Tried on the real backup: 8 grades, 351 units, 450 parts and 462 videos.
- [x] Admin sets whether it shows, what happens after a shot is logged, and whether imported parts count as recorded.

Built: `src/server/legacy.ts`, `src/app/(app)/legacy`, `src/app/actions/legacy.ts`, `src/app/api/legacy/[format]`. Tests: `tests/server/legacy.test.ts`, and all four phases in the browser in `tests/e2e/production.e2e.mjs`.

## Phase 35: Phones, settings, leaving the site, leave for staff, calls (done)

- [x] **Settings in one page** (account menu, Settings; Tools, Settings): appearance, font, contrast, text size, language and dates, notifications (moved from the Notifications page), help, calls and location. Choices wrap on a phone instead of opening menus that ran off the screen; the nested menus stay on computers only.
- [x] **Tools in the tab bar** instead of Alerts: alerts, check-in, search, the assistant, approvals, routines, help and Settings in one sheet.
- [x] **Help as each person wants it**: hide or pin chapters, add other roles' chapters (managers), hide guides; for all their devices or this device only. Tips and the page help links can be turned off on a device.
- [x] **Leaving the site** (Attendance, Capture): while someone is checked in, their phone reports where it is. Outside twice in a row, they are told; after the grace time the app only reminds, starts a break, checks out, or starts a break and checks out later, as Admin chose. Coming back ends the break. Weak readings are ignored, each person agrees once per phone, and someone whose phone went quiet outside is dealt with by the regular checks. Phones stop web apps in the background, so it works while the app is open.
- [x] **Leave for staff**: balances and leave settings are HR's (HR can show balances again). People ask HR a question or a correction, and HR answers. Sick leave needs a photo or PDF of the evidence, kept on the HR record; HR cannot give the final approval without it, and evidence can be added later.
- [x] **Calls**: a speaker or earpiece switch on both call types; voice calls start at the ear on phones. Where the browser allows choosing the output it uses the earpiece; otherwise ear mode plays quietly. The proximity sensor (where the browser gives it) darkens the screen at the ear; the screen stays on during calls.
- [x] **Chat on phones** like Telegram: the conversation fills what the keyboard leaves and the message box stays right above it; the tab bar and the assistant's buttons step aside inside a conversation.

Built: `src/app/(app)/preferences`, `src/components/app/mobile-nav.tsx`, `src/components/app/help-center.tsx`, `src/server/geofence.ts`, `src/components/app/attendance/geofence-{watch,admin}.tsx`, changes in `src/server/leave.ts` and `src/components/app/hr/leave.tsx`, `src/components/app/audio-route.tsx`, chat layout (schema 53). Tests: `tests/server/geofence.test.ts`, `tests/server/leave-staff.test.ts`, `tests/e2e/phone.e2e.mjs`.
