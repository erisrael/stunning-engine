# Myseed Content Manager Runbook

This runbook is for the people who run the Myseed Content Manager: the workspace administrator, managers, and staff in Recording, Editing, Uploading and Publication. It covers local setup, the database, deploying to Netlify with Supabase, accounts and permissions, the daily workflow, imports, reporting, backups and troubleshooting.

All times are stored in UTC and shown in the workspace timezone, Africa/Addis_Ababa (UTC+3), unless it is changed in Settings, Workspace.

---

## 1. Local quick start

Requirements: Node.js 22 or newer and npm 10 or newer.

```bash
npm install
npm run setup        # empties the database, loads accounts, chat groups and the real curriculum, writes import templates
npm run dev          # http://localhost:3020
```

Without `DATABASE_URL` the app uses an embedded PostgreSQL (PGlite) stored in `data/pg`. It runs the same SQL as Supabase, so nothing changes between your machine and production. Stop `npm run dev` before running any `db:` command against the embedded database, because only one process can open it at a time.

The starting accounts are listed in [USERS.md](USERS.md). `npm run db:reset` prints each person's generated password and saves them to `data/initial-credentials.md` (never committed).

---

## 2. Database commands

| Command | What it does |
| --- | --- |
| `npm run db:reset` | Deletes all data, then loads settings, the five accounts (with team leads), chat groups and the curriculum in `data-import/curriculum.json`. One production item is created per part; parts with videos are marked recorded and moved to Editing. New passwords are generated each time. |
| `npm run db:reset -- --no-items` | The same, but loads only the curriculum structure (no production items). |
| `npm run db:reset -- path/to/backup.json` | The same, using another curriculum backup file. |
| `npm run db:empty` | Deletes all data, including accounts. |
| `npm run db:empty -- --keep-accounts` | Deletes the curriculum and all production data; keeps accounts and settings. |
| `npm run db:import -- path/to/backup.json` | Adds or updates a curriculum backup in the current data. Safe to run again. |
| `npm run db:status` | Row counts. |
| `npm run backup` | Writes every table to `backups/myseed-YYYYMMDD-HHMM.json`. |
| `npm run db:restore -- backups/file.json` | Replaces all data with a backup file. |
| `npm run db:bulk-restore -- backups/file.json` | Replaces all data with a backup file using batched inserts. Use this instead of `db:restore` when the database is remote (Supabase): the same restore finishes in seconds instead of hours. |
| `npm run templates` | Writes the import templates to `templates/` (not committed; the app builds them on demand). |
| `npm run checks` | Runs the scheduled alert checks once. |
| `npm run verify` | Runs 66 workflow, permission and import checks against a throwaway database. |

Every command uses `DATABASE_URL` when it is set, so the same commands work against Supabase (section 3.4).

### 2.1 Rebuilding with real data

1. Export the latest backup from the curriculum tracker (the JSON with grades, subjects, units, parts and videos).
2. Either replace `data-import/curriculum.json` and run `npm run db:reset`, or sign in as Admin and use **Admin, Data**:
   - **Download full backup** first.
   - **Empty workspace** (type `EMPTY`; keep accounts and settings if you want people to stay signed in).
   - **Import curriculum backup** and choose the JSON file.

How the backup maps to the app:

| Backup | App |
| --- | --- |
| `grade-5` ... `grade-12` | Grades G05 to G12 (the type, for example Middle School, is kept as the level) |
| Subject name | One subject per name across grades, with a short code (MATH, ENG, GSCI, SOC, ENVS, CHEM, PHYS, BIO, HIST, GEO, ECON) |
| Unit | Unit, numbered in the order of the backup; "Unit 3:" or "ምዕራፍ 3:" prefixes are removed from the title |
| Part | Part (planned lesson) and one production item |
| Video | A raw recording on that item, identified by its camera code, with the video title and description |

Re-importing matches units, parts and videos by their IDs in the backup, so nothing is duplicated. A video added to a part that has already left Recording is reported as a warning instead of being added.

---

## 3. Deploying online

Step-by-step instructions for putting the app online for free (Netlify plus a Supabase database), with the free-plan limits and alternatives, are in [DEPLOY.md](DEPLOY.md).

---

## 4. Accounts, roles and permissions

### 4.1 People and profiles

**Admin, People** lists everyone with their roles, access, last sign-in and active sessions. Open a person to edit their profile (name, email, @handle for mentions, phone, job title, about), roles, access, weekly hours per stage, and sign-in:

- **Add person**: leave the password empty to generate a temporary one (shown once), or type one. Ask them to change it at first sign-in.
- **Reset password** (key icon): issues a new temporary password and signs them out.
- **Sign out everywhere** (exit icon): ends all their sessions.
- **Active** off: keeps all history and signs them out.
- **Import many**: the Users and access template in Import and export.

People edit their own profile and password under the avatar menu, **Profile and preferences**.

### 4.2 Roles and teams

Six roles; a person may hold several:

| Role | Purpose |
| --- | --- |
| Recording, Editing, Uploading, Publication | Work their own stage. |
| Manager | Plans and runs production; can act on any stage. |
| Admin | People, permissions, teams, access and workspace data. Not a production role. |

**Admin → Teams** shows each stage's team. Switch on **Team lead** for the people who run a team (several per team, and one person can lead several). Leads assign their team's work, are alerted whenever work arrives in their stage, see Reports and Team, and can import their stage's progress. Switch on **Own work only** for members who should see just the items assigned to them; they get a personal **My work** board.

The role switcher in the top bar changes which home page and defaults someone sees. It never grants anything they do not hold.

### 4.3 Permissions

**Admin, Roles and permissions** is a matrix of abilities per role: creating and releasing items, planning fields, manager override, emergency release, imports, exports, audit export, reports, team view, timer corrections, chat groups, tracked questions, workflow settings, user management and data management. A person gets everything granted to any of their roles. Admin or Manager must keep **Manage users**, so the workspace cannot lock itself out.

Stage work itself is not a switch: only the stage role (the owner, or anyone in that role while unassigned) and managers can change a stage, and only while the item is in it. Everyone else can view and comment.

### 4.4 Access

Access limits which grades and subjects someone sees. No access rows means everything. Each row allows one grade, one subject, or one grade and subject pair. Access applies everywhere: lists, sheet, search, exports, comments, chat item links and notifications. **Admin, Access** shows who can see each grade.

---

## 5. How work moves

Every production item is one deliverable, normally the main video for one part. It moves through four stages: **Recording, Editing, Uploading, Publication**. Draft is before production; Published, Archived and Cancelled are outcomes.

### 5.1 Status names

| Status | Meaning |
| --- | --- |
| Not started | The item has not reached this stage. |
| To do | In the stage, not started yet. |
| In progress | Someone has a timer running. |
| Paused | Started, timer stopped. |
| Blocked | Cannot continue; a cause and resolver are recorded. |
| Submitted | Handed off, waiting for the next stage to accept. |
| Done | Accepted by the next stage (or live, for Publication). |

Uploading also shows Uploading, Processing and Upload failed. Publication shows In review, Changes requested, Approved, Scheduled, Published and Release failed.

Coverage and Overview use four simpler values per stage:

| Value | Meaning |
| --- | --- |
| **Done** | The stage is complete. |
| **In process** | The part is in this stage now, including a submitted handoff not yet accepted. |
| **Missing** | Nothing recorded yet where work is needed: no item, or a draft that was never started. |
| **-** | The stage has not been reached yet. |

### 5.2 The normal handoff

1. The owner presses **Start**. Assignment alone never starts a timer.
2. They log the required files and tick the required checklist items. The item shows every requirement and whether it is met.
3. **Submit handoff** stops their timer and sets the stage to Submitted. The next owner is notified; with no next owner, managers are alerted.
4. The receiver presses **Accept** (the next stage opens as To do) or **Return** with a reason and a specific note (the submitting stage gets a new attempt).

### 5.3 Evidence required before handoff

| Stage | Required before submit |
| --- | --- |
| Recording | At least one recording logged for this attempt, by camera code (for example C001), storage link, or both; raw duration if that policy is on; required checklist items. |
| Editing | Current edited master; captions and thumbnail if the policies require them; final duration; required checklist items. |
| Uploading | For every required destination: uploaded with an ID or link, uploaded version equal to the current master, playback verified (if required) and metadata verified; required checklist items. |
| Publication | Final approval by a Publication reviewer (and a manager if that policy is on); every required destination confirmed live with a link. |

Requirements and checklists are set in **Settings, Workflow**.

### 5.4 Blockers, pauses and timers

- **Pause** at the end of the day, for breaks and when switching tasks.
- **Mark blocked** when something outside your control stops you. Choose a cause, describe what is needed, name who can resolve it. Blocked time is measured separately.
- One person keeps one running timer. Timers left running past the stale threshold (10 hours by default) ask for the real stop time.
- To fix a wrong timer, open the item, Workflow tab, **Request correction**. A manager approves it in Team, Timer corrections. Original times are always kept.

### 5.5 Returns, reopened stages and revisions

- **Return** (receiver): the same stage gets a new attempt.
- **Request upstream changes** (any later stage): reopens an earlier stage; approvals and uploads tied to replaced files become invalid.
- **Start revision** (managers, on published items): creates a linked revision; the live version stays published.
- **Archive or cancel** needs a reason; closed items stay auditable and can be restored.

---

## 6. Daily use by role

**Recording**: open Home for your queue. On the item (or its Page view), **Start recording**, then **Log recording** for each camera shot: camera code, title and description, with a storage link if you have one. Tick the checklist and **Submit handoff**.

**Editing**: accept incoming recordings or return them with a reason. **Start editing**, link the master, captions and thumbnail, enter the final duration, tick the checklist, submit.

**Uploading**: accept approved masters, **Record upload** per destination (ID or link), verify playback and metadata, submit.

**Publication**: accept, review, schedule, and **Confirm live** per destination with the live link.

**Managers**: start with Home (organization overview) and its Exceptions list; assign owners and deadlines from the Sheet (Manager master sheet) or the Board; check Overview and Coverage weekly; use Reports and Team for trends and capacity.

**Admin**: Admin, People for accounts; Roles and permissions; Access; Data for imports, backups and emptying.

---

## 7. Views

All views share the filters in the address bar, so switching views keeps the filter. Copy the address to share a view; the receiver only sees what their access allows.

| View | Use |
| --- | --- |
| **Home** | Managers and admins: the Overview insights (done per stage, by grade, by week) and quick actions. Stage roles: their worklist, attention panel and schedules. |
| **Overview** | Simple status report for everyone. Choose **Grade → Subject** or **Subject → Grade**, and **Table** (grade, subject and unit cells merged across their rows), **Hierarchy** (expandable grade, subject, unit, part) or **Dashboard** (how much is done in each stage, by grade or subject and by week). Filter by grade, subject or status (for example "Recording: Missing"), search by camera code, and download CSV. |
| **List** | Every part grouped Grade → Subject (or Subject → Grade, or flat) with merged cells, like the Overview. Default columns: stage, the four stage statuses and the recorded, edited, uploaded and publication dates. Table, Cards and Curriculum layouts. **Click a row** to open its Page view; **right-click** for every action. |
| **Sheet** | Spreadsheet-style presets per role. Every column, including Grade, Subject, Unit and Part, can be hidden in Columns; the ones shown stay frozen on the left. Only your stage's cells are editable; locked cells explain why. Comment on any cell. |
| **Board** | Team board: drag a card to the next stage when it is ready (the next team's lead is notified). Cards you may not move show a lock. **My work**: your own items by status (To do, In progress, Paused, Blocked, Sent to next team). Click a card to open it, right-click for actions. |
| **Calendar** | Recording sessions, scheduled releases, publications and due dates. |
| **Coverage** | **Matrix**: grade by subject (or subject by grade), shaded by the share done for **Overall** or one stage (Recording, Editing, Uploading, Publication). Click a cell for its **Units and parts**: every unit and part with a row of Recording, Editing, Uploading and Publication status. |
| **Reports** | Throughput, timing, on-time delivery and rework, with the printable summary. |
| **Team** | Workload, capacity and timer corrections (managers); your own effort (staff). |

### 7.1 Item detail and Page view

Every item has two views:

- **Detail view** (`/items/<id>`): tabs for overview, workflow, assets, discussion and full history.
- **Page view** (`/items/<id>/form`): a document-style form. Planning properties are at the top, then one section per stage with its fields: recordings with camera codes, files, durations, destinations, release and notes. Previous and next buttons move through the parts of the same grade and subject in curriculum order.

In the Page view each section says whether you can edit it. You edit only your own stage while the item is in it, and managers edit planning fields. Everything else is read-only for you, but every field has a comment button (hover the field), so you can ask about or flag anything without changing it. Comments count on the field and appear in the item's discussion.

---

## 8. Chat

The chat icon in the top bar opens **Chat**, with an unread badge. It works like Telegram.

**Direct messages are end-to-end encrypted.** Start one with the pencil icon at the top of the chat list. The first time, each person chooses a **chat passphrase**. It protects their private key, which is created and kept in their browser; the server only ever stores encrypted messages and cannot read them, and neither can administrators. Enter the passphrase once per device. It cannot be recovered: a forgotten passphrase means old direct messages can no longer be read on a new device. Group chats are not end-to-end encrypted, so managers can moderate them.

**Workflow cards.** **Request a redo** (right-click a row, or the item menu) asks the team that did a stage to do it again: Retake recording, Re-edit, Re-upload or Re-publish. It reopens that stage, posts a request card in that team's group chat with a link to the item, and alerts the team's lead. **Ask a question** sends a tracked question to anyone you choose; it appears in their notifications, in Questions, and as a card in your direct chat with them. Cards are created by the server and are not encrypted.

In groups:

- Groups on the left with the last message and unread count; the conversation on the right with date separators, replies, edits, deletes and pinned messages.
- Enter sends; Shift+Enter adds a line. `@handle` mentions a member and notifies them; `@all` notifies the whole group. Replying to someone notifies them too.
- Writing an item code such as `MY-G09-MATH-U01-L02` attaches a link to that item.
- **Mute** a group to drop it from the unread badge.
- **Group info** (click the group name) shows members and pinned messages.

Managers and admins (the **Create chat groups and manage members** permission) create groups, add and remove members, make group admins, rename, recolour and archive groups. Group admins can manage their own group. Managers can open any group, including ones they are not in, and join it.

---

## 9. Imports and exports

**Import and export** runs a wizard: choose template, upload, map columns, preview (a dry run), confirm. If rows have errors you can import only the valid rows, then download the error rows, fix them and import that file. Importing the same file twice does nothing the second time.

| Template | Who | Matching and rules |
| --- | --- | --- |
| Stage progress | Every stage role, for their own stage | Mark parts done (with date and evidence) or in process. Find parts by item code or by grade, subject, unit and part number. A stage can only be done after the stages before it. This is how a team fills in work done outside the app, for example the Editing team's list of edited parts. |
| Curriculum inventory | Managers | One row per part; matched by grade code, subject code, unit and part number. |
| Production plan | Managers | Creates draft items or updates by `item_code`. Never changes workflow status. |
| Users and access | Managers, Admin | Matched by email; roles, access and capacity are replaced. |
| Recording schedule | Recording, Managers | Matched to items by code. |
| Historical migration | Managers | Older content; excluded from timing metrics. |

Every template can be uploaded as **CSV, Excel or JSON**. Download an example in any of the three from the Templates list.

The curriculum tracker JSON (the Recording team's file) is imported in **Import and export → Curriculum tracker JSON** (managers, data admins and the Recording team lead) or **Admin → Data**. **Export → Curriculum tracker JSON** writes the same structure back with each part's stage progress added (`progress` and `itemCode` fields), so it can be imported again without breaking the file.

**Export** (List, Sheet, or Import and export) opens one dialog. You choose:

- **Format**: Excel, CSV, PDF report, JSON (data), curriculum tracker JSON, and for managers metadata and audit JSON.
- **Rows**: filtered, page or selected.
- **Columns**: as shown, Overview set, or every column.
- **Grouping**: Grade → Subject, Subject → Grade, or flat. Excel merges the grade, subject and unit cells.
- **Stage dates**: whether to include them.

Your choices are remembered. The **PDF report** opens a print-ready page with a stage summary and the grouped table; set filters and page orientation there, then **Save as PDF**. Exports respect access, escape spreadsheet formulas, and contain links and camera codes, never media.

---

## 10. Reporting definitions

| Measure | Definition |
| --- | --- |
| Initial queue time | Stage entry to first start. |
| Active processing time | Time when at least one person had a timer running on the stage. |
| Labor effort | Sum of everyone's session durations. |
| Blocked, paused, handoff wait | Separate intervals that add up to stage residence with queued and active time. |
| Production lead time | Release to production through confirmed publication. |
| Parts recorded (Coverage) | Parts whose Recording stage is Done. |
| Published | Items confirmed live on every required destination. |
| First-pass acceptance | Share of submitted handoffs accepted without a return. |
| On time | Due-in-period cohort against the current and original deadline. |

Imported recordings are counted as recorded but carry no timing, so they never distort turnaround figures. Figures with fewer observations than the minimum sample (5 by default) show as Insufficient data. Staff are never ranked.

---

## 11. Configuration

**Settings** (the Change workflow settings permission) holds: Curriculum (grades, subjects, offerings, units, parts), Workflow (policies and checklists, including whether raw duration is required), Destinations, Calendar and alerts (workdays, hours, holidays, thresholds), Lists, and Workspace (name, timezone, code prefix). People, roles, permissions and access are in **Admin**. Every change is in the audit log.

---

## 12. Backups and restore

- **Admin, Data, Download full backup**, or `npm run backup`, writes every table to one JSON file. Keep copies off the machine.
- `npm run db:restore -- file.json` replaces all data with a backup. Against Supabase, set `DATABASE_URL` to the session pooler first (section 3.4).
- On Supabase paid plans, daily backups and point-in-time recovery are also available in the dashboard. You can also run `pg_dump` with the session pooler string.
- Files are not stored in the app; only camera codes and links are.

---

## 13. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| "Required evidence is missing" | The item lists each requirement. Log the missing recording or file, or tick the checklist, then submit again. |
| "This item changed while you were working" | Someone else updated it. Load the latest values and repeat your change if it still applies. |
| A section or cell is locked | The lock names the stage or person responsible. Ask a manager to reassign if needed. You can still comment. |
| A person cannot see an item or a grade | Check their access in Admin, People (or Admin, Access). |
| Someone sees "You are not a member of this group" | A manager or group admin adds them in the group's info panel. |
| `db:` command says the database is in use | Stop `npm run dev` first (embedded database only). |
| Login fails for a correct password | The account may be deactivated (Admin, People), or the password was reset. Emails are not case sensitive. |
| Alerts did not arrive overnight | Check the scheduled-checks function log and `CRON_SECRET` (section 3.5). |

---

## 14. Data handling

- History is append-only. Corrections add new events; nothing is rewritten.
- Deleted comments and chat messages leave a marker. Deactivated users keep their history.
- Emptying the workspace and downloading backups are recorded in the audit log with who did it.
- Workflow approvals happen only through workflow actions; a comment or chat message saying "approved" approves nothing.
