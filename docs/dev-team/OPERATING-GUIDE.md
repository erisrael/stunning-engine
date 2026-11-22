# How the Dev team operates

The Dev team's working guide: how work comes in, moves through the board, gets reviewed, tested and released, and how the sprint runs, using the Dev team pages in Myseed Ops (`/dev`). The rules behind it are in the [rule book](RULEBOOK.md); this guide is the practice.

## 1. Where things live

| Page | Address | Used for |
| --- | --- | --- |
| Home | `/dev` | Members: their own board (To do, In progress, Done not sent, With lead). Leads: the desk (Intake, To check, Arriving, To approve, Ready for the next stage, Ready to release, To assign) |
| Board, List, Sheet | `/dev/board`, `/dev/list`, `/dev/sheet` | All tasks by status, as cards, a list or a spreadsheet |
| Sprint | `/dev/sprint` | Planning against capacity, burndown and burnup, stand-ups, review, retrospective, velocity |
| Roadmap | `/dev/roadmap` | Projects by quarter with progress, health, the team, open bugs, the next milestone; DORA measures |
| Timeline | `/dev/timeline` | The Gantt chart with dependencies, baselines and the critical path |
| Specs and docs | `/dev/docs` | The document library: specs, designs, decision records, test plans, runbooks, this handbook |
| Repositories | `/dev/repos` | GitHub (or GitLab) repositories, pull requests and their checks |
| Releases and quality | `/dev/tools` | Releases and deployments, incidents, test cases and runs, traceability, epics, project templates |
| Requests | `/dev/requests` | Work asked of Dev by other departments |
| Configure | `/dev/configure` | Statuses, types, fields, the flow, sprints, the definition of done (heads and Admin) |

The code is in the GitHub repository; production is **https://ops.myseed.com.et**.

## 2. Roles and responsibilities

- **Head of Dev (tech lead)**: owns the architecture and the schema, reviews risky changes, runs releases and production, keeps the rule book, names testers and reviewers.
- **Team lead**: triages the intake, plans the sprint with the team, assigns work, reviews pull requests, approves or returns work at the lead review, unblocks people.
- **Developer**: takes assigned work, keeps the task up to date, writes the code, tests and docs, opens the pull request, fixes what review and QA find.
- **Tester (QA)**: accepts work arriving in QA, tests it against the acceptance criteria and the test plan, passes it or returns it as a bug with steps to reproduce.
- **Product owner (Manager or Owner)**: decides what is built and in which order, writes or approves the product brief, accepts finished features at the sprint review.

One person can hold several of these roles while the team is small, but nobody reviews or tests their own work.

## 3. The life of a task

The Dev flow is set up in Configure, Flow. Its stages:

| Stage | Who works it | What happens | Leaves when |
| --- | --- | --- | --- |
| Backlog | Lead | New work and requests from other departments land here for triage: priority, type, points, sprint, assignee | It is ready and planned |
| To do | Assignee | Planned for this sprint, not started | The assignee presses Start |
| In progress | Assignee | The branch is made from the task code, the work is done, the timer runs while working, the checklist is filled | The pull request is open and the checklist is complete; the assignee marks it Done and sends it |
| Code review | Tech lead or a lead | The pull request is reviewed; its checks show on the card | Approved (or returned with comments) |
| QA | Tester | Tested against the acceptance criteria | Passed (or returned as a bug with steps to reproduce) |
| Ready to release | Lead | Waits for the next release with drafted release notes | Included in a release |
| Released | | Shipped to production | |

Only finished work moves on: returned work goes back to the assignee with the reviewer's or tester's note, and appears as Redo on their board. A merged pull request can move a task on by itself (the scheduled "flow-merges" check). Members do not drag work into another stage on the board; leads can.

### On the task card

- The **branch and pull request** (from the GitHub link, or the task code in the branch name).
- **Acceptance criteria**: what has to be true for the task to be done.
- The **checklist** from the definition of done (tests, docs, phone check).
- **Story points**, and the time spent from the timer.
- **Links** to the requirement it builds (FR-3 in a spec) and to related tasks.

## 4. The sprint

Dev works in sprints with story points. The defaults (Configure, Sprints) are:

| Ritual | When | What comes out |
| --- | --- | --- |
| Sprint planning | First day of the sprint (Monday), 09:30 | The sprint goal and the committed tasks, against each person's capacity |
| Daily stand-up | Every working day, 09:15 | Each person's notes: yesterday, today, blockers. Blockers go to the leads |
| Sprint review | Last day (Friday), 14:00 | What was finished, shown working on the live site or a local copy; what moves on |
| Retrospective | Last day (Friday), 15:00 | Went well, to improve, actions. Actions become tasks with owners |

Sprints are two weeks long, Monday to Friday. Unfinished work moves to the next sprint by default (a head can change this to "back to the backlog"). All of these are settings; the team changes them in Configure when it agrees to.

### Planning

1. The lead brings a backlog in priority order, with the ready tasks at the top.
2. The team checks each candidate against the Definition of Ready (below).
3. Tasks go into the sprint until each person's capacity is reached. Capacity is each person's story points per sprint, set in Configure, Sprints.
4. The sprint gets a one-sentence goal.

### Estimates

Story points describe size and uncertainty relative to other tasks (1, 2, 3, 5, 8). A task above 8 is split before it enters a sprint. Points are a planning tool for the team; they are not used to judge individuals.

## 5. Definition of Ready and Definition of Done

**Ready** (before it enters a sprint):

- [ ] Who it is for and why, in a sentence or a user story
- [ ] Acceptance criteria, including empty states and errors
- [ ] A spec or design linked when it is more than a fix (see [writing specs and docs](SPEC-GUIDE.md))
- [ ] Schema changes, if any, agreed with the Head of Dev
- [ ] Small enough for one sprint (8 points or less)

**Done** (before it leaves In progress; the checklist on the card):

- [ ] The acceptance criteria are met
- [ ] Server permissions checked for every new action (RULE-30)
- [ ] Tests added or updated; `npm run typecheck` and the affected tests pass
- [ ] Checked on a phone-width screen, light and dark
- [ ] Documentation updated where setup or use changed (RULE-60)
- [ ] The pull request description complete (RULE-14)

The team's own definition of done is kept in Configure, Sprints and shows on the sprint and each task; keep it and this list the same.

## 6. Requests from other departments

Other departments ask Dev for work through Requests (a request becomes a task in the lead's intake) or by reporting a bug. The lead triages each one at least daily:

1. Is it a bug, a change or a question? Questions are answered and closed.
2. Priority: production down or data at risk is handled at once (an incident, see the [release guide](RELEASE-GUIDE.md)); everything else is ranked in the backlog.
3. The requester is told what happens next, on the request.

## 7. A developer's day

1. Read the Dev Home board: returned work (Redo) first, then In progress, then To do.
2. Write the stand-up note before the stand-up.
3. Start the task in the app before starting work (the timer runs; the board shows who is on what).
4. Branch from `main` with the task code in the name; commit in small steps.
5. Open the pull request early as a draft when you want feedback; mark it ready when the checklist is done.
6. Mark the task Done and send it to review. While it waits, review someone else's pull request.
7. Raise a blocker the moment it appears.

## 8. Code review in practice

- Read the task and its acceptance criteria first, then the diff.
- Run it when the change is visible (a screen, a flow): `npm run dev` on the branch.
- Check the things tests miss: the role that should not see it, an empty list, an Amharic name, a phone, a slow connection, two people at once.
- Approve, or return with comments that say clearly which are blocking.
- The lead's approval in the app and the approval on GitHub go together.

## 9. Measures the team watches

| Measure | Where | Why |
| --- | --- | --- |
| Sprint goal met, velocity | Sprint (review) | Planning that matches what the team can do |
| Work in progress per person, items in Redo | Home, Board | Too much started, or quality problems coming back |
| Pull requests waiting for review | Repositories | Review is the most common bottleneck |
| Deployment frequency, lead time for changes, change failure rate, time to restore (DORA) | Roadmap, Releases and quality | Speed and stability of delivery |
| Bugs found in production | Releases and quality, incidents | Quality reaching users |

The measures are for the team to improve its way of working, reviewed at the retrospective. They are not targets for individuals.

## 10. When someone is away

- Planned leave: hand over open tasks (reassign, or a note on each saying where it stands), and tell the lead which pull requests are waiting.
- Unplanned: the lead reassigns anything urgent from the person's board.
- Production knowledge must never sit with one person. Whoever does something on production for the first time writes it into the [runbook](../RUNBOOK.md) or the [release guide](RELEASE-GUIDE.md).

## Related documents

- [Rule book](RULEBOOK.md)
- [Onboarding](ONBOARDING.md)
- [Writing specs and docs](SPEC-GUIDE.md)
- [Releases, deploys and incidents](RELEASE-GUIDE.md)
- [Test plan](../project/TEST-PLAN.md)
