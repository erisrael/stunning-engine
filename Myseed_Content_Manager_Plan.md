# Myseed Content Manager — Product and Workflow Plan

Version 1.1 · 26 October 2026 · Proposed specification, including the supplied handoff-table reference

## 1. Product goal and operating assumptions

Create one workspace for producing educational content through **Recording → Editing → Uploading → Publication**. Every lesson has a visible owner, next action, deadline, files, discussion, and complete event history. Staff see their own actionable work; managers see delivery health and the evidence behind delays and capacity needs.

Keep exactly five roles: Recording, Editing, Uploading, Publication, and Manager. A person can hold multiple roles, with an explicit role switcher. Grade/subject access is a separate scope, not another role. Proposed default: managers also manage assignments, priorities, deadlines, taxonomy, and team access; operational staff update their assigned stage.

One production item represents one deliverable, normally a lesson video with its supporting assets. A lesson can have multiple deliverables, such as a main video, revision clip, and worksheet, linked by a parent lesson. Do not use one task for an entire subject. One canonical item may belong to multiple grade/subject collections without being duplicated.

This is a workflow system, not a video editor or learning platform. Initial publication can be tracked using verified platform links; automated platform integration is a later, separate scope. No staffing levels, turnaround targets, or launch dates below are claims about Myseed's current operations.

## 2. Curriculum structure and lesson record

Use: **Curriculum/version → Academic year or production cycle → Grade → Subject → Unit/chapter → Lesson → Deliverable**. Language, term, content format, and tags are independent filters. Curriculum membership supports shared content across grades and subjects. Keep a primary membership for additive reports, with optional secondary memberships for discovery.

Each production item includes:

- Immutable item ID and a readable code, such as MY-G08-MATH-U02-L04.
- Lesson title, learning objectives, curriculum mappings, grade, subject, unit, lesson order, language, academic year, and content type.
- Teacher/presenter as metadata, target duration, actual final duration, and complexity band with a short justification.
- Priority, planned publication date, destination platforms, assigned owner for each stage, and collaborators.
- Current stage, stage status, checklist, blockers, next action, and next-action owner.
- Raw assets, edited master, captions/transcript, thumbnail, supporting documents, and version-specific links.
- Planned and actual dates, work sessions, event history, comments, approvals, revisions, and publication evidence.

Create items manually, in bulk from a curriculum plan, or through import. Distinguish curriculum targets from existing production items: coverage requires a planned lesson inventory, not just a count of uploaded videos.

## 3. Workflow and handoff rules

Draft/planned is a pre-production state; Published and Archived are lifecycle outcomes. They do not add production stages.

| Stage | Main work | Required handoff evidence | Next receiving role |
| --- | --- | --- | --- |
| Recording | Schedule presenter/session, record, check raw audio/video | Raw files, take notes, duration, completed recording checklist | Editing |
| Editing | Cut footage, clean sound, add graphics/captions, prepare final assets | Approved master version, captions if required, thumbnail, edit checklist | Uploading |
| Uploading | Transfer approved files, map lesson metadata, verify processing and playback | Destination item ID/link, uploaded version, playback check, metadata check | Publication |
| Publication | Check educational readiness, audience and curriculum placement, approve/schedule release | Final approval, confirmed live link, verified actual publication time | Published outcome |

Within every stage use: **Queued, In progress, Paused, Blocked, Awaiting handoff, Completed**. Publication additionally displays Ready to publish, Scheduled, and Failed release as relevant substates. “Changes requested” is a recorded review decision that reopens the required work; it must not silently reset history.

Normal handoff:

1. The current owner starts work explicitly; assignment alone does not start a timer.
2. They attach the required evidence and complete the checklist.
3. “Submit handoff” closes active work and sets Awaiting handoff. Notify the next assigned owner or role queue.
4. The receiver accepts or returns the work with a specific reason. Acceptance completes the outgoing stage and opens the next stage as Queued, atomically.
5. If no receiving owner exists, the handoff remains visible as Unassigned and alerts the manager. No task disappears between teams.

The receiving role can inspect pending handoffs before the item enters its stage. Track this acceptance delay against the receiving team, while retaining it in the outgoing stage's residence history. Dashboards must label the distinction.

Drag-and-drop is a convenience for permitted actions, not a way to bypass required files, approvals, or transition rules. Show a confirmation with missing requirements when a move is blocked. All bulk actions use the same server-side rules.

Returns and revisions:

- A rejected handoff records the reviewer, reason category, detailed note, affected asset version, and time. The current stage returns to actionable work.
- If the problem belongs to an earlier stage, explicitly reopen that stage as a new attempt. Preserve completed attempts and invalidate downstream approvals tied to the superseded asset.
- Later stage work is held until the updated dependency is accepted. Never retain an approval for a different file version.
- After publication, create a linked revision workflow. Keep the existing live version and its history until an authorized replacement or unpublish action occurs.
- Cancellation and archiving require a reason; they are excluded from completed-work counts but remain auditable.

Quality gates remain within the five roles. The manager assigns a suitably qualified Publication or Manager user to educational review. Optional manager approval is a policy setting, not a sixth role. Use a different reviewer where feasible and record when a small team permits self-approval.

## 4. Timestamp design: trustworthy traceability

Store system event times on the server in UTC. Display dates in the workspace timezone, initially Africa/Addis_Ababa, with the timezone visible in exports and detail views. Use a clear Gregorian date and 24-hour time by default; an Ethiopian calendar/time display can be added later without changing stored instants.

Never ask staff to type normal completion timestamps. Start, pause, resume, block, submit, accept, return, schedule, and publish actions generate them. Entering a planned date does not create an actual event.

| Event/field | Meaning |
| --- | --- |
| created_at / released_to_production_at | Record created; item formally enters the production queue |
| assigned_at and assignment history | Each owner assignment/reassignment, with actor and reason |
| stage_entered_at | Item becomes available for this stage attempt |
| first_started_at | First explicit start within the attempt |
| work_session_started_at / ended_at | Each person's active work interval; supports multiple sessions |
| paused_at / resumed_at | Intentional interruption, with reason |
| blocked_at / unblocked_at | Dependency interruption, with cause and person responsible for resolving it |
| handoff_submitted_at | Requirements submitted for receiving-role review |
| accepted_at / returned_at | Receiver's decision and reason |
| stage_completed_at | Accepted handoff; Publication completes only after confirmed live release |
| original_due_at / current_due_at | Baseline commitment and current approved deadline |
| scheduled_publish_at | Intended release instant, including the chosen display timezone |
| published_at / publication_verified_at | Actual platform release time, where known; separate time it was verified |
| event_recorded_at / source_occurred_at | When the system learned of an external/imported event versus when it occurred |

Each audit event includes event ID, item/version/stage-attempt ID, actor or integration identity, action, timestamp, old/new values, reason when required, and request/import/job ID. Append correction events instead of rewriting original history. Deadline extensions preserve the baseline and require a reason. Restrict audit export to managers.

Timing definitions:

- **Initial queue time:** stage entry to first start. Mark never-started items as an open interval, not zero.
- **Total queue time:** sum of every queued interval, including queues following returns.
- **Active processing time:** union of intervals when at least one contributor is actively working on the stage. This is elapsed production time.
- **Labor effort:** sum of contributors' work-session durations. Two people working together for an hour means one active processing hour and two labor hours.
- **Blocked, paused, and handoff-wait time:** separate, non-overlapping stage-state intervals.
- **Stage residence time:** stage entry to completion, or now for open work. The exclusive state buckets reconcile to this total.
- **Production lead time:** release to production through actual publication. Also show creation-to-publication time separately if useful.
- **Release hold:** ready-to-publish through planned release, separated from processing or approval delay.
- **Rework effort:** labor on attempts caused by returns or later revisions; preserve reason categories.

Show both calendar elapsed time and business-time elapsed time. Configure workdays, shifts, holidays, leave, and available production hours. Staff labor sessions use their actual timestamps; business-time service clocks use the configured calendar. Blocked/paused work stops active timing but does not erase age or automatically extend the due date. Show any policy-based exclusions explicitly.

Avoid simultaneous timers for one user across multiple items. Closing the browser does not mean work has ended; stale sessions trigger a review prompt. Approved manual corrections retain original entries, the correction reason, and approver. Missing effort must be shown as incomplete data, never assumed to be zero.

Historical imports use source dates and provenance; unknown historical events stay unknown. Imported records never masquerade as newly measured live work.

### Example: editing timeline

Illustrative single-day example in Addis Ababa time:

| Event | Time |
| --- | --- |
| Editing queue entered | 09:00 |
| Editor starts | 10:00 |
| Blocked waiting for replacement audio | 12:00 |
| Audio received; work resumes | 14:00 |
| Handoff submitted | 16:00 |
| Uploader accepts | 16:30 |

Result: 1 hour queued, 4 hours active processing, 2 hours blocked, 30 minutes handoff wait, and 7.5 hours stage residence. With one editor throughout, labor effort is 4 hours. This should not appear as “7.5 hours spent editing.”

## 5. Five roles and their dashboards

| Role | Primary dashboard | Primary actions | Useful metrics |
| --- | --- | --- | --- |
| Recording | Today's sessions, my lesson queue, missing raw assets, reshoot requests | Start/pause work, record session outcome, attach raw assets, block or submit handoff | Recorded lessons/minutes, queue age, on-time handoffs, reshoot rate |
| Editing | Accepted raw footage, editing queue, current work, correction requests | Manage versions, captions/thumbnail, work sessions, submit master | Accepted masters, labor per finished minute, turnaround, rework, aging queue |
| Uploading | Approved masters, upload queue, failed transfers, processing checks | Upload/link files, retry, verify metadata and playback, hand off | Transfer/processing duration, success/failure rate, retry count, waiting items |
| Publication | Ready lessons, approval requests, release calendar, release failures | Review, request corrections, schedule, publish/verify, manage authorized replacements | On-time releases, publication backlog, curriculum coverage, verification failures |
| Manager | Organization overview, stage health, capacity, overdue work, unanswered questions | Assign/reassign, set priorities/deadlines, ask questions, resolve escalations, review reports and policies | Lead time, queue age, throughput, blocker causes, quality, capacity gap, coverage |

All dashboards share a consistent layout: scope/filter bar; four to six key metric cards; one main worklist; a compact trend or calendar; and an attention panel. Each metric opens the underlying filtered records and shows its definition, date basis, denominator, and sample size.

Proposed permission boundaries:

- Operational users view/comment on content within their assigned grade/subject scope and update their own stage. They can request changes upstream without directly altering another team's work.
- Publication is the only operational role allowed to release content. Manager emergency release is a configurable, audited override.
- Managers see organization-wide workflow and staff metrics, manage taxonomy and access, and approve timing corrections. Staff see their own effort and shared operational queues; no public employee ranking.
- Managers can ask a question on a lesson, stage, report snapshot, or discussion. A question has an owner, optional answer deadline, Open/Answered/Resolved state, and escalation history.
- Multi-role users retain their identity across role changes. A role switcher changes presentation; it does not grant privileges. Enforce scope and action permissions in the backend, exports, search, assets, and notifications.

## 6. Reporting, bottlenecks, and staffing

Provide dedicated views for production, each stage, grade, subject, team, quality, release schedule, and capacity. Reuse the same reporting definitions and filter state across them.

| Question | Recommended visual | Useful alternative |
| --- | --- | --- |
| Where is work accumulating? | Stage backlog bars plus aging bands | Four-column Kanban |
| Is a stage improving? | Weekly median and 90th-percentile turnaround lines | Comparison table with sample sizes |
| Why are lessons late? | Stacked queue/work/block/handoff durations | Sortable exception table |
| Are we keeping up with demand? | Arrivals and accepted completions by week | Cumulative flow view |
| Where is curriculum coverage weak? | Grade × subject coverage matrix | Grouped progress table |
| Who has room for more work? | Assigned effort versus available hours | Team workload table |
| What is due or releasing soon? | Weekly/monthly calendar | Agenda list |
| How much work is being repeated? | Rework trend and cause bars | Return history table |

Definitions and safeguards:

- Report accepted stage completions, unique lessons published, and published minutes separately. Multiple attempts and platforms must not inflate unique lesson counts.
- Display first-pass acceptance, returns per attempt, and rework effort. Faster work accompanied by more corrections is not automatically improvement.
- Show overdue open tasks alongside completed on-time rates so unfinished work cannot disappear from performance reporting.
- Compare both original deadline and latest approved deadline. Define the cohort: due-in-period for deadline compliance, completed-in-period for throughput, and as-of-date for backlog.
- Compare like-for-like content by stage, duration, complexity, format, and language. Show comparable-period changes and sample sizes. Do not treat a staff ranking as a staffing recommendation.
- Display live open-item ages separately from completed turnaround statistics to avoid hiding stuck work.
- Default comparisons can use the latest four complete weeks against the preceding four, with customizable ranges. Show “insufficient data” when estimates are weak.

Capacity model, per stage and planning period:

1. Estimate demand hours from planned incoming items plus the backlog reduction target, grouped by comparable content type. Use observed labor effort, including expected rework, or explicit planning estimates when history is unavailable.
2. Calculate available production hours from staff schedules after leave, meetings, and other commitments. Do not assume every paid hour is production capacity.
3. Capacity gap = demand hours − available production hours.
4. Estimated additional people = ceiling of positive gap / realistic production hours per added person. State skills, ramp-up time, and uncertainty; treat this as a scenario, not a hiring decision.

Illustration only: 40 comparable edits/week × 2 labor hours = 80 required hours. Two editors with 30 production hours each provide 60 hours. The 20-hour gap could justify one additional editor providing 30 hours, workload redistribution, or a smaller weekly target. If the observed delay is actually waiting for raw footage or approval, adding editors may not resolve it.

Include a manager scenario control for target weekly volume, content mix, added staff, and production hours/person. Show estimated backlog change and capacity by stage. Flag sustained queue growth, not just a single busy day. Suggested alerts and thresholds are configurable hypotheses to calibrate during the pilot.

## 7. Comments, discussions, and notifications

### Contextual comments

Every lesson, stage attempt, asset version, and report snapshot supports threaded comments with mentions, attachments, reactions, and resolved/unresolved state. Video comments can reference a timecode such as 03:42 and must remain attached to the exact asset version. Edited comments show edited status/history; deletions leave an audit marker where appropriate.

Manager questions can request an owner response. Keep an unanswered-questions queue and show the related lesson or filter snapshot. A report comment retains the metric definition, filters, date window, and data timestamp so its context survives later updates.

### Discussion board

Provide boards for General, Recording, Editing, Uploading, Publication, and curriculum-specific grade/subject discussions. Use topics with categories such as Question, Decision, Blocker, Announcement, and Improvement. Allow search, pinning, following, replies, and resolved/answered status.

Convert a discussion outcome into a linked action with owner and due date. Operational changes still require the actual workflow action; a comment saying “approved” does not approve an asset. Board visibility follows content scope.

### Notification panel

A persistent bell opens a panel with All, Unread, Mentions, Assignments, Approvals, and Alerts. Each notification links to its exact item or thread and supports mark-read, snooze, and notification preferences.

Trigger on assignment, handoff request/acceptance/return, mention, manager question, nearing deadline, overdue work, unresolved blocker, failed upload/publication, successful publication, and import/export job completion. Route only to authorized owners, reviewers, followers, or managers.

Start with in-app delivery. Email digests can be added as an opt-in delivery channel. Deduplicate retries and group related events; do not send a new overdue notification on every dashboard refresh. Record escalation and delivery state. Essential workflow tasks remain visible even when optional alerts are muted.

## 8. Merged views, filters, and exports

Global scope selector: All content → one or more Grades → one or more Subjects → Units. Provide All, By grade, By subject, and Grade × subject views. Filters persist when changing spreadsheet, table, board, calendar, and report views; allow explicit reset and shareable authorized view links.

Rich filters include curriculum/version, year/term, grade, subject, unit, language, content type, title/ID search, stage, status, owner/team, teacher, priority, tag, platform, due date, created/started/completed/published date, overdue, blocked, unassigned, waiting for acceptance, rework count, duration, complexity, and missing required assets.

Use OR within a multi-select field and AND across fields by default; expose advanced grouping only when needed. Show active filter chips and result count. Date filters explicitly identify the date field. Saved views can be personal or manager-shared, such as “Grade 8 Mathematics — overdue editing.”

Merged views count distinct item IDs. A multi-grade item appears in each relevant scope, but the all-content total counts it once. Non-additive membership reports must say so; offer primary-membership totals when users need columns to sum cleanly.

### Import

Support CSV and XLSX planning imports. Flow: choose template → upload → map columns → validate → preview create/update/skip results → confirm → background job → outcome report.

Validate required fields, taxonomy, user identities, grade/subject relationships, dates/timezones, duplicate IDs, allowed field updates, and links. Support create-only and explicit update-by-ID modes. Never match updates by title alone. Let users download a row-level error file and deliberately choose valid-only import or cancel the batch.

Standard imports create planned items; they cannot silently mark content published, rewrite audit events, or overwrite completed-stage evidence. A manager-only historical migration mode accepts provenance and partial history, explicitly excludes uncertain timing from performance metrics, and requires a mapping preview. Keep batch IDs and idempotency keys so retries do not create duplicate items. Dry-run mode makes no changes.

### Export

Provide CSV for raw records, XLSX for grouped operational reports, PDF for manager summaries, and structured JSON for an authorized metadata/audit export. Binary media backups are a separate concern; export an asset manifest unless media download is explicitly selected and permitted.

Offer current page, selected rows, or all filtered rows, with a visible row count. Export must preserve filters, sort, selected fields, timezone, generation date, and metric definitions. Enforce permissions before generation; remove restricted comments, staff effort, or links for unauthorized viewers. Escape spreadsheet formula-like text during CSV/XLSX export. Large exports run as jobs with progress, retry, and expiring authorized download access.

## 9. Optional spreadsheet mode for all five roles

The supplied reference, “Content Handoff & Upload Table,” shows Grade, Subject, Unit, Part Number / Title, Editing Status, and Upload Status as colored dropdown cells. Preserve that familiar working style as an optional **Sheet view**, available beside Board, List, Calendar, and Dashboard. This is an editable view of the same workflow records, not an independent spreadsheet that needs synchronization.

One row represents one production item/lesson part. Match the reference's compact row height, clear headers, rounded colored selection pills, and visible dropdown arrows. Support Amharic and English titles without truncating the stored content; wrap long titles or show their full value on focus. Show a short row ID even when titles are similar.

### Columns and role presets

The shared sheet includes Grade, Subject, Unit, Part number/title, Recording status, Editing status, Upload status, Publication status, Current owner, Due date, Blocker, Comments, and Last updated. Optional columns include per-stage owners/deadlines, raw/master/thumbnail/caption links, destination, planned release, actual release, handoff state, and time metrics.

| Preset | Columns emphasized after curriculum/title |
| --- | --- |
| Recording sheet | Recording owner, session date, recording status, raw files, notes, handoff |
| Editing handoff sheet | Editing owner, editing status, master/captions/thumbnail, upload status, handoff |
| Uploading sheet | Approved master version, upload owner, upload status, destination link, playback verification, handoff |
| Publication sheet | Upload verification, review status, release date, publication status, live link |
| Manager master sheet | All four stage statuses, owners, deadlines, blockers, age, unanswered questions |

Users can hide, resize, pin, reorder, and save columns and choose comfortable or compact density. Remember the selected view per user; a manager can share a preset without forcing everyone to use it. Freeze curriculum/title columns during horizontal scrolling. Group/collapse rows by grade, subject, unit, owner, or stage. Permit side-by-side stage visibility even when only one stage is currently editable.

### Dropdown behavior

Grade, subject, unit, owners, priority, and categorical statuses use searchable dropdowns. The lesson/part cell selects an existing lesson or opens an authorized new-lesson form. Dates use date/time pickers; links and notes use suitable editors; timestamps and calculated fields remain read-only. Do not force every cell to use a status menu when its value is a date, file, or title.

Use stage-specific labels while mapping them to the common workflow states. Examples: Recording — Queued, Recording, Paused, Blocked, Ready for handoff, Done; Editing — Queued, Editing, Paused, Blocked, Ready for handoff, Done; Uploading — Queued, Uploading, Processing, Failed, Uploaded; Publication — Pending review, Changes requested, Ready, Scheduled, Published, Failed release. Other visible context, such as handoff acceptance, stays in a separate badge/column.

“Done” means the stage's completion gate has passed. Selecting Done on unfinished work opens the required submission/acceptance flow; it does not manufacture acceptance. Until accepted, show Ready for handoff. “Uploaded” means the file transfer/processing/playback gate has passed; display handoff acceptance separately, and never imply publication. “Published” requires release evidence. Intermediate upload transfer states belong to the upload attempt; they map to the parent stage's queued/in-progress/blocked state.

Every successful cell update records actor, before/after value, server timestamp, and applicable workflow event. Apply exactly the same checklists, scope restrictions, version validation, timer behavior, handoff rules, and notifications as other views. Locked cells explain why and identify the responsible role. Changing an upstream asset invalidates dependent approvals just as it does in the full lesson page.

### Fast editing and traceability

Support keyboard navigation, Enter to edit, Escape to cancel, range copy, multi-row selection, and safe bulk edits such as owner, priority, and due date. Pasted values first undergo validation and a change preview. Bulk status changes show eligible/ineligible rows and missing evidence before confirmation; they cannot bypass releases or acceptance rules. Restrict destructive/release actions to explicit reviewed operations.

Autosave each valid change with visible Saving/Saved/Failed state. Failed saves retain the entered value for retry and never look committed. Detect conflicting edits and show current/new values rather than silently overwriting. Use an undo action only for reversible edits, recording a compensating audit event; external release actions need their dedicated correction flow.

Add comment indicators at row and cell level. A cell comment anchors to item, stage/field, and asset version where applicable. Clicking it opens a discussion side sheet. Display last editor/time on hover or focus and offer row/cell change history. Clicking a lesson title opens the full lesson page with all assets and history.

Export either the visible sheet layout or all authorized filtered fields. Import uses the same templates, mapping, preview, and validation as the import center. Editing the grid must update dashboard totals and other open views without requiring users to re-enter data.

## 10. Clean shadcn interface and screen inventory

Visual direction: warm ivory canvas (#F8FAF4), deep green primary actions (#074924), fresh green accents (#5DBA47), white cards, subtle borders, readable typography, and restrained shadows. Treat these as proposed Myseed theme tokens. Fresh green is an accent; verify contrast before using it for text. Use semantic text/icon labels alongside every status color.

Desktop layout: collapsible sidebar; top bar with breadcrumbs, search, active role, and notification bell; page header with scope/date filters; compact metric row; main work area; contextual attention panel. Tablet/mobile uses stacked cards, a drawer navigation, and a full-page task detail. Avoid forcing large tables into unreadable mobile columns.

Use shadcn Sidebar, Card, Tabs, Badge, Table/Data Table, Sheet, Dialog, Calendar/Date Picker, Combobox, Dropdown Menu, Avatar, Tooltip, Progress, and form patterns. Its Data Table guide supplies patterns for sorting, filtering, selection, and pagination; its Chart component is suitable for the reporting foundation. Kanban, curriculum matrices, workflow steppers, and advanced scheduling need composed application components rather than assumptions that they are ready-made shadcn controls.

| Screen | Main content | Alternative view |
| --- | --- | --- |
| Login/invitation | Branded sign-in, reset, invited user setup | Compact mobile layout |
| Role dashboard (five variants) | Personal/team metrics, actionable work, alerts | Compact focus mode |
| All content | Searchable table with pinned lesson/status/owner fields | Editable Sheet, cards, or grouped curriculum tree |
| Sheet view (five role presets) | Colored dropdown cells, inline edits, pinned curriculum/title, row/cell comments | Board, List, Calendar, Dashboard |
| Production pipeline | Four stage columns with status badges and age | Dense table |
| Lesson detail | Identity, current owner, next action, four-stage progress | Side sheet for quick inspection |
| Lesson detail tabs | Overview, Workflow, Assets, Discussion, History | Full page for video review |
| Recording schedule | Sessions, presenter, resource availability | Agenda |
| Publication calendar | Draft/ready/scheduled/live items | Release list |
| Grade/subject dashboard | Coverage and production health | Matrix or grouped table |
| Reports | Throughput, turnaround, blockers, quality | Chart/table toggle |
| Team and capacity | Assignment load, availability, scenario estimate | Capacity table |
| Discussion board | Topics, categories, unread/answered status | Thread detail |
| Notification center | Actionable inbox and preferences | Bell side panel |
| Import/export center | Templates, mapping, previews, job history | Result/error detail |
| Settings | Taxonomy, roles/scopes, checklists, calendars, targets, destinations | Section tabs |

Every screen needs loading, empty, error, no-permission, and retry states. Preserve unsaved drafts; prevent duplicate submissions; provide keyboard focus, labels, adequate contrast, accessible tables and chart alternatives. Make primary actions explicit: Start recording, Submit edited master, Verify upload, Schedule release. Show destructive/release actions with an appropriate review step.

## 11. Data and implementation boundaries

Suggested entities: User, RoleAssignment, AccessScope, CurriculumNode, Lesson, ContentItem, CurriculumMembership, StageAttempt, StageAssignment, StageStateInterval, WorkSession, AssetVersion, ChecklistResult, HandoffReview, Blocker, DeadlineRevision, PublicationTarget, PublicationAttempt, AuditEvent, CommentThread, Comment, ManagerQuestion, DiscussionTopic, Notification, SavedView, WorkingCalendar, CapacityPlan, and ImportExportJob.

Keep stable item IDs and separate stage attempts, work sessions, asset versions, and publication destinations. Current status is a convenient projection of history, not a replacement for it. Publication attempts store platform IDs and evidence; “uploaded” or “scheduled” never implies “live.”

Implementation boundaries:

- Frontend: role-aware shadcn interface with shared filters and accessible components.
- Backend: permission checks, transition rules, transactional history updates, metrics definitions, and import/export validation.
- Database: relational records for workflow, curriculum membership, permissions, and audit events.
- Asset storage: large files and version metadata with authorized access; allow existing storage links for the first release.
- Background jobs: imports, exports, notifications, scheduled checks, and later platform integrations.

Use concurrency/version checks to prevent two users accepting or updating the same stage inconsistently. Idempotency protects handoffs and external publication retries. Jobs must handle provider errors and partial success; never label failed uploads or releases as complete. On a platform timeout, reconcile by external ID before retrying to avoid duplicate publication.

For multiple required destinations, show per-platform readiness and release status. Define overall Published as all required destinations confirmed live; optional destinations must not silently alter that rule. Persist each actual release time and use the required-destination completion time for the overall item milestone.

## 12. Rollout plan and acceptance criteria

### Phase 1 — trustworthy daily workflow

Deliver login and five roles, scopes, curriculum structure, lesson CRUD, four stages with checklists and handoffs, automatic event history, assignments, basic role dashboards, optional Sheet view with five role presets and validated inline dropdown edits, comments, discussion boards, notification panel, core filters, CSV/XLSX planning import, and CSV/XLSX operational export. Use manual verified publication links initially. Include the basic audit and timing model from day one; it cannot be reconstructed reliably later.

### Phase 2 — coordination and reporting

Add recording/release calendars, saved shared views, advanced sheet range/paste/bulk editing, rich filters, version-specific media comments, manager questions/escalations, grade/subject coverage, quality/rework analysis, business-time calendars, PDF summaries, and reliable batch-job UX. Reconcile metrics against real pilot records.

### Phase 3 — capacity and integrations

After representative data exists, add capacity scenarios, confidence-aware forecasting, automated upload/publication integrations, optional email digests, and selected advanced reporting. Avoid promising platform automation until destination capabilities and credentials are confirmed.

Pilot with one grade/subject and representatives from all five roles. Include normal handoffs, a rejected master, a blocker, a deadline change, a cross-stage return, an upload failure, a delayed release, and a published revision. Collect a few weeks of representative observations before setting lasting service targets. Duration and effort estimates for implementation depend on team size, integration scope, and the existing codebase.

Acceptance criteria:

1. A lesson can move through all four stages with named owners, validated evidence, and an unbroken history.
2. Each role lands on its own dashboard; unauthorized actions and data access are rejected server-side.
3. A blocked interval is visible separately from active work; residence totals reconcile to their state intervals.
4. Reassignment, deadline change, timer correction, and reopened stages preserve previous values and reasons.
5. Publication cannot be completed without required live-release evidence; scheduled content remains distinct from published content.
6. A manager can identify the oldest queues, relevant blocker causes, unanswered questions, and demand/capacity gaps with underlying records.
7. Comments, discussion decisions, and notifications link to the exact permitted item/version/context.
8. Filters remain consistent across dashboards and views; merged totals deduplicate multi-grade content.
9. Import previews show changes before confirmation; invalid rows are actionable and retries do not duplicate records.
10. Exports match the selected authorized dataset and explicitly include filter/timezone context.
11. Two simultaneous updates or retried jobs do not create duplicate transitions, release actions, or notifications.
12. A revision after publication preserves the live version until a replacement is explicitly authorized and verified.
13. All five roles can choose Sheet view. Editing a dropdown follows the same permission and transition rules as the lesson page, timestamps the change, and updates other views; failed or conflicting saves are clearly visible.

## 13. Configuration decisions to confirm during implementation

The plan can proceed with the defaults above. Before implementation, confirm supported grades/curricula and languages; team members and access scopes; publishing destinations; current asset storage; required educational and technical checklists; workweek/holidays; expected volume/content mix; who approves publication; and whether any existing application/backend must be reused.

Do not invent production targets or staffing conclusions before those inputs exist. Start with transparent measured data, then calibrate alerts and service targets with the manager and teams.

## Official UI references

Component recommendations were checked against official shadcn documentation on 26 October 2026. The workflow, metrics, role boundaries, and design choices in this plan are proposed Myseed requirements.

- Data Table: https://ui.shadcn.com/docs/components/base/data-table
- Sidebar: https://ui.shadcn.com/docs/components/base/sidebar
- Chart: https://ui.shadcn.com/docs/components/base/chart

Rule 1: No emoji, anywhere

Never use emoji or decorative Unicode symbols in:

- UI copy, labels, buttons, toasts, empty states, placeholders
- Translations and content seed data
- Code comments, log messages, commit messages, PR descriptions, docs, and READMEs
- Generated emails (invoices, receipts, notifications)

This includes check marks, crosses, stars, arrows used as decoration, sparkles, fire, rockets, bullets made of symbols, and flag or face emoji.

**Why:** emoji make a product look auto-generated and cheap. The target is a restrained, premium interface.
