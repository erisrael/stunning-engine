# Dev team guidelines and rule book

The rules every developer, tester and lead on the Myseed Dev team follows when working on Myseed Ops (the Myseed Content Manager and everything that grew around it). They apply to people and to AI coding assistants alike. How the team works day to day is in the [operating guide](OPERATING-GUIDE.md); this book is the set of rules that guide relies on.

Rules have IDs (RULE-1, RULE-2...) so a review comment, a retrospective note or a task can point at one. A rule marked **Must** is not broken without the exception process in section 14. A rule marked **Should** is the default; going another way needs a reason written in the pull request.

> [!IMPORTANT]
> Five rules matter more than the rest: nothing reaches `main` without review and green checks (RULE-10), schema changes are additive only (RULE-20), permissions are checked on the server (RULE-30), secrets never enter the repository (RULE-31), and tests never touch the live database (RULE-40).

## 1. Who this applies to

| Role | In the app | Responsible for |
| --- | --- | --- |
| Head of Dev (tech lead) | Dev team, position Head | Architecture, the schema, reviews, releases, production access, this rule book |
| Team lead | Dev team, position Lead | Planning and assigning, code review, unblocking, triage of incoming requests |
| Developer | Dev team, position Member, role Developer | Building and fixing what is assigned, tests, documentation of their change |
| Tester (QA) | Named as a tester in Configure, Flow | Accepting work into QA, passing it or returning it as a bug with steps to reproduce |
| Product owner | Manager or Owner role | What gets built and in which order, accepting finished features |

Until testers are named, heads and leads do QA (that is how the Dev flow is configured by default).

## 2. Work intake

- **RULE-1 (Must)**: Every piece of work is a task on the Dev board before anyone starts it. Requests that arrive by chat, call or email are turned into a task by whoever receives them, or sent through Requests so they land in the lead's intake.
- **RULE-2 (Must)**: A task is ready (Definition of Ready, section 5 of the [operating guide](OPERATING-GUIDE.md)) before it enters a sprint: who it is for, what done looks like, acceptance criteria, and a spec when the change is larger than a fix.
- **RULE-3 (Should)**: One task, one outcome. Work that needs several pull requests is an epic with child tasks.
- **RULE-4 (Must)**: Bugs carry steps to reproduce, what was expected, what happened, where (page, role, device, browser) and a screenshot or the error from Admin, System, Errors when there is one.
- **RULE-5 (Should)**: Priority is set by the lead at triage, not by the person asking. Production down or data at risk is always first.

## 3. Branches, commits and pull requests

- **RULE-10 (Must)**: `main` is production. The VPS deploys every new commit on `main` by itself, so nothing is pushed to `main` directly: changes arrive through a pull request that has at least one approving review from someone other than the author and green CI (type check, build, server tests, browser tests).
- **RULE-11 (Must)**: Work happens on a short-lived branch named after the task: `feat/DEV-42-offline-lessons`, `fix/DEV-57-chapa-date-range`, `docs/DEV-60-runbook`, `chore/...`, `refactor/...`, `test/...`. The task code in the branch or pull request title links them in the app.
- **RULE-12 (Must)**: Commit messages follow the style already in the history: a type, a colon, then what changed in plain words as the user would see it (`feat: ...`, `fix: ...`, `docs: ...`, `test: ...`, `chore: ...`, `refactor: ...`, `ops: ...`). Say what the change does, not how hard it was.
- **RULE-13 (Should)**: Pull requests stay small enough to review properly. A pull request that mixes a refactor with a feature is split.
- **RULE-14 (Must)**: The pull request description says what changed and why, how it was tested (commands, roles, devices), whether the database changes (and the new `SCHEMA_VERSION`), what to watch after the deploy, and how to undo it.
- **RULE-15 (Must)**: Nobody force-pushes to `main` or rewrites history that others have pulled.

## 4. Code review

- **RULE-16 (Must)**: The reviewer checks behaviour, not only style: permissions on the server, what happens with an empty list, a slow network, a phone screen, a second person editing the same thing, Amharic text, and the error paths.
- **RULE-17 (Should)**: Review comments are specific and kind. A comment that blocks the merge says so; a suggestion says it is optional.
- **RULE-18 (Should)**: A pull request gets its first review the same or the next working day. A pull request that waits longer is raised at stand-up.
- **RULE-19 (Must)**: The author does not merge their own pull request without an approval, even when they have the rights to.

## 5. Database and data

- **RULE-20 (Must)**: Schema changes are additive only: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, new indexes. Nothing is renamed or dropped in a release. Every change goes at the end of `SCHEMA_SQL` in `src/server/schema.ts` with a `-- vNN:` comment, `SCHEMA_VERSION` goes up by one, and a new table is added to `TABLES` (backups, restore and emptying the workspace depend on that list).
- **RULE-21 (Must)**: Data migrations inside the schema are safe to run on every start (they run each time the app opens the database) and cheap when there is nothing to do.
- **RULE-22 (Must)**: SQL uses `?` placeholders through `src/server/db.ts` (`all`, `get`, `run`, `tx`). Values are never pasted into SQL strings.
- **RULE-23 (Must)**: Work that changes several rows that belong together runs in `tx(...)`.
- **RULE-24 (Must)**: The audit trail is append-only. Important actions write an audit event; nothing edits or deletes old events.
- **RULE-25 (Must)**: Before any operation that replaces or deletes production data (a restore, a bulk import, the copy scripts), a backup is taken and its file name is written in the task.

## 6. Security, privacy and access

- **RULE-30 (Must)**: Every server action and API route checks who is asking and what they may do, on the server (`requireViewer`, `can(...)`, `workAccess(...)` for departments). Hiding a button is never the protection.
- **RULE-31 (Must)**: Secrets (API keys, passwords, the encryption secret, tokens, connection strings) never go into the repository, a commit message, a screenshot, a task, a chat message or a prompt to an AI tool. On the VPS they live in the server's `.env`, written by the control panel over SSH. Locally they live in `.env`, which is ignored by git.
- **RULE-32 (Must)**: Personal data (staff records, students, parents, payments, call recordings) is used only for the task at hand. Real personal data is not copied to a laptop for testing when made-up data would do; when real data is needed it is deleted afterwards.
- **RULE-36 (Must)**: Members see only their own work and what a head or lead shares with them (Dev team, Access; the Share button in Specs and docs). Share the least that does the job: view only unless the person needs to export or download. Every access alert is reviewed by a head or lead.
- **RULE-33 (Must)**: Production access (the VPS, the control panel's Hostinger connection, the production database) is held by the Head of Dev and the people the Head names. Access is removed the day someone leaves the team.
- **RULE-34 (Must)**: Calls to Noor go through Noor's protection (`src/server/noor-gate.ts`), which gates and paces every request. Nobody adds a direct call around it.
- **RULE-35 (Should)**: Dependencies are added only when they earn their place, from well-known packages, at an exact reviewed version (`package-lock.json` is committed). Security advisories for Next.js and other core packages are applied promptly (as with the Next.js 16.4.6 upgrade).

## 7. Tests and quality

- **RULE-40 (Must)**: Tests run against throwaway databases, never the live one. `npm test` and `npm run test:e2e` already set `DATABASE_URL` to empty and give each test its own copy of a seeded demo workspace; nobody changes that.
- **RULE-41 (Must)**: A change comes with its tests: a server test in `tests/server/` for logic and permissions, a browser test in `tests/e2e/` for a new screen or flow. A bug fix adds the test that would have caught it.
- **RULE-42 (Must)**: Before asking for review the author runs `npm run typecheck` and the server tests for the area they touched (`npm test -- library dev-studio`), and the full suite when the change is broad.
- **RULE-43 (Must)**: Outside services are faked in tests (`MAIL_FAKE`, `AI_FAKE`, the local Chapa and YouTube stand-ins). No test calls a real payment, SMS, Telegram or Noor endpoint.
- **RULE-44 (Should)**: Features are checked on a phone-width screen and in both light and dark mode before review.

## 8. Product and interface rules

- **RULE-50 (Must)**: No emojis anywhere in the product: pages, bot texts, seeds and scripts use monochrome icons (Lucide or Phosphor) and plain labels. `tests/server/no-emoji.test.ts` enforces it.
- **RULE-51 (Must)**: Words on screen are plain and short, in sentence case, and say what happens ("Send for review", not "Submit"). Colour is never the only signal: every status also has a label.
- **RULE-52 (Must)**: Screens work from a phone to a wide screen, and in light and dark mode. Amharic (Ethiopic script) displays correctly wherever names and content can be Amharic.
- **RULE-53 (Should)**: A new area is a separate module (its own route, server file and tables) that can be switched on in Settings, so it does not disturb what already runs.
- **RULE-54 (Must)**: Third-party assets (models, textures, fonts, sounds, images) are used only under a licence that allows it (CC0, CC BY, MIT and similar), and credits are kept in `public/models/CREDITS.txt` or next to the asset. Unclear or non-commercial licences are not used.
- **RULE-55 (Should)**: Free and self-run options come first. A paid service is proposed with what it costs and what the free alternative would lack, and the product owner decides.

## 9. Documentation

- **RULE-60 (Must)**: A change that alters how something is set up, deployed, recovered or used updates the matching document in `docs/` in the same pull request.
- **RULE-61 (Must)**: Larger features start from a spec in Dev team, Specs and docs (SRS, product brief or technical design), with requirement IDs such as FR-1 linked to the tasks that build them. See the [specs and docs guide](SPEC-GUIDE.md).
- **RULE-62 (Should)**: Significant technical decisions are written as a decision record (ADR) in [the decision log](../project/DECISIONS.md): the context, the decision and what it makes easier or harder.
- **RULE-63 (Must)**: The repository's documents listed in `docs/library.json` are edited in the repository, through a pull request. The app shows them in Specs and docs and keeps them in step on every deploy. An edit made in the app detaches that document from its file (the app's text is kept from then on), so it is used only for a deliberate fork.
- **RULE-64 (Should)**: The roadmap (`docs/ROADMAP.md`) and the [progress report](../project/PROGRESS.md) are updated when a phase is finished or its scope changes.

## 10. Releases and production

- **RULE-70 (Must)**: A release goes out only when every task in it has passed QA, the checks are green and the release notes are written (Dev team, Releases and quality). See the [release, deploy and incident guide](RELEASE-GUIDE.md).
- **RULE-71 (Must)**: After every deploy someone checks `https://ops.myseed.com.et/api/health` and signs in to confirm the changed area works.
- **RULE-72 (Should)**: Risky releases (schema changes, payments, sign-in, Noor, calls) go out early in the working day, when people are around to watch them, not before a weekend or a holiday.
- **RULE-73 (Must)**: A release that breaks production is rolled back first and debugged second (the control panel's Roll back, or a revert commit on `main`).

## 11. Incidents

- **RULE-80 (Must)**: Whoever notices production is down, data is wrong or money is at risk tells the Head of Dev at once (call, not only chat) and records an incident in Dev team, Releases and quality.
- **RULE-81 (Must)**: Every incident of severity 1 or 2 gets a postmortem in Specs and docs (the Postmortem template): what happened, the timeline, the root cause, what went well, what went badly, and actions with owners. Postmortems are blameless.

## 12. AI coding assistants

- **RULE-90 (Must)**: An AI assistant working in the repository follows `AGENTS.md` (this Next.js version differs from what most tools know; read the guide in `node_modules/next/dist/docs/` before writing Next.js code) and every rule in this book.
- **RULE-91 (Must)**: AI-written changes are reviewed like any other change, by a person who understands them. "The assistant wrote it" is not a reason to skip a test or a review.
- **RULE-92 (Must)**: No secrets, personal data or production data are pasted into an AI tool (RULE-31, RULE-32).

## 13. Communication

- **RULE-95 (Should)**: Work talk happens where it can be found again: on the task (comments, links, the pull request), in the Dev team's group in Team chat, or in Specs and docs. Decisions made in a call are written on the task afterwards.
- **RULE-96 (Must)**: Blockers are raised the day they appear: in the stand-up notes (blockers there are sent to the leads) or directly to the lead.
- **RULE-97 (Should)**: Anyone taking leave hands over their open tasks (reassigned or with a note on where they stand) before they go.

## 14. Exceptions and changes to this book

- An exception to a **Must** rule is agreed with the Head of Dev before the work, and written on the task or pull request with the reason and when it ends. In an emergency (production down) the Head may agree afterwards; the incident's postmortem records it.
- Anyone may propose a change to this book through a pull request to `docs/dev-team/RULEBOOK.md`. The Head of Dev approves changes; the team hears about them at the next sprint review.
- This document is the repository's copy. Specs and docs shows the same text and follows the file when it changes.

## Related documents

- [How the Dev team operates](OPERATING-GUIDE.md)
- [Onboarding a new developer](ONBOARDING.md)
- [Writing specs and docs](SPEC-GUIDE.md)
- [Releases, deploys and incidents](RELEASE-GUIDE.md)
- [Technical design](../project/ARCHITECTURE.md) and [decision log](../project/DECISIONS.md)
