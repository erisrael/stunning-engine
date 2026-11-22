# Myseed Content Manager

One workspace for producing Myseed's educational content through Recording, Editing, Uploading and Publication. Every part of the curriculum has a visible owner, status per stage, files and camera codes, comments, chat and a complete, append-only history.

The product specification is in [Myseed_Content_Manager_Plan.md](Myseed_Content_Manager_Plan.md). Operation and deployment are covered in the [runbook](docs/RUNBOOK.md); the starting accounts are in [docs/USERS.md](docs/USERS.md).

## Quick start

Requires Node.js 22 or newer.

```bash
npm install
npm run setup     # empty database + accounts, chat groups, real curriculum (data-import/curriculum.json), import templates
npm run dev       # http://localhost:3020
```

Sign in with one of the starting accounts in [docs/USERS.md](docs/USERS.md). `npm run setup` prints each account's generated starting password and saves them to `data/initial-credentials.md` on your computer (never committed); everyone chooses a new password at first sign-in.

Locally the app uses an embedded PostgreSQL in `data/pg`. In production set `DATABASE_URL` to a Supabase (or any PostgreSQL) connection string. Deploying to Netlify is described step by step in the runbook, section 3.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` and `npm start` | Production build and server |
| `npm run setup` | `db:reset` plus import templates |
| `npm run db:reset` | Empty everything, load accounts, chat groups and the curriculum backup |
| `npm run db:empty` | Delete all data (`-- --keep-accounts` keeps accounts and settings) |
| `npm run db:import -- file.json` | Add or update a curriculum tracker backup |
| `npm run db:status` | Row counts |
| `npm run backup`, `npm run db:restore -- file.json` | Full JSON backup and restore |
| `npm run templates` | Write the import templates (Excel and CSV) to `templates/` (not committed; the app serves them itself under Import and export) |
| `npm run checks` | Run scheduled deadline, blocker, timer, handoff and question checks |
| `npm run verify` | Workflow, permission and import verification against a throwaway database (66 checks) |
| `npm run typecheck` | TypeScript check |
| `npm test`, `npm run test:e2e` | Server and browser tests, each on a throwaway database |
| `npm run docs:sync` | Bring the documents listed in `docs/library.json` into Dev team, Specs and docs (the server also does this when it starts) |

## Documentation

Everything about the project is listed in the [documentation index](docs/project/INDEX.md): the [product overview](docs/project/PRODUCT-OVERVIEW.md), [requirements](docs/project/SRS.md), [technical design](docs/project/ARCHITECTURE.md), [decisions](docs/project/DECISIONS.md), [test plan](docs/project/TEST-PLAN.md), [release history](docs/project/RELEASE-HISTORY.md) and [progress report](docs/project/PROGRESS.md), and the Dev team handbook: the [rule book](docs/dev-team/RULEBOOK.md), [how the team operates](docs/dev-team/OPERATING-GUIDE.md), [onboarding](docs/dev-team/ONBOARDING.md), [writing specs and docs](docs/dev-team/SPEC-GUIDE.md) and [releases, deploys and incidents](docs/dev-team/RELEASE-GUIDE.md). The same documents appear formatted in the app under Dev team, Specs and docs.

## What is included

- **Six roles** (Recording, Editing, Uploading, Publication, Manager, Admin) with a per-role permission matrix and grade and subject access, enforced on the server for every action, list, export and notification.
- **Admin** for people and profiles, roles and permissions, access, curriculum import, backups and emptying the workspace.
- **Workflow engine** with explicit start, pause, block, submit, accept, return and reopen actions, evidence gates per stage (recordings by camera code), versioned files, publication that requires verified live links, revisions, idempotent retries and conflict detection.
- **Views**: Home dashboards, Overview (Grade → Subject or Subject → Grade, merged table or hierarchy), List, Sheet (role presets, every column optional), Board, Calendar, Coverage (matrix plus units and parts with a status per stage), Reports and Team.
- **Page view** for every item: a document-style form where each person edits only their own stage and can comment on any field.
- **Chat**: Telegram-style groups in the top bar, with mentions, replies, pins, item links and member management by managers and admins.
- **Import and export** with a guided wizard, dry runs, valid-only imports and error files; CSV, Excel and JSON exports.
- **Interface** in a ClickUp-style theme with the Myseed logo, light and dark modes, Amharic-ready typography and layouts from phones to wide screens.

## Project layout

```
src/server/        database (PostgreSQL / PGlite), schema, workflow engine, chat, structure report, importer, exporter, checks
src/app/(app)/     authenticated pages
src/app/actions/   server actions used by the pages
src/components/    shared UI (shadcn components in components/ui)
scripts/           database commands, templates, checks, backup, verify
data-import/       curriculum tracker backup loaded by db:reset
netlify/           scheduled function for alerts
docs/              runbook and starting accounts
```
