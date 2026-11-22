# MySeedSchoolHub

Multi-tenant school management for Ethiopian schools, hosted by MySeed or self-hosted. It is the system of record for school data and connects to the MySeed Education System, which serves the MySeed Student and Parent apps. The specification is in [docs/README.md](SPECIFICATION-INDEX.md).

## Run it locally

Requirements: Node 22 or later, pnpm 10, Python 3.10 or later (for the control panel).

```
pnpm install
pnpm build
pnpm control-panel
```

The control panel opens at http://127.0.0.1:8090. Press **Start everything** on the Overview tab. It starts the embedded PostgreSQL, applies migrations, then starts the API, the worker and the portal. On an empty database, run **Load demo data** on the Tasks tab first.

Without the panel, use one terminal per process:

```
pnpm db:start                      # PostgreSQL on localhost:55432
pnpm db:migrate && pnpm db:seed    # schema and seven demo schools
pnpm --filter @myseed/api start    # API on http://localhost:4000
pnpm --filter @myseed/api start:worker
pnpm --filter @myseed/portal start # portal on http://localhost:3000 (after pnpm build)
```

Sign-in details for every role are in [CREDENTIALS.md](DEMO-CREDENTIALS.md). The shared demo password is `<demo password>`.

## Where things are

| Path | What |
| --- | --- |
| `apps/api` | NestJS API (`/api/v1` for the portal and the school API, `/connect/v1` for the MySeed Education System), the worker and the seed |
| `apps/portal` | Next.js: public site, school portal on `<school>.localhost:3000`, platform console under `/platform` |
| `packages/contracts` | Zod schemas for every request, response and event; the OpenAPI documents are generated from them |
| `packages/db` | Prisma schema, migrations and row-level security |
| `packages/sdk` | `@myseed/schoolhub-sdk`: Connect client, webhook verifier and installer, used by the Education System |
| `packages/ui`, `packages/calendar`, `packages/config` | Design system, Ethiopian calendar, shared lint and TypeScript settings |
| `tools/control-panel` | Python control panel: services, tasks, database tools, backups, MySeed integration ([README](CONTROL-PANEL-README.md)) |
| `deploy` | Compose files and the Caddy configuration for hosted and self-hosted installs (Dockerfiles live in each app) |

## Connecting the MySeed Education System

1. Issue a one-time install code in the platform console under **MySeed integration** (or `pnpm connect:code`).
2. On the Education System server: `npx myseed-schoolhub-install --url <SchoolHub API address> --code <code> --client-id myseed-education-prod --webhook-url https://<education-host>/hooks/schoolhub`.
3. Schools with MySeed Connect appear in the app school search, and their events arrive signed at the webhook.

Details: [docs/03-integration-spec.md](03-integration-spec.md), section 3. To try the whole path locally, use **Install local gateway** on the control panel's MySeed integration tab.

## Checks

```
pnpm lint && pnpm typecheck && pnpm format:check && pnpm check:emoji
pnpm test        # API suites against the schoolhub_test database
pnpm test:e2e    # signs in as every role and opens every screen it can reach (needs the stack running)
```
