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

## Phase 2: Editorial workflow

- Assign wizard: Grade → Subject or Subject → Grade, multi-select parts, assign to one or several people at once (optionally split evenly), with due date and checklist
- Notify the next team, leads and managers when a stage imports its work
- Handover batches: the sender hands over a batch; the receiver accepts all or some, or marks files missing with a note; missing files return to the sender and lead
- Configurable checklists per person (templates set by the team lead); per-line "lead must verify" switch; final "files received" verification by the lead

## Phase 3: Chat

- File storage (Supabase Storage in production, local folder in development)
- Automatic end-to-end keys (no passphrase to type), protected by the login password
- Voice messages, deleted 10 minutes after first play (7-day maximum)
- File upload, reactions, polls, stickers, GIFs, editing, pinning, answering questions in chat
- Channels managed by their creator
- Push notifications (Web Push and installable app) for browser and phone
- Calls: Google Meet links through a connected Google account; optional 1:1 in-app calls

## Phase 4: Email

- SMTP settings (works with a Gmail app password, Google Workspace, Zoho)
- Send permission (`email.send`) Admin can give to anyone; composer, templates, recipients by person, role or department, sent log
- Per-employee sender addresses (mailboxes are created at the email provider)

## Phase 5: Departments and new modules

- Departments with Head, Lead and Member; each department sees only its own area, members see only their own work
- Dev team (`/dev`): projects, milestones, tasks board, progress, task assigner
- Studio (`/studio`, content manager): notes, exams with question bank, flash cards, linked to grade, subject, unit and part
- Marketing (`/marketing`): campaigns, content calendar, tasks, KPIs
- Owners (`/owners`): read-only stats across departments, product counts, department reports
- Chat directory rules: owners hidden from members and leads unless allowed; managers and admins can contact owners; owners can contact anyone

## Phase 6: Overview visualizer, help and onboarding

- **Visualizer mode on Overview**: a full-screen presentation that runs by itself, cycling through grades and subjects with progress per stage, recent completions and what is next. Meant for a wall screen or a meeting. It has play/pause, speed and filters, follows the current Overview filters, and refreshes its data while running.
- **Help section under Profile** (`/profile/help`):
  - User training manual, one chapter per role (Recording, Editing, Uploading, Publication, Team lead, Manager, Admin, and later each department), with screenshots
  - Workflow guides: step-by-step walkthroughs of common tasks (start and submit work, accept a handoff, import progress, assign work, fix data in the Data manager, restore from Trash)
  - Searchable, with links from each page's header to the matching chapter
- **Tooltips**: short explanations on buttons, status chips, columns and filters across the app, written once in one place so wording stays consistent
- **Get started**: a first-login tour for new users with short animations showing their role's daily flow, a checklist of first steps, and a "Replay tour" option in Help. Progress is saved per user, so the tour shows only once unless replayed.
