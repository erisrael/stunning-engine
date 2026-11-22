# Onboarding a new developer

What a new developer (or tester) on the Myseed Dev team needs to get access, set up a computer, understand the system and ship a first change. The lead who welcomes them works through the checklist with them.

## 1. Access checklist (for the lead)

- [ ] An account in Myseed Ops (Admin, People) with the **Developer** role
- [ ] Added to the Dev team with the right position (Member, Lead or Head) in Admin, Departments
- [ ] Added to the Dev team's group in Team chat
- [ ] Read access to the GitHub repository, then write access once the first pull request has been reviewed
- [ ] A first task picked from the backlog: small, real, and in one area of the code
- [ ] **Not** on day one: VPS, control panel, production database or provider keys. Those are given by the Head of Dev when the person's work needs them (RULE-33)

## 2. Set up the computer

You need:

- **Node.js 22 or newer** (CI runs Node 24) and npm 10 or newer
- **Git**
- **Google Chrome** for the browser tests (or set `CHROME_PATH` to another Chromium)
- An editor; the team uses VS Code

Then:

```bash
git clone <the repository address>
cd stunning-engine
npm install
npm run setup        # empty local database, the accounts, chat groups, the real curriculum and the import templates
npm run dev          # the address it prints, http://localhost:3020 in the runbook
```

Without `DATABASE_URL` the app keeps its data in an embedded PostgreSQL (PGlite) in `data/pg`, running the same SQL as production. Nothing else needs installing. Stop `npm run dev` before running any `db:` command, because both use the same database files.

`npm run db:reset` prints each starting account's generated password and saves them to `data/initial-credentials.md` on your computer (never committed). The accounts are listed in [USERS.md](../USERS.md).

> [!WARNING]
> Never point your local app or the tests at the production database. Leave `DATABASE_URL` empty in your `.env` unless the Head of Dev has asked you to run a specific script against another database.

## 3. Check that everything works

```bash
npm run typecheck        # TypeScript
npm test -- library      # one server test file, against a throwaway copy of a demo workspace
npm test                 # all server tests
npm run build            # production build (needed before browser tests)
npm run test:e2e -- library
```

Every test command creates its own database; none of them touches `data/pg` or production.

## 4. Find your way around the code

| Folder | What is in it |
| --- | --- |
| `src/app/(app)/` | The signed-in pages (one folder per area: `dev`, `hr`, `finance`, `support`, `legacy-cms`...) |
| `src/app/actions/` | Server actions the pages call |
| `src/app/api/` | Routes for outside callers: health, cron, exports, webhooks, the support API, server-sent events |
| `src/server/` | The business logic: one file per area (`dev-studio.ts`, `dev-library.ts`, `workflow.ts`, `chapa-sync.ts`...), the database layer (`db.ts`) and the schema (`schema.ts`) |
| `src/components/` | UI components; shadcn primitives in `components/ui` |
| `src/lib/` | Code shared by the browser and the server: types, labels, templates, formatting |
| `tests/server/`, `tests/e2e/` | Server tests and browser tests; `tests/run.ts` runs them |
| `scripts/` | Database commands, backups, verification, the docs sync |
| `docs/` | Runbooks, setup guides, plans and this handbook |
| `deploy/vps/`, `Dockerfile` | How the VPS builds and runs the app |
| `control-panel/` | The Python control panel that deploys to the VPS and manages backups |
| `desktop/`, `mobile/` | The Windows app (Electron) and the Android app (Capacitor) |

The [technical design](../project/ARCHITECTURE.md) explains how these fit together.

> [!IMPORTANT]
> This project uses Next.js 16, which differs from what many tutorials and AI tools know. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` (see `AGENTS.md`).

## 5. Read, in this order

1. [Product overview](../project/PRODUCT-OVERVIEW.md): what the system is for and who uses it
2. [Rule book](RULEBOOK.md) and [how the team operates](OPERATING-GUIDE.md)
3. [Technical design](../project/ARCHITECTURE.md) and the [decision log](../project/DECISIONS.md)
4. [Runbook](../RUNBOOK.md) sections 1 to 5: local setup, the database, roles, how work moves
5. [Test plan](../project/TEST-PLAN.md)
6. The [roadmap](../ROADMAP.md) phase for the area of your first task

## 6. The first week

- **First days**: set up, run the app, sign in as different roles (Admin, a Recording member, a Dev member) and walk through the area of your first task. Read the server file and the test for that area.
- **First task**: branch, build, test, open the pull request (see the [operating guide](OPERATING-GUIDE.md), sections 3 and 7). Your lead reviews it with you.
- **By the end of the week**: one change merged and released, a stand-up note every day, and a question list for your lead.

## 7. Getting help

- Ask in the Dev team's group in Team chat or on the task. Nobody minds questions; a question asked early saves a day.
- Something about production (an error, a slow page, wrong data): tell the lead straight away, do not try fixes on the live site.
- Unsure whether a rule applies: ask the lead, and if the rule book is unclear, propose a fix to it.
