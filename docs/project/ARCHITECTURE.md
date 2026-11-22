# Technical design: Myseed Ops

How Myseed Ops is built and run: the stack, the code layout, how a request flows, the database, security, scheduled work, integrations, deployment and the clients around the web app. Decisions behind it are in the [decision log](DECISIONS.md).

## 1. Stack

| Layer | Technology |
| --- | --- |
| Web framework | Next.js 16.4 (App Router, Server Actions, `instrumentation.ts`), React 19.3, TypeScript 5 |
| UI | Tailwind CSS 4, shadcn components (`src/components/ui`), Lucide and Phosphor icons, seven UI styles and colour themes, light and dark |
| Database | PostgreSQL through `postgres` (production: PostgreSQL 17 on the VPS, or Supabase); PGlite (embedded PostgreSQL in WebAssembly) locally and in tests |
| Documents and files | `docx` (Word), `exceljs` (Excel), `pptxgenjs` (PowerPoint), `jszip`, `papaparse`, `marked` (Markdown), `qrcode`, `jsqr` |
| Identity | Sessions in a signed cookie, password rules and lockouts, two-step sign-in, passkeys (`@simplewebauthn`), Google and Microsoft sign-in |
| Face check-in | `@vladmandic/face-api` in the browser at the kiosk |
| Mail | `nodemailer` (SMTP) or a web API (Brevo, Resend); `imapflow` and `mailparser` for the inbox |
| AI | Anthropic SDK and other providers chosen in Admin, for the assistant and HR helpers |
| 3D (Fun mode, Seed Town) | three.js 0.180, Rapier physics, three-vrm for characters |
| Desktop and mobile | Electron (`desktop/`), Capacitor (`mobile/`, `capacitor.config.json`) |
| Tests | `tsx` scripts with PASS and FAIL lines, headless Chrome for browser tests (`tests/run.ts`) |

## 2. Code layout

```
src/
  app/(app)/        signed-in pages, one folder per area
  app/actions/      server actions ("use server"), thin wrappers that check the viewer and call src/server
  app/api/          routes for outside callers: health, cron, exports, webhooks, the support API, server-sent events
  app/arcade, kiosk, support-app, support-widget, login, ...   public surfaces
  server/           business logic, one file per area, and the database layer
  components/       UI; components/app for the product, components/ui for primitives
  lib/              code shared by browser and server: types, labels, templates, rendering
  instrumentation.ts   start-up work: Noor gate, docs sync, the scheduled-jobs timer
tests/server, tests/e2e, tests/fixtures
scripts/            database commands, backups, verify, docs sync, asset fetching
deploy/vps/, Dockerfile        the VPS
control-panel/      the Python control panel (deploys, backups, data copy)
desktop/, mobile/   the Windows and Android apps
docs/               runbooks, guides, plans, this documentation (docs/library.json lists what goes into Specs and docs)
```

The server folder holds around two hundred modules. Each area keeps its logic together: for example `dev-studio.ts` (sprints, roadmap, documents), `dev-library.ts` (folders, files, import and export), `dev-tools.ts` (releases, incidents, tests), `workflow.ts` (the production stage engine and the audit trail), `chapa-sync.ts`, `support-*.ts`, `cms-*.ts` (Noor), `fun-*.ts`.

## 3. How a request flows

1. A page in `src/app/(app)/...` is a server component; it loads the viewer (`getViewer` in `src/server/auth.ts`) and the data it needs from `src/server`.
2. Interactive parts are client components that call **server actions** in `src/app/actions/`. Each action calls `requireViewer()` and passes the viewer to a server function; results come back as `{ ok, data }` or `{ ok: false, error }` (`src/server/action-result.ts`).
3. Server functions check rights themselves: `can(user, capability)` for workspace permissions, `workAccess(user, dept, "write")` for departments (it also reads the department's configuration). Errors are `WorkflowError` with a code (`VALIDATION`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`) and a message for people.
4. Data goes through `src/server/db.ts`.
5. Outside callers (cron, webhooks, exports, the support API) use routes in `src/app/api/`, each with its own check (a signed-in viewer, `CRON_SECRET`, a signature, an API key).
6. Live screens (support desk, the admin live dashboard) use **server-sent events** (`src/server/sse.ts`): the server sends a JSON state when it changes and the browser reconnects by itself.

## 4. Database

- **One SQL dialect everywhere**: production uses PostgreSQL through `DATABASE_URL`; without it an embedded PGlite stores data in `data/pg`. Queries use `?` placeholders, converted to `$1, $2...`. Helpers: `all`, `get`, `run`, `tx` (transactions through AsyncLocalStorage, so nested calls join the open transaction).
- **The schema is one file**, `src/server/schema.ts`: `SCHEMA_SQL` runs every time the app opens the database (every statement is `IF NOT EXISTS` or otherwise safe to repeat), then `schema_version` is recorded. Changes are appended with a `-- vNN:` comment and `SCHEMA_VERSION` goes up (it is 88 with this documentation update).
- **Additive only**: nothing is renamed or dropped, so the previous release always runs on the newer schema and rolling back the code is always possible.
- **`TABLES`** lists every table in dependency order; backups, restore, emptying the workspace and the copy scripts use it.
- **History**: `audit_events` is append-only (who, what, when, old and new values).
- **Files** that belong to records (library files, HR documents, recordings, feedback screenshots) are stored in the database, so a backup holds everything; links to the company's media storage (Drive, NAS, buckets) are checked weekly.

## 5. Security and privacy

- Sessions: a `myseed_session` cookie; the sign-in policy (password rules, lockouts, two-step, passkeys, Google and Microsoft) is set by Admin; sessions and devices can be ended from Profile and Admin.
- Permissions are enforced on the server for every action, list, export and notification (RULE-30). Roles have a permission matrix by area (View, Edit, Delete, Update), plus grade and subject access for production, plus department positions (head, lead, member).
- Secrets: provider keys are sealed in the database with the server's encryption secret; server settings are in the server's `.env`, written by the control panel over SSH standard input, never in a command line, the repository or a log.
- Noor: every request to Noor goes through `src/server/noor-gate.ts`, which gates and paces it; live Noor is for Admin and people granted it, everyone else reads the saved copy.
- Data protection: a versioned privacy notice with acceptance, a retention schedule applied daily, Download my data, and a log of who opened whose record.
- Errors are recorded in the app with email addresses, numbers and keys masked.

## 6. Scheduled and background work

`src/instrumentation.ts` runs when the server starts:

- installs the Noor gate;
- after 20 seconds, brings the repository's documents into Specs and docs (`src/server/doc-sync.ts`, switch off with `MYSEED_DOCS_SYNC=0`);
- every 10 minutes runs the scheduled jobs (`src/server/jobs.ts`: work alerts, trash, chat files and retention, HR and training reminders, budgets, kiosks, face data, the email outbox, backups, housekeeping, the flow's merged pull requests), switch off with `MYSEED_TIMER=0`;
- every minute runs the CMS and Chapa refreshes (queued Noor tasks, scheduled CMS sync, reports, Chapa, metrics, the field mirror).

The same jobs can be triggered from outside with `GET /api/cron/checks` and `Authorization: Bearer <CRON_SECRET>` (the GitHub Actions schedule in `.github/workflows/schedule.yml` does this and doubles as an uptime check). A lease stops two runs at once; each job's last run, result and error are kept, and a job failing twice alerts Admin.

## 7. Integrations

| Service | Used for | Server files |
| --- | --- | --- |
| Chapa | Payments per business: transactions, balances, sync and reconciliation, webhooks | `chapa.ts`, `chapa-sync.ts`, `chapa-hub.ts` |
| Noor (Legacy CMS) | Reading Noor's admin pages safely; records, reports, the academic content manager | `cms-*.ts`, `noor-gate.ts` |
| Telegram | Support bots, the Mini App, alerts to Admin | `support-channels.ts` and related |
| SMS (i-Conic) | Messages from tickets, delivery reports | `sms.ts`, `sms-console.ts` |
| Email | SMTP or web API sending; IMAP inbox | `email.ts`, `mail.ts` |
| AI providers | The assistant, HR helpers, Seed Town conversations when allowed | `assistant-ai.ts`, `hr-ai.ts` |
| GitHub and GitLab | Repositories, pull requests, checks, merges moving tasks | `github.ts`, `dev-tools.ts` |
| Notion, Office, Power BI | Documents both ways with Notion; Office exports; Power BI and Excel feeds | `notion.ts`, `office.ts` |
| Google | Sign-in, Drive backups, Meet links | `google.ts` |
| Myseed App | Publishing videos (`POST /videos`), the support SDK | `files-publishing.ts`, `support-*.ts` |

Provider calls are logged with their status (Admin, External APIs) and every outside service is faked in tests.

## 8. Deployment

- **Production**: a Hostinger VPS running Docker Compose project `myseed-cm` from `deploy/vps/docker-compose.yml`: the app (built from `Dockerfile`, `npm run build` then `npm start`, memory capped, health-checked on `/api/health`), PostgreSQL 17 (profile `localdb`, protected from the out-of-memory killer) and Caddy for HTTPS (profile `caddy`).
- **Auto deploy**: `deploy/vps/deploy.sh` checks `main` every 2 minutes, builds a new release, switches to it when the health check passes and keeps the previous one otherwise. Docker's build cache is trimmed on each deploy.
- **Watchdog**: `deploy/vps/watchdog.sh` restarts an app that stops answering.
- **Control panel**: `control-panel/control_panel.py` (port 8765) prepares the server, deploys, rolls back, restarts, backs up and restores, copies data between this computer and the VPS, and sets up the domain.
- **Earlier setup**: Netlify and Supabase on their free plans ([DEPLOY.md](../DEPLOY.md)), still possible.
- **Domain**: ops.myseed.com.et (myseedops.tech is retired).

## 9. Documents in the app

Department documents (`dept_docs`) are Markdown. `src/lib/spec-doc.ts` renders them as the company document (header, document control, contents, body) for the formatted view, PDF and HTML; raw HTML is shown as text and only safe links are kept. `src/server/dev-library.ts` imports Word and web pages as Markdown, keeps Markdown files as they are, and exports Word, Markdown and HTML. `src/server/doc-sync.ts` keeps the files listed in `docs/library.json` in step with their documents (`dept_doc_sources`), never overwriting an edit made in the app and never bringing back a deleted document.

## 10. Clients around the web app

- **Kiosk** (`/kiosk`): paired devices for attendance, installable on its own, works offline and sends check-ins later.
- **Support surfaces**: the website widget, the support app (web, Telegram sign-in or guest), the Telegram Mini App and bots, all on the support API (`/api/support/v1`).
- **App shell** (`mobile/`, Capacitor): the live site in a native shell; the Android arcade build pins itself to the screen.
- **Windows app** (`desktop/`, Electron): launcher with graphics presets and diagnostics, automatic updates from `ops.myseed.com.et/downloads/desktop`, the locked arcade kiosk, and Seed Town Offline (the site and games with their own local database, built with `NEXT_OUTPUT=standalone`).

## 11. Observability

- Errors from the server, browsers and jobs, grouped, in Admin, System, Errors; alerts by the bell, email and Telegram.
- Health in Admin, System, Health (database, jobs, backups, email, storage, encryption key, memory) and `/api/health` for outside checkers.
- Page timings in Admin, Usage; API usage and provider call logs in Admin, Platform.
