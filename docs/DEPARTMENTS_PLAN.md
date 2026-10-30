# Departments: dashboards, views and configuration (Phase 5c)

Goal: Dev, Marketing and Studio work as fully as the production workflow does, with a home dashboard, the same family of views (Overview, List, Sheet, Board, Calendar, Team, Reports), checklists, handoffs and saved views. And almost nothing should be fixed in code: each department is set up from Admin.

## Where things stand

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

## 1. Configuration first (Admin, Departments, Configure)

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

## 2. Department home dashboard

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

## 3. Views, matching the workflow

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

## 4. Workflow features carried over

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

## 5. Studio on the same footing

Studio keeps its content types (notes, exams, flash cards, question bank) and gains the same dashboard, Board (by review status), List with saved views, Calendar, Team and assignment. Its review stages and checklists become configurable the same way: who writes, who reviews, and what must be checked before publishing.

## 6. Data model (additive only)

- `dept_config`: one row per department with its configuration as JSON and a version number. Every change is in the audit log, and the previous version can be restored.
- `departments`: departments made from templates. Dev, Marketing and Studio are seeded from today's code values, so nothing changes until someone edits them.
- `dept_tasks.fields` (JSON) for custom field values, `dept_tasks.parent_id` for subtasks, and `dept_task_links` for dependencies.
- `dept_dashboards`: widget layouts per department, per position and per person.
- `saved_views` (existing table), with the department view as its page.
- `dept_time_entries`, `dept_sprints`, `dept_automations`, `dept_requests` and `dept_task_watchers`.

## 7. Order of delivery

1. **Configuration foundation**: config storage, the Configure screen, statuses, types, fields, names and positions. Today's values are moved into it, and the board and list read from it.
2. **Department dashboard**: widget library, layouts, filters, and the Owners selection.
3. **Views**:
   - List columns and grouping, board swimlanes and limits, saved views.
   - Then the Sheet and the Overview tree.
4. **Timeline, Team and workload, Reports**, then time tracking.
5. **Checklists, reviews, requests between departments, subtasks and dependencies, automations, sprints.**
6. **Studio on the same footing.**
7. **New departments from templates.**

Each step ships on its own and keeps today's screens working until its replacement is ready.
