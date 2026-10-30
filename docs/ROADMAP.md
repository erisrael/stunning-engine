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

Full plan: [DEPARTMENTS_PLAN.md](DEPARTMENTS_PLAN.md). In short:

- [ ] Configuration per department in Admin: names, statuses (with category, colour, limits, rights), task types, custom fields, priorities and labels, project template, KPIs, position rights, notifications, optional features; new departments from templates
- [ ] Department home dashboard: widget library (cards, charts, lists, calendar, activity), layout set by the head per position and adjustable per person, dashboard filters, selection for Owners
- [ ] Views like the workflow: Overview tree, List (columns, grouping), Sheet, Board (swimlanes, limits), Calendar, Timeline, Team and workload, Reports; saved views shared or private
- [ ] Checklists, reviews, requests between departments, subtasks and dependencies, time tracking, automations, sprints
- [ ] Studio on the same footing

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

