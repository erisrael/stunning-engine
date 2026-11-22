# Myseed Ops documentation index

Every document about Myseed Ops, where it lives, and what it is for. All of these are Markdown files in the repository, listed in `docs/library.json`, and shown formatted in **Dev team, Specs and docs**, in the folders below. They follow the repository on every deploy; edit them through a pull request (RULE-63).

## 1. Start here

Library folder: *Myseed Ops documentation / 1. Start here*

| Document | File | For |
| --- | --- | --- |
| Documentation index (this page) | `docs/project/INDEX.md` | Finding any document |
| Product overview | `docs/project/PRODUCT-OVERVIEW.md` | What the system is, who uses it, its modules and surfaces |
| Dev team progress report | `docs/project/PROGRESS.md` | Where things stand, what is open, what is next |
| Quick start (README) | `README.md` | Running the app on a computer; the commands |

## 2. Requirements and plans

Library folder: *Myseed Ops documentation / 2. Requirements and plans*

| Document | File | For |
| --- | --- | --- |
| Software requirements specification | `docs/project/SRS.md` | What the system does, as built, with requirement IDs |
| Roadmap | `docs/ROADMAP.md` | Every phase, done and open, with what was built where |
| Original product and workflow plan | `Myseed_Content_Manager_Plan.md` | The first specification of the production workflow |
| Update 1.0 request list | `docs/Update-1.0.md` | The requests behind Update 1.0 |
| Update 1.2 plan | `docs/UPDATE-1.2-PLAN.md` | Financial data, Noor field registry, support platform, IVR and contact center |
| Update 1.2 source specification | `docs/planner.md` | The full brief Update 1.2 was planned from |
| Phase 17 plan: KRAs, KPIs and OKRs | `docs/PHASE-17-PLAN.md` | The detailed plan for performance management |
| Requested repairs and verification | `docs/REQUEST-REPAIR-TRACKER.md` | Repairs asked for and how each was verified |

## 3. Architecture and decisions

Library folder: *Myseed Ops documentation / 3. Architecture and decisions*

| Document | File | For |
| --- | --- | --- |
| Technical design | `docs/project/ARCHITECTURE.md` | The stack, code layout, database, security, jobs, integrations, deployment |
| Architecture decision records | `docs/project/DECISIONS.md` | Why things are the way they are (ADR-1 onwards) |
| The app shell on Android and iPhone | `docs/APP-SHELL.md` | The installed app around the live site |
| Customer support SDK and API | `docs/SUPPORT-SDK.md` | Connecting an app or website to support |

## 4. Operations and runbooks

Library folder: *Myseed Ops documentation / 4. Operations and runbooks*

| Document | File | For |
| --- | --- | --- |
| Runbook | `docs/RUNBOOK.md` | Running the system: setup, database, roles, how work moves, views, imports, configuration, troubleshooting |
| Backups, recovery and keeping the site running | `docs/RECOVERY.md` | What is backed up, restoring, who does what when something breaks |
| Deploying for free (Netlify and Supabase) | `docs/DEPLOY.md` | The earlier hosting setup, still possible |
| Accounts and teams | `docs/USERS.md` | The starting accounts |
| Department data managers | `docs/DATA-MANAGERS.md` | Bulk data in each department |
| Attendance kiosk setup | `docs/KIOSK-SETUP.md` | Pairing and installing kiosks |
| Face check-in guidelines | `docs/FACE-CHECKIN.md` | How face check-in works and the rules for it |
| Call center and phone menu setup | `docs/CALL-CENTER-SETUP.md` | Turning calls on, the IVR, queues and agents |

## 5. Quality and releases

Library folder: *Myseed Ops documentation / 5. Quality and releases*

| Document | File | For |
| --- | --- | --- |
| Test plan | `docs/project/TEST-PLAN.md` | Test levels, environments, devices, release test cases, exit criteria |
| Release history | `docs/project/RELEASE-HISTORY.md` | What shipped and when |

## 6. Dev team handbook

Library folder: *Dev team handbook*

| Document | File | For |
| --- | --- | --- |
| Dev team guidelines and rule book | `docs/dev-team/RULEBOOK.md` | The rules (RULE-1 onwards) |
| How the Dev team operates | `docs/dev-team/OPERATING-GUIDE.md` | Intake, the board and flow, sprints, review, measures |
| Onboarding a new developer | `docs/dev-team/ONBOARDING.md` | Access, setup, reading list, the first week |
| Writing specs and docs | `docs/dev-team/SPEC-GUIDE.md` | Which document to write, requirements, Markdown, review, repository documents |
| Releases, deploys and incidents | `docs/dev-team/RELEASE-GUIDE.md` | Shipping, checking, rolling back, incidents, backups |

## 7. Other Myseed projects

Each project's documentation sits in its own library folder, with the same six subfolders, and has its own index. The files are in `docs/projects/`, exported from each project's repository on 23 November 2026.

| Project | Library folder | Index |
| --- | --- | --- |
| MySeed Academy (the Myseed website and learning platform) | *MySeed Academy documentation* | [MySeed Academy index](../projects/myseed-academy/project/INDEX.md) |
| MySeed SchoolHub | *MySeed SchoolHub documentation* | [SchoolHub index](../projects/schoolhub/project/INDEX.md) |
| Transaction Verify | *Transaction Verify documentation* | [Transaction Verify index](../projects/transaction-verify/project/INDEX.md) |

To refresh a project's documents, export them again from its repository with the same prompt, replace its folder under `docs/projects/`, update its lines in `docs/library.json`, and open a pull request.

## 8. Kept in the repository only

These are not in the library: the control panel's guide (`control-panel/README.md`, the panel is not part of the server's build) and documents that are deliberately kept out of git.

## 9. Adding a document

1. Write it in Markdown under `docs/` (project documents in `docs/project/`, team documents in `docs/dev-team/`).
2. Add a line to `docs/library.json` with its file, library folder, kind and title.
3. Add it to this index.
4. Open a pull request. After the merge and deploy it appears in Specs and docs; locally, `npm run docs:sync` brings it in.
