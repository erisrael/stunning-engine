# Architecture decision records

The decisions that shape Myseed Ops, written down so nobody has to guess why things are the way they are. Each record has a context, the decision and its consequences. A decision is changed by adding a new record that replaces the old one (the old one stays, marked "Replaced by ADR-n").

New records go at the end with the next number. Use the **Architecture decision record** template in Specs and docs for a long one and copy it here once accepted (RULE-62).

| ID | Decision | Status |
| --- | --- | --- |
| ADR-1 | One Next.js application with server actions | Accepted |
| ADR-2 | PostgreSQL everywhere, with PGlite on developers' computers | Accepted |
| ADR-3 | Additive-only schema in one file | Accepted |
| ADR-4 | Permissions enforced on the server | Accepted |
| ADR-5 | An append-only audit trail | Accepted |
| ADR-6 | Self-hosted on a VPS, deployed from `main` | Accepted |
| ADR-7 | Free and self-run services first | Accepted |
| ADR-8 | Tests only against throwaway databases | Accepted |
| ADR-9 | No emojis in the product | Accepted |
| ADR-10 | Noor is read through a gate that paces every request | Accepted |
| ADR-11 | Seed Town stays a browser game on three.js | Accepted |
| ADR-12 | Licensed assets only, with credits | Accepted |
| ADR-13 | Documents are Markdown, formatted on display; the repository's docs are synced into the library | Accepted |

## ADR-1: One Next.js application with server actions

**Status**: Accepted

**Context**: A very small team builds and runs a system with many modules. Separate front-end and API services would double the deploys, the types and the places where permissions are checked.

**Decision**: One Next.js App Router application. Pages are server components; interactive parts call server actions in `src/app/actions/`, which call the business logic in `src/server/`. API routes exist only for outside callers (cron, webhooks, exports, the support API, server-sent events).

**Consequences**: One deploy, one type system from the database to the screen, and permissions checked in one place. Outside systems get a narrow, deliberate API. The application is large, so modules must stay separate (one server file per area, switchable in Settings). Next.js 16 differs from older versions; developers read the bundled docs first (`AGENTS.md`).

## ADR-2: PostgreSQL everywhere, with PGlite on developers' computers

**Status**: Accepted

**Context**: Developers need a working database without installing a server; production needs a real PostgreSQL. Using SQLite locally would mean two SQL dialects.

**Decision**: PostgreSQL in production (on the VPS, or Supabase), and PGlite (PostgreSQL compiled to WebAssembly) when `DATABASE_URL` is empty. All SQL goes through `src/server/db.ts` with `?` placeholders.

**Consequences**: `npm run setup` gives a full working copy in one command, and tests run on throwaway copies. Behaviour under heavy concurrency can differ between PGlite and a hosted PostgreSQL, so risky changes are also checked against a copy of production data.

## ADR-3: Additive-only schema in one file

**Status**: Accepted

**Context**: Deploys happen many times a week with no maintenance window, and a release must be easy to roll back.

**Decision**: The whole schema is `SCHEMA_SQL` in `src/server/schema.ts`, run on every start. Changes are only `CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, indexes and repeat-safe data fixes, appended with a version comment. Nothing is renamed or dropped.

**Consequences**: No migration tool and no migration order to get wrong; the previous release always runs on the newer schema. Unused columns and tables accumulate and are cleaned up only with a deliberate, separately planned change.

## ADR-4: Permissions enforced on the server

**Status**: Accepted

**Context**: The system holds payroll, HR cases, payments, recordings of calls and students' data. Many roles see different parts of it.

**Decision**: Every server action, list, export and notification checks the viewer's role permissions (`can`), grade and subject access, and department position (`workAccess`). The interface hides what a person cannot use, but that is never the protection.

**Consequences**: A forgotten button cannot leak data. Every new action needs its check and a test that the wrong role is refused.

## ADR-5: An append-only audit trail

**Status**: Accepted

**Context**: Production work, approvals, payments and HR decisions need to be traceable: who did what, when, and what it was before.

**Decision**: Important actions write to `audit_events` (actor, action, summary, old and new values, time). Events are never edited or deleted; a correction is a new event that points at the old one.

**Consequences**: Reports and history views can be trusted. The table grows steadily, which is fine at Myseed's size.

## ADR-6: Self-hosted on a VPS, deployed from `main`

**Status**: Accepted (replaces the first setup on Netlify and Supabase free plans, which stays documented in DEPLOY.md)

**Context**: Free serverless plans could not hold long-running work (the scheduled jobs timer, server-sent events, Noor syncs) and put the database far away.

**Decision**: A Hostinger VPS runs Docker Compose (the app, PostgreSQL 17 and Caddy). The VPS checks `main` every 2 minutes and deploys new commits by itself, keeping the previous release when a build or health check fails. A control panel on the developer's computer prepares the server, deploys, rolls back and backs up.

**Consequences**: Deploys are a merge to `main`, so `main` must always be releasable and protected by review and CI. There is no staging site yet: risky changes rely on tests, careful timing and fast rollback.

## ADR-7: Free and self-run services first

**Status**: Accepted

**Context**: Myseed prefers not to take on running costs for tooling.

**Decision**: The free or self-run option comes first: errors, health and page timings are kept in the app instead of a paid monitoring service; uptime comes from a GitHub Actions schedule; calls are browser to browser with TURN, without a media server; backups go to the server, Google Drive or any S3-compatible storage. A paid service is chosen only by the product owner, with its cost.

**Consequences**: Low running costs and fewer accounts to manage, at the price of building and maintaining some tooling in the product.

## ADR-8: Tests only against throwaway databases

**Status**: Accepted

**Context**: A test run against the live database could delete or change real records.

**Decision**: `tests/run.ts` sets `DATABASE_URL` to empty for every child process and gives each test file its own copy of a seeded demo workspace in a temporary folder. Outside services are faked.

**Consequences**: Tests can create, change and delete freely. They do not prove behaviour against real providers; those are checked by hand after deploys (the test plan lists them).

## ADR-9: No emojis in the product

**Status**: Accepted

**Context**: Emojis render differently on every device, look unprofessional in a company system, and were creeping into bot texts and menus.

**Decision**: Pages, bot texts, seeds and scripts use monochrome icons (Lucide, Phosphor) and plain labels. The only exception is the emoji picker people use themselves in chat. `tests/server/no-emoji.test.ts` fails when one appears in `src`, `public` or `scripts`.

**Consequences**: A consistent look everywhere; old saved icons are read as icon names.

## ADR-10: Noor is read through a gate that paces every request

**Status**: Accepted

**Context**: Noor is an outside platform. Too many requests, or many people using live Noor at once, could slow it or end sessions (Noor ends the older session on every sign-in).

**Decision**: Every request to Noor's address goes through `src/server/noor-gate.ts` (installed at start-up), which gates and paces it. One shared Noor session per account. Live Noor is for Admin and people granted it; everyone else reads the saved copy, refreshed in the background.

**Consequences**: Noor is protected from the app; some screens show data as of the last refresh rather than this second.

## ADR-11: Seed Town stays a browser game on three.js

**Status**: Accepted

**Context**: Fun mode's Seed Town grew into a 3D town with racing, shooting and sports. Unreal or Unity would look better but need their own editors, accounts and a rewrite of accounts, coins, online play and every game.

**Decision**: Keep three.js in the browser; get realism from licensed assets, better rendering and performance work. The Windows app (Electron) and Seed Town Offline package the same code.

**Consequences**: One code base and the same accounts and online play. Performance work never ends (adaptive resolution, merging and culling) and some effects stay out of reach of a browser engine.

## ADR-12: Licensed assets only, with credits

**Status**: Accepted

**Context**: Models, textures and sounds are found online with all kinds of licences.

**Decision**: Use only assets whose licence allows it (CC0, CC BY, MIT and similar), keep the credits in `public/models/CREDITS.txt` and the Admin asset library, and leave out anything with an unclear or non-commercial licence, however good it looks.

**Consequences**: Some well-known car models and characters are not available; what is shipped is safe to ship.

## ADR-13: Documents are Markdown, formatted on display; the repository's docs are synced into the library

**Status**: Accepted (23 November 2026)

**Context**: Specs and docs stored documents as plain text with "#" headings and showed them in a text box; imported Word files lost their tables, and the project's documentation lived only in the repository, out of sight of most of the team.

**Decision**: A document's text is Markdown, stored exactly as written or imported (Word and web pages are converted once on import). `src/lib/spec-doc.ts` renders it as the company document for the formatted view, the PDF and the HTML export, safely (raw HTML shown as text, only web, mail, phone and in-page links). The Markdown files listed in `docs/library.json` are brought into the Dev team library on every start (`src/server/doc-sync.ts`); an edit in the app detaches that document from its file, and a deleted document stays deleted.

**Consequences**: One source of truth for the project's documentation (the repository, through pull requests) that everyone can read formatted in the app. Editing a synced document in the app forks it, so the rule book asks for edits in the repository (RULE-63).
