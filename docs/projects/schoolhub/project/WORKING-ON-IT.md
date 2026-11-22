# Working on MySeedSchoolHub

How to set up, change, ship and recover MySeedSchoolHub, as of commit `16e8c19` on 2026-11-23. The repository's own quick start is the [repository README](../existing/REPOSITORY-README.md); demo sign-ins are in [demo credentials](../existing/DEMO-CREDENTIALS.md).

## 1. Setup from a fresh clone

### 1.1 Requirements

- Node.js 22 or later
- pnpm 10 (the repository pins `pnpm@10.34.7` in `packageManager`; `corepack enable` picks it up)
- Python 3.10 or later, only for the control panel
- Git with LF line endings (the repository sets this in `.gitattributes`)
- Docker, only for building images or running the Compose files

### 1.2 Commands

```bash
git clone <repository URL> myseedschoolhub
cd myseedschoolhub
git checkout build/m0-sdk-foundations   # all current work is on this branch
pnpm install
cp .env.example .env                    # development defaults; edit if ports differ
pnpm build
```

Then either start everything from the control panel:

```bash
pnpm control-panel                      # opens http://127.0.0.1:8090
```

Press **Start everything** on the Overview tab; on an empty database run **Load demo data** on the Tasks tab first.

Or start each process in its own terminal:

```bash
pnpm db:start                           # embedded PostgreSQL 17 on localhost:55432
pnpm db:migrate && pnpm db:seed         # schema and seven demo schools
pnpm --filter @myseed/api start         # API on http://localhost:4000
pnpm --filter @myseed/api start:worker  # worker
pnpm --filter @myseed/portal start      # portal on http://localhost:3000
```

For live reload use `pnpm dev` instead of the last three commands.

| Address | What |
| --- | --- |
| http://localhost:3000 | Public site |
| http://localhost:3000/platform/login | Platform console |
| http://bole-academy.localhost:3000/login | A demo school portal |
| http://localhost:4000/docs | School API reference |
| http://localhost:4000/docs/connect | Connect API reference |

### 1.3 Checks before you finish

```bash
pnpm lint && pnpm typecheck && pnpm format:check && pnpm check:emoji
pnpm test        # API and calendar suites against schoolhub_test
pnpm test:e2e    # role crawl, needs the stack running
```

> [!TIP]
> After editing `packages/contracts`, run `pnpm --filter @myseed/contracts build` before the API tests. On Windows, run the API tests from a shell whose path starts with an uppercase drive letter (`C:\`), or Vitest reports a zod OpenAPI error.

## 2. Environment variables

Names and purpose only. Development defaults are in `.env.example` and `apps/api/src/config.ts`; self-hosted values go in `deploy/compose/selfhosted.env` (created by `deploy/scripts/install.sh` from `selfhosted.env.example`). Never commit a filled settings file.

### 2.1 API and worker

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | `production` turns on the secret checks and JSON logs |
| `DEPLOYMENT_MODE` | `self_hosted` for a school server; hosted otherwise |
| `SCHOOLHUB_EDITION` | Edition of the deployment (`school` on self-hosted) |
| `SCHOOLHUB_VERSION` | Image version to run |
| `API_PORT` | API listen port |
| `API_PUBLIC_URL` | Public API address; used in Connect token audiences and links |
| `PORTAL_URL` | Public portal address |
| `ROOT_DOMAIN` | Root host; schools are `<slug>.<ROOT_DOMAIN>` |
| `DATABASE_URL` | Owner connection, used for migrations |
| `DATABASE_URL_APP` | Restricted app role connection, used by the API and worker so RLS applies |
| `DATABASE_POOL_SIZE` | Database connections shared across API processes |
| `API_WORKERS` | Number of API processes, or `auto` for one per CPU |
| `SCHOOLHUB_LEAD_PROCESS` | Marks the lead API process (set internally) |
| `SESSION_SECRET` | Signs staff sessions |
| `SESSION_TTL_HOURS` | Session lifetime |
| `COOKIE_SECURE` | Send cookies only over HTTPS |
| `INTERNAL_PROXY_SECRET` | Shared between portal and API so the API trusts the forwarded host |
| `FILE_SIGNING_SECRET` | Signs file download URLs |
| `CONNECT_TOKEN_SECRET` | Signs Connect access tokens |
| `SECRETS_ENCRYPTION_KEY` | Encrypts stored integration secrets |
| `PLATFORM_WEBHOOK_URL`, `PLATFORM_WEBHOOK_SECRET` | Where and how platform events are sent |
| `STORAGE_DRIVER` | `fs` for local disk or `s3` |
| `STORAGE_FS_ROOT` | Folder for local files |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3-compatible storage |
| `ICONIC_SMS_API_URL`, `ICONIC_SMS_API_KEY`, `ICONIC_SMS_SENDER` | SMS provider |
| `SMTP_URL` | Email server |
| `CHAPA_SECRET_KEY` | Chapa payments |
| `LICENSE_FILE` | Self-hosted license file path |
| `LICENSE_PUBLIC_KEY` | Key that verifies licenses |
| `LICENSE_SIGNING_KEY` | Key that signs licenses (MySeed platform only, never on a school server) |
| `RELAY_URL`, `RELAY_TOKEN` | Relay for servers without a public address |
| `MYSEED_ID_ISSUER`, `MYSEED_ID_CLIENT_ID`, `MYSEED_ID_CLIENT_SECRET` | Sign in with MySeed ID |
| `REDIS_URL` | Optional message bus and shared cache |
| `BUS_DISABLED` | Turns off the message bus |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Malware scanning |
| `SENTRY_DSN` | Error reporting endpoint |
| `LOG_LEVEL`, `LOG_FORMAT` | Log detail and format (`json` or pretty) |
| `PRISMA_LOG` | Prisma query logging |
| `DEBUG_ERRORS` | Show error details in responses (development only) |
| `WORKER_POLL_MS` | Worker poll interval |
| `CONNECT_DEV_KEY_FILE` | Where the seed writes the development Connect client key |
| `SEED_SCALE` | Size of the demo seed (`small` or full) |

### 2.2 Portal

| Name | Purpose |
| --- | --- |
| `API_INTERNAL_URL` | API address the portal proxy calls |
| `INTERNAL_PROXY_SECRET` | Same value as the API |
| `ROOT_DOMAIN`, `SITE_URL`, `API_PUBLIC_URL` | Runtime addresses |
| `SCHOOLHUB_EDITION` | `school` hides the platform console |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SCHOOLHUB_EDITION` | Compiled into the build (one build per domain today) |
| `NEXT_OUTPUT` | Next.js output mode for the image |
| `PORTAL_ROOT`, `PORTAL_PROTOCOL`, `E2E_SCHOOL`, `CRAWL_TRACE`, `DEMO_PASSWORD` | End-to-end test target host, school, tracing and the demo sign-in password |

### 2.3 Self-hosted Compose and scripts

| Name | Purpose |
| --- | --- |
| `PORTAL_HOSTS` | Root domain and each school host, for Caddy |
| `API_HOST` | Public API host, for Caddy |
| `ACME_EMAIL` | Contact for automatic certificates |
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` | Database owner and app role passwords |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | Backup location and retention |

### 2.4 Local tools

| Name | Purpose |
| --- | --- |
| `PG_PORT`, `PG_DATA_DIR` | Embedded Postgres port and data folder for `pnpm db:start` |

## 3. Branches and how changes reach production

| Branch | Purpose |
| --- | --- |
| `main` | Target branch. Holds only the initial commit today |
| `build/m0-sdk-foundations` | All work so far (48 commits); not pushed, no upstream |

Intended flow, from `.github/workflows/ci.yml`:

1. Work on a feature branch; open a pull request to `main`.
2. CI job `checks` runs emoji check, format check, lint, typecheck, build and tests; job `images` builds and scans the API and portal images.
3. On merge (push to `main`), images are pushed to `ghcr.io/<owner>/schoolhub-api` and `ghcr.io/<owner>/schoolhub-portal`, tagged by commit SHA and branch, signed with cosign, with SBOM and provenance.
4. A `v*` tag publishes semantic-version tags of the same images. Self-hosted servers run a chosen version through `SCHOOLHUB_VERSION`.

> [!IMPORTANT]
> Steps 2 to 4 have never run. Before the first self-hosted release, CI must also build the school edition portal image (`schoolhub-portal-school`, `EDITION=school`) that `deploy/compose/docker-compose.selfhosted.yml` pulls.

## 4. Deploy and roll back

### 4.1 Hosted

To confirm. No hosted environment, provider, region or deployment procedure is recorded in the repository (open decision D3).

### 4.2 Self-hosted

```bash
# First install on a clean Linux server
sudo deploy/scripts/install.sh --domain <root domain> --school <school slug> --email <role address> --version <version>

# Upgrade (takes a backup first, rolls back automatically if the new version does not come up)
sudo deploy/scripts/upgrade.sh --version <new version>

# Manual rollback to any backup
sudo deploy/scripts/restore.sh <backup folder> --yes

# Support bundle without school records or secrets
sudo deploy/scripts/diagnostics.sh
```

Migrations run automatically through the `migrate` service on every start. They are forward-only: rolling back past a migration means restoring the backup taken before the upgrade.

## 5. Backups and recovery

| Where | How | What is kept |
| --- | --- | --- |
| Self-hosted | `deploy/scripts/backup.sh [--label <label>]`, scheduled by the operator (for example nightly with cron) | `database.dump` (pg_dump custom format), `storage.tar.gz`, `settings.env` (root-only, contains secrets), checksums; older than `BACKUP_KEEP_DAYS` removed, except `before-upgrade` backups |
| Self-hosted restore | `deploy/scripts/restore.sh <folder> [--keep-settings]` | Verifies checksums, stops API and worker, restores, migrates, starts and waits for health |
| Local development | Control panel Backups tab | Zip with a CSV per table and the list of applied migrations; restore refused when migrations differ |
| Hosted | To confirm | The specification asks for point-in-time recovery, daily snapshots kept 30 days and a quarterly restore drill |

> [!CAUTION]
> `settings.env` inside each backup holds every secret of the server. Store backups where only administrators can read them, and encrypt them when they leave the server.

No restore drill has been recorded.

## 6. Who owns what

| Area | Owner (role) |
| --- | --- |
| Code, architecture and reviews | SchoolHub lead developer (currently the single contributor) |
| Specification and open decisions D1 to D8 | MySeed product owner for SchoolHub |
| Connect contract and SDK | SchoolHub lead developer, with the Education System team as consumer |
| Platform console users and Connect clients | MySeed platform administrators (`platform_admin`) |
| Hosted operations | To confirm |
| Self-hosted servers | The school's IT contact, with MySeed support (`platform_support`) |
| License signing key | To confirm |
| Legal review (D6) | To confirm |

## 7. Rules for this project

These come from `CLAUDE.md` and the specification. To confirm which of them differ from the Myseed Dev team rule book; the rule book is not in this repository.

- [ ] No emoji or decorative symbols in code, comments, UI copy, docs or commits; run `node scripts/check-emoji.mjs` before calling work done.
- [ ] Follow the [UI rules](../existing/UI-RULES.md) for every UI change and keep the MySeed brand tokens.
- [ ] SchoolHub is the system of record: never add code that copies school records into MySeed systems or reads MySeed data directly; go through the Connect API and the events in `packages/contracts`.
- [ ] Gate features with entitlement keys (`module.*`, `limit.*`), never with plan names.
- [ ] Tenant context comes from the server (host or token), never from request input. Every tenant-owned table has `organization_id` and an RLS policy (`pnpm --filter @myseed/db rls:generate`).
- [ ] Money is integer minor units with a currency. Published marks, enrollments and ledger entries are never updated in place.
- [ ] Every API change updates the Zod schema in `packages/contracts` first.
- [ ] Lint runs with zero warnings; Prettier formatting is checked in CI.
- [ ] Keep LF line endings.
- [ ] Never put development secrets on a server with real school data; the API refuses to start in production with them.
