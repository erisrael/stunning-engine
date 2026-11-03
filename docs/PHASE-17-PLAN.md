# Phase 17 plan: KRAs, KPIs, OKRs and scorecards

This is the detailed plan for Phase 17 (the summary is in ROADMAP.md). Nothing here is built yet. It is written so the decisions marked **Decide** can be made first, then the work done in the four steps at the end.

## 1. What already exists to build on

| Already in the app | Used for |
|---|---|
| Department KPIs (`dept-config.ts`: `kpis`, Configure, KPIs and targets) and the metrics recorded per project (`listMetrics`, `addMetric`) | typed-in KPI values, and the start of the KPI library for departments |
| Performance reviews (`review_cycles`, `hr_reviews`, HR, Performance) | where a period's scorecard and OKR results are attached as evidence |
| Production numbers: `stage_attempts` (who, stage, started, finished, returned), handovers and returns, review notes, `items` (published) | production KPIs with no typing |
| Department tasks: `dept_tasks`, `dept_time_entries`, sprints and velocity (`dev-studio.ts`), releases and DORA on the Roadmap | department KPIs with no typing |
| Attendance (`att_events`, `att_marks`, timesheets), leave, training (HR, Training) | people KPIs |
| Finance: budgets and spend (`fin_budgets`), bills and invoices | finance KPIs |
| Presentations (`present.ts`, `dept-present.tsx`), Home widgets, notifications, the scheduled checks | showing scorecards, reminders, freezing periods |

## 2. Data model (new tables)

- `kpi_defs`: id, name, description, unit (count, percent, hours, days, money, score), direction (up or down), frequency (week, month, quarter), aggregate (sum, average, latest, rate), source (`measure`, `formula`, `manual`, `import`), source key or formula, bands (red, amber, green as numbers), min sample, owner role, active.
- `kras`: id, name, description. `kra_templates`: id, role or position (for example `editing` or `dev:lead`), department, version, active. `kra_template_items`: template, KRA, weight; then KPI, weight within the KRA, default target (one number, a range, or a rising rule).
- `kpi_targets`: subject (person, team, department, company), KPI, period, target, set by, reason, approved by. A per-person change after the period starts needs HR approval.
- `kpi_values`: subject, KPI, period, value, sample size, computed at, source (`auto`, `manual`, `import`), evidence file, entered by. Frozen when the period closes; later corrections are new rows with a reason, approved by HR.
- `score_periods`: id, kind (month or quarter), start, end, closes on, status (open, closing, closed).
- `scorecards`: subject, period, overall score, rating label, by KRA (JSON), computed at, frozen.
- `okr_cycles`: id, name, start, end, planning window, mid-review date, scoring window, limits (objectives and key results each).
- `objectives`: id, cycle, level (company, department, team, person), owner, title, parent objective, visibility (everyone, department, private).
- `key_results`: id, objective, title, kind (number or milestone), start, target, current, unit, linked KPI or measure (moves by itself), score.
- `okr_checkins`: key result, date, value, confidence (on track, at risk, off track), note, by.
- Links: `dept_tasks.key_result_id` and `projects.key_result_id`, so the work behind a key result shows.

## 3. The measure catalogue (no typing)

Each measure is a function `(subject, period) -> { value, sample }` in `src/server/measures.ts`, read through the same permission checks as the pages. A first list, one row per measure:

| Area | Measure | From |
|---|---|---|
| Production | parts finished per stage | `stage_attempts` finished in the period, by owner or stage |
| Production | on time (%) | finished before the stage date or due date |
| Production | cycle time per stage (days, average) | started to finished |
| Production | returned by the lead or sent back as missing (%) | lead returns and handover returns divided by finished |
| Production | redo requests received; review notes per part | `item_review_notes`, redo requests |
| Production | published per week | `items` live in the period |
| Departments | tasks done; story points done | `dept_tasks` done in the period |
| Departments | cycle time; reopened tasks; bugs within 7 days of a release | tasks, status history, releases |
| Departments | requests answered in time | requests with due dates |
| Marketing | campaign reach, leads, spend | project metrics (typed or imported) |
| People | punctuality (%), absence rate, overtime hours | `att_marks`, timesheets |
| People | training completed | HR, Training |
| Finance | spend against budget (%); invoices paid on time (%) | `fin_budgets`, bills, invoices |

Formulas combine measures (for example published / planned x 100). Typed-in KPIs take a value and optional evidence. Imports take a spreadsheet, or the Power BI feed that already exists.

**Fairness rules, built in:**
- Values are counted per working day, with leave and holidays left out.
- The setup warns when a KRA has only quantity measures and no quality measure.
- A percentage needs a minimum sample (default 5) before it counts.

## 4. Scoring

- **Per KPI**: by default, actual divided by target, capped at 120% (for "lower is better", target divided by actual). Bands can instead map the value to a 1 to 5 score, or pass or fail. HR chooses per KPI.
- **Per KRA**: the weighted average of its KPIs. Overall: the weighted average of the KRAs. Weights must add up to 100% (checked when saving).
- **Ratings** (labels set by HR): for example Exceeds at 110% or more, Meets at 90%, Below under 90%.
- **When it is computed**: nightly while a period is open; frozen when it closes.
- **OKRs**: each key result is scored 0.0 to 1.0, as progress from start to target (milestones are 0 or 1). An objective's score is the average of its key results.

**Decide:** whether OKRs feed the rating (the usual advice is not to, to keep ambition safe).

## 5. Screens

1. **HR, Performance, KPI library**: KPIs (source, bands, sample), KRAs, and templates per role and position, with weights and default targets. Ready templates for Myseed's roles: Recording, Editing, Uploading, Publication, their leads, Developer, Tech lead, QA, Marketing officer, HR officer, Accountant.
2. **Targets**: per period, the role default, with a lead changing one person's target (with a reason, approved by HR).
3. **My scorecard** (Home widget and Profile): each KPI's actual, target, trend and colour. Clicking a number shows the work behind it (the parts, tasks or days).
4. **Team, department and company scorecards** for leads, heads and owners, compared across periods and teams. There is never a public ranking of individuals unless HR allows it.
5. **OKRs**:
   - the cycle;
   - a tree from company to person, with each objective's alignment;
   - check-ins (a weekly reminder, and the lead told when a key result is off track);
   - scoring at the end, with a reflection.
6. **Presentation slides** (Phase 12c engine): KPIs, scorecards and OKR progress. The monthly owners' deck includes the company scorecard.
7. **Performance reviews**: the period's scorecard and OKR results attached as evidence; HR's calibration view shows the spread of ratings per department.
8. **Notifications**: check-in reminders, a KPI turning red, a target changed, a period closing.
9. **Exports**: Excel per period, and the Power BI feed.

## 6. Permissions (new capabilities in the matrix)

| Capability | Who, by default |
|---|---|
| `perf.library` | HR managers, Admin |
| `perf.targets` | Department heads and leads, for their teams, within the rules |
| `perf.view_team` | Leads and heads |
| `perf.view_company` | Owners |
| `okr.manage` | Owners and heads for their level; everyone for their own |

Everyone sees their own scorecard.

## 7. Decisions to make first

1. **Periods**: monthly scorecards with quarterly OKRs (suggested), or quarterly only?
2. **Scoring method**: percent of target capped at 120% (suggested), or 1 to 5 bands?
3. **Ratings and reviews**: should scorecards feed the HR review rating directly, or only show beside it as evidence (suggested)?
4. **Individual scorecards**: should production staff see their own numbers from the first month, or only after a trial period while targets are tuned (suggested: leads only for the first month)?
5. **Targets**: who sets the first ones per role: HR with the heads (suggested), or each head alone?
6. **OKR visibility default**: everyone (suggested), or the department?

## 8. Order of work

1. **Measures and the KPI library**: `measures.ts` with the catalogue above, tested against the demo data; the KPI, KRA and template screens; nightly computing into `kpi_values`.
2. **Scorecards**: targets, scoring, My scorecard, the team and department views, closing and freezing periods, and HR corrections.
3. **OKRs**: cycles, the objective tree, key results linked to measures, check-ins and reminders, scoring.
4. **Using it**: Home widgets, presentation slides, reviews evidence and calibration, notifications, exports and the Power BI feed.

Each step ships on its own with server and browser tests, as the other phases did.
