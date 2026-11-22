# Working on Transaction Verify

> [!NOTE]
> Written from the repository at commit `3435810` (20 November 2026). Fuller detail is in the existing guides: [quickstart](../existing/docs/quickstart.md), [examples](../existing/examples/README.md), [control panel](../existing/control-panel/README.md), [VPS deploy](../existing/deploy/vps/README.md) and [operations runbooks](../existing/docs/runbooks.md).

## 1. Setup from a fresh clone

### 1.1 What you need

- Node.js 24 and npm.
- Python 3.10 or newer (control panel and its tests).
- Git.
- Optional: Tesseract with English and Amharic data, for image receipts without a QR code (see [Tesseract OCR](../existing/packages/evidence/README.md)).
- Optional: Docker, only for the image, the VPS compose file or `ops/compose.yaml`. The local database needs no Docker.
- For the Android shells only: the Android SDK (platform 36, build-tools 35 or newer) and a JDK.

### 1.2 Commands

```sh
git clone <repository URL> Transaction-Verify
cd Transaction-Verify
npm ci
npm run build
npm run setup            # writes .env from .env.example and generates the keys; never overwrites a set value
npm run db:start         # PostgreSQL 17 in data/pg; leave it running (stop with npm run db:stop)
npm run db:migrate       # applies database/001 to 067
npm run sandbox:seed     # sandbox organization; prints the server key and webhook secret once
npm run dev:api          # http://127.0.0.1:8080, hosted page at /pay/, web app at /
npm run dev:worker
npm run sandbox:pay -- --key <server key>
```

Or start the control panel and follow its Overview checklist:

```sh
npm ci && npm run build
npm run panel            # http://verify.localhost:8767
```

### 1.3 First people

```sh
# The MySeed Verify platform team and its first owner (prints a one-time setup link)
node --env-file-if-exists=.env scripts/platform.mjs init --email <owner email> --name "<owner name>"

# A real organization with its first admin (prints the server key, webhook secret and setup link once)
npm run org:create -- --name "<organization name>" --admin-email <admin email> --admin-name "<admin name>"

# Another console member
npm run console:admin -- --org <organization id> --email <email> --name "<name>" --role admin
```

### 1.4 Before you push

```sh
npm run check            # no-emoji scan, build, unit tests and end-to-end tests on PostgreSQL 17
npm run sdk:check        # SDKs publish without private packages
npm run test:panel       # control panel tests
```

After editing `contracts/openapi.v1.json`, run `npm run generate:contract` and `npm run sdk:sync`. After editing `packages/provider-connectors/src/drafts.ts`, generate the template migration with `scripts/generate-method-drafts.mjs` instead of writing SQL by hand.

## 2. Environment variables

Names and purpose only. Never commit values. `.env` and `.env.*` are ignored by git except `.env.example`. On the VPS, `deploy/vps/env.sh` writes `/opt/transactionverify/.env`.

### 2.1 Process and database

| Name | Purpose |
| --- | --- |
| `DEPLOYMENT` | `myseed`, `commercial`, `sandbox` or `dedicated`; secrets are required outside the sandbox |
| `HOST`, `PORT` | Address and port of the API (default `127.0.0.1:8080`) |
| `PUBLIC_BASE_URL` | Public address used in links, manifests and push |
| `TRUST_PROXY` | `true` behind Caddy |
| `LOG_LEVEL` | Fastify log level |
| `DATABASE_URL` | PostgreSQL connection string |
| `GIT_COMMIT` | Version shown next to each worker on the Operations page |
| `WEB_DIR`, `HOSTED_DIR`, `MIGRATIONS_DIR` | Override build and migration folders |
| `TV_PG_DIR` | Data folder of the local embedded PostgreSQL |

### 2.2 Keys

| Name | Purpose |
| --- | --- |
| `SUBMISSION_TOKEN_SECRET` | Signs payer submission tokens |
| `DATA_ENCRYPTION_KEY` | Seals stored secrets and the archive; exactly 32 bytes, base64 |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | Older keys that still open values during a rotation |
| `ACCOUNT_DIGEST_KEY` | Keys receiving account digests; never change it on a live deployment |
| `METRICS_TOKEN` | Bearer token for `/metrics` (16 characters or more) |

### 2.3 Organization defaults

| Name | Purpose |
| --- | --- |
| `SUBMISSION_TOKEN_TTL` | Payer token lifetime (default `15m`) |
| `DEFAULT_REQUEST_EXPIRY` | Request deadline (default `72h`) |
| `PROVIDER_RETRY_SCHEDULE` | Waits after pending or unavailable (default `1m,5m,15m,60m`) |
| `EVIDENCE_RETENTION` | How long evidence is kept (default `5y`) |
| `EVIDENCE_HOT_DAYS` | Days before originals move to the archive (default 90) |
| `CALENDAR_MODE` | `ethiopian-am`, `gregorian` or `both` |
| `STAFF_SIGNIN` | `built-in` or `oidc` |
| `BILLING_MODE` | `invoice`, `checkout` or `both` |
| `PRODUCT_THEME` | `myseed` or `kalon` look of the hosted page |
| `MAX_UPLOAD_MB` | Largest receipt upload, 1 to 25 (default 8) |

### 2.4 Storage

| Name | Purpose |
| --- | --- |
| `STORAGE_DRIVER`, `STORAGE_DIR` | `local` disk folder or `s3` |
| `STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_PATH_STYLE` | S3-compatible receipt storage |
| `ARCHIVE_STORAGE_DRIVER`, `ARCHIVE_STORAGE_DIR` | Sealed archive location (must differ from receipts) |
| `ARCHIVE_STORAGE_ENDPOINT`, `ARCHIVE_STORAGE_BUCKET`, `ARCHIVE_STORAGE_REGION`, `ARCHIVE_STORAGE_ACCESS_KEY`, `ARCHIVE_STORAGE_SECRET_KEY`, `ARCHIVE_STORAGE_PATH_STYLE` | S3-compatible archive |

### 2.5 Worker and OCR

| Name | Purpose |
| --- | --- |
| `WORKER_LEASE_SECONDS` | Job lease length |
| `WORKER_OCR_CONCURRENCY` | Parallel OCR runs (default 2) |
| `OCR_TIMEOUT_MS`, `TESSERACT_BIN`, `TESSDATA_DIR`, `OCR_LANGUAGES` | Tesseract settings |
| `ALLOW_LOOPBACK_WEBHOOKS` | Sandbox only: deliver webhooks to `127.0.0.1` |
| `ENABLE_SYNTHETIC_CONNECTOR` | Register the synthetic bank outside a sandbox deployment |
| `VAPID_SUBJECT` | Contact subject for Web Push |

### 2.6 Messages, sign-in and licensing

| Name | Purpose |
| --- | --- |
| `EMAIL_SMTP_URL`, `EMAIL_FROM` | SMTP server (TLS required) and sender address |
| `SMS_PROVIDER`, `SMS_TOKEN`, `SMS_SENDER`, `SMS_IDENTIFIER`, `SMS_HTTP_URL` | AfroMessage or an HTTPS SMS endpoint |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Shopper sign-in with Google (off when unset) |
| `LICENSE_KEY`, `LICENSE_PUBLIC_KEY`, `LICENSE_PLATFORM` | Dedicated installs only |

### 2.7 Sandbox, tests and relays

| Name | Purpose |
| --- | --- |
| `SANDBOX_API_KEY` | Sandbox without a database: one server key from the environment |
| `SANDBOX_SERVER_KEY`, `WEBHOOK_SECRET` | Used by `npm run example:academy` |
| `MYSEED_VERIFY_KEY` | Server key in the `@myseed-verify/academy` usage example |
| `DATABASE_URL_TEST` | External database for the persistence integration test |
| `E2E_DATABASE_URL` | Existing PostgreSQL server for the e2e suite (CI) |
| `OCR_NATIVE_TEST` | `1` runs the native Tesseract test |
| `PLAYWRIGHT_PATH`, `BROWSER_PATH` | Browser fixtures |
| `TV_RELAY_API_URL`, `TV_RELAY_TOKEN` | The Node relay agent on a shop PC |

### 2.8 VPS and CI

| Name | Purpose |
| --- | --- |
| `TV_DOMAIN` | Public domain on the VPS |
| `EDGE_MODE`, `EDGE_SITES_DIR` | `shared` (Myseed's Caddy) or `own` (`tv-caddy`), and the Caddy sites folder |
| `APP_ROOT` | `/opt/transactionverify` |
| `POSTGRES_PASSWORD` | Database password, generated on the server on first run |
| `KEEP_DAYS` | Days of database dumps kept by `backup.sh` |
| `WITH_RECEIPTS` | `1` makes `backup.sh` archive receipts on any day |
| `NPM_TOKEN` | GitHub secret for publishing the SDKs |
| `GITHUB_TOKEN` | Built-in token used to push the image to the GitHub Container Registry |

## 3. Branches and how changes reach production

| Step | What happens |
| --- | --- |
| Branch | All 88 commits are on `main`. No other branches or tags exist in the repository |
| Commit and push | From the terminal or the control panel's Code (GitHub) page, which runs the no-emoji check first and pushes to `main` |
| CI | `.github/workflows/ci.yml` runs on every push to `main` and on pull requests. It does not deploy |
| Deploy | From the control panel's Hostinger VPS page: it packages the last local commit with `git archive`, uploads it and runs `deploy/vps/deploy.sh` |
| SDK release | Push a tag `sdk-v<version>` matching the three SDK package versions; `publish-sdks.yml` publishes to npm |
| Image release | Push a tag `v<version>`; `release.yml` pushes `ghcr.io/<owner>/transaction-verify` for dedicated installs |

> [!WARNING]
> The deploy packages the local last commit, not what is on GitHub, and nothing requires CI to be green first. Before deploying, push the commit and wait for the CI run to pass.

## 4. Deploy and roll back

```sh
# On the VPS, as the control panel runs them
bash deploy/vps/deploy.sh <release>     # build, dump the database, switch, migrate, start, route, check
bash deploy/vps/deploy.sh --rollback    # start the previous release again (newest three kept)
bash deploy/vps/deploy.sh --restart     # restart the running containers
bash deploy/vps/deploy.sh --edge-check  # check that the public address is routed here
```

- The first deploy needs a DNS `A` record for `transactionverify.myseed.com.et` and the Caddy patch applied to the My-Seed-Academy repository (`deploy/vps/myseed-edge.patch`).
- A rollback never rolls the database back. Migrations only add, so the previous release must work on the newer schema.
- Apply new migrations before the new API and worker start; `deploy.sh` does this through `tv-migrate`.
- After a deploy, check `https://transactionverify.myseed.com.et/health` and the Platform, Operations page.

## 5. Backups and recovery

| Backup | When | Kept | Where |
| --- | --- | --- | --- |
| Worker whole-database backup | Nightly after 02:00 Addis Ababa time | Newest 14 | Sealed archive (`ARCHIVE_STORAGE_*`) |
| `backup.sh` database dump | 02:45 server time by cron | 14 days (`KEEP_DAYS`) | `/opt/transactionverify/backups/tv-*.sql.gz` |
| Receipts archive | Weekly, on Sundays (or with `WITH_RECEIPTS=1`) | 35 days | `/opt/transactionverify/backups/receipts-*.tar.gz` |
| Pre-deploy dump | Every deploy | With the other dumps | `/opt/transactionverify/backups` |
| Off-site copy | On demand | As kept by the person | Control panel downloads a backup to `backups/vps` on the computer |
| Console backups | On demand | Until deleted | Sealed archive, from the Data and Database pages |

**Restore on the server** (stop `tv-api` and `tv-worker` first):

```sh
cd /opt/transactionverify
gunzip -c backups/tv-YYYYMMDD-HHMMSS.sql.gz | docker compose -p transactionverify -f current/deploy/vps/docker-compose.yml exec -T tv-postgres psql -U verify -d transaction_verify
tar xzf backups/receipts-YYYYMMDD-HHMMSS.tar.gz -C /opt/transactionverify/data
```

**Restore drill.** Monthly, from Platform, Operations: restore a backup into a scratch database, migrate, count tables, check the tenant wall, sign off. See the [runbooks](../existing/docs/runbooks.md).

> [!CAUTION]
> Keep `DATA_ENCRYPTION_KEY` and `ACCOUNT_DIGEST_KEY` in your own secure records. Without the first, the sealed archive and every stored secret are unreadable. A new second key stops receiving accounts matching.

## 6. Who owns what

Roles only. The repository names no phase owners; the master roadmap asks for one owner per phase.

| Area | Owner role |
| --- | --- |
| Code, architecture, releases, deploys | Project owner and lead developer (the only committer in git) |
| Platform organization and its team | Platform owner (platform role `owner`) |
| Approvals, suspensions, support access, website, leads | Platform operations (`operations`) |
| Bank and wallet methods, templates, certification, pilots | Provider admin (`provider_admin`) |
| Packages, invoices, VAT, credits, partner payouts | Finance (`finance`) |
| Support tickets and support access | Support (`support`) |
| Website content | Content (`content`) |
| Health, flags, database tools, operations | Engineer (`engineer`) |
| Read-only security review | Security auditor (`security_auditor`) |
| Myseed's Caddy and DNS for myseed.com.et | Myseed Academy's own maintainers (the My-Seed-Academy repository) |
| Amharic text review | MySeed staff (Phase 13) |

## 7. Rules that differ from or add to the Myseed Dev team rule book

> [!NOTE]
> The Myseed Dev team rule book is not in this repository. These are the project's own rules as found in the code and docs. To confirm which of them already exist in the rule book.

- [x] **No emoji** in code, docs, commit messages or the interface. `npm run check:emoji` runs in CI and before every push from the control panel.
- [x] **Write every product decision in `docs/decisions.md`**: what changed, why, how it is applied and where to change it.
- [x] **Migrations are numbered and forward only.** Never edit an applied migration; the runner refuses a changed checksum. Add a new file instead.
- [x] **Generated SQL is never hand edited.** Bank template migrations come from `packages/provider-connectors/src/drafts.ts`.
- [x] **Contract first.** Change `contracts/openapi.v1.json`, then regenerate types and SDK copies. Breaking changes need a new path, with `Deprecation` and `Sunset` at least six months apart.
- [x] **Money in integer minor units**, decimal strings at the API boundary, never floating point.
- [x] **Readings never accept a payment.** New banks go through draft, pilot and certification with real receipts.
- [x] **Outbound calls go through the safe egress helpers** (`egress.ts`, `link-connector.ts`): https, approved hosts, public addresses, no redirects.
- [x] **The web app keeps nothing in browser storage.**
- [x] **Every query is scoped to an organization**, and tenant work runs through `withTenant`.
- [x] **Tests use synthetic data only.** Real receipts belong in Live check on the platform, not in fixtures with personal data.
- [x] **Plain English, sentence case**, following `docs/ui-guidelines.md`.
- [x] **Deploys run from the control panel**; there is no CI deploy.
- [ ] **No secrets in the repository.** `.env` is ignored, but see the warning below.

> [!WARNING]
> `scratch/fix_env.py` (added in commit `011d5a1`) contains server settings that look like real production secrets, and `scratch/check_db.py` contains the server address. Treat those values as exposed: rotate them on the server, remove the files, and clean them from git history. `DATA_ENCRYPTION_KEY` and `ACCOUNT_DIGEST_KEY` need care when rotated; follow [security](../existing/docs/security.md) and the key rotation runbook.
