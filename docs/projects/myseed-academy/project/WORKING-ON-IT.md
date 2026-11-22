# Working on MySeed Academy

## 1. Setup from a fresh clone

Requirements: Node.js 20 or newer, npm 11 (the `packageManager` field pins `npm@11.19.0`), Git, and Docker for the local database. Python 3.10 or newer is only needed for the control panel.

```bash
git clone https://github.com/Er-kidus/My-Seed-Academy.git
cd My-Seed-Academy
npm install                      # also runs prisma generate (postinstall)
cp .env.example .env             # then fill in local values
docker compose up -d postgres    # PostgreSQL 16 on port 5432
npm run db:setup                 # prisma generate + db push + seed
npm run dev:ports                # API :8080, web :3000, admin :3001
```

Open `http://localhost:3000` (website) and `http://localhost:3001` (console). Sign in with a seeded staff account, for example `admin@myseedacademy.org`, using the seed password (`SEED_DEFAULT_PASSWORD` in `packages/types`). Change it on any shared or deployed system.

### 1.1 Local domain names (optional)

```bash
npm run local:domains            # once, Windows, asks for admin rights: adds myseedweb.local and others to hosts
npm run dev                      # starts the three apps and a proxy on port 80
```

Then use `http://myseedweb.local`, `http://myseedwebadmin.local` and `http://myseedapi.local`. If port 80 is taken, set `LOCAL_PROXY_PORT=8088`.

### 1.2 Without PostgreSQL

Skip the database steps. The API logs a warning and serves from the in-memory store. Changes reset on restart.

### 1.3 Useful commands

| Command | What it does |
| --- | --- |
| `npm run build` | Builds website and console, type checks the API |
| `npm run typecheck` | Type checks every workspace |
| `npm test` | API suites |
| `npm run test:e2e` | Playwright suites (apps must be running) |
| `npm run start:local` | Production builds on the local domains (`COOKIE_SECURE=false`) |
| `npm run db:push` | Apply schema changes |
| `npm run db:seed` | Seed with history (deletes placeholder rows; ask first on a shared database) |
| `npm run db:sync -- status` | Compare local and Supabase; also `push`, `pull`, `backup`, `restore` |
| `npm run i18n:translate` | Fill new Tier 2 interface strings (needs `ANTHROPIC_API_KEY`) |
| `npm run panel` | Start the control panel at `http://127.0.0.1:8766` |

## 2. Environment variables

Names and purpose only. Never commit values. `.env` is git-ignored. Provider keys can also be saved in Admin, Integrations, where they are encrypted and take priority.

### 2.1 Runtime and security

| Name | Purpose |
| --- | --- |
| `NODE_ENV` | `production` turns off test checkout and turns on secure cookies |
| `PORT` | API port (default 8080) |
| `DATABASE_URL` | PostgreSQL connection string |
| `ENCRYPTION_KEY` | Key for the integration vault and encrypted receipt seals. Never change it after launch |
| `JWT_SECRET` | Signs staff session tokens |
| `REVALIDATE_SECRET` | Shared by API and website so publishing refreshes cached pages |
| `RECEIPT_SIGNING_SECRET` | Signs receipt verification codes. When unset, `JWT_SECRET` is used, so rotating `JWT_SECRET` would make every issued receipt fail verification |
| `COOKIE_SECURE` | `false` allows the session cookie over plain http for local production runs |
| `AUTH_RATE_LIMIT_MAX` | Raises the login rate limit for test runs |
| `UPTIME_MONITORING` | `off` stops the uptime timer and the MySeed Verify sync timer (used in tests) |
| `NEWSLETTER_SCHEDULER` | `off` stops the scheduled newsletter timer |

### 2.2 Addresses

| Name | Purpose |
| --- | --- |
| `ALLOWED_ORIGINS` | CORS allowlist for the API |
| `WEB_URL`, `ADMIN_URL` | Public addresses of website and console (links, previews, frame rules) |
| `PUBLIC_SITE_URL` | Address search engines see (sitemaps, PageSpeed, IndexNow) |
| `PUBLIC_API_URL` | Public API address (webhook and confirm links) |
| `API_INTERNAL_URL` | How the Next.js apps reach the API; read at build time and at run time |
| `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_API_URL` | Browser-side addresses baked into the builds |
| `NEXT_OUTPUT` | `standalone` for Docker images |
| `NEXT_DIST_DIR` | Alternative build folder (for side-by-side verification builds) |
| `LOCAL_PROXY_PORT` | Port of the local domain proxy |

### 2.3 Providers

| Name | Purpose |
| --- | --- |
| `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET` | Chapa payments |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe card payments |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | SMTP mailbox |
| `RESEND_API_KEY`, `EMAIL_FROM` | Resend email |
| `SENDGRID_API_KEY`, `SENDGRID_FROM` | SendGrid email |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM` | Mailgun email |
| `POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM` | Postmark email |
| `BILLING_FINANCE_EMAIL` | Receives a copy of every invoice and receipt |
| `GOOGLE_TRANSLATE_API_KEY` | Tier 2 translation |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Assistant, translation fallback, interface translation |
| `WHATSAPP_NUMBER`, `TELEGRAM_HANDLE` | Support handoff |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_PUBLIC_URL` | Media bucket |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `VERCEL_DEPLOY_HOOK`, `DEPLOY_HOOK_URL` | Deploy history and redeploy |
| `PAGESPEED_API_KEY` | PageSpeed reports |

### 2.4 VPS only (`/opt/myseed/.env`)

| Name | Purpose |
| --- | --- |
| `SITE_DOMAIN`, `SITE_ALIAS`, `ADMIN_DOMAIN`, `API_DOMAIN` | Domains Caddy serves |
| `ACME_EMAIL` | Contact for Let's Encrypt certificates |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Database container |
| `APP_ROOT`, `KEEP_RELEASES`, `KEEP_DAYS`, `WITH_UPLOADS` | Deploy and backup script settings |

### 2.5 Database sync and GitHub

| Name | Purpose |
| --- | --- |
| `LOCAL_DATABASE_URL`, `REMOTE_DATABASE_URL` | Both sides for `npm run db:sync` |
| `UPTIME_ENABLED`, `UPTIME_SITE_URL`, `UPTIME_ADMIN_URL`, `UPTIME_API_URL` | GitHub repository variables for `uptime.yml` |
| `WEB_URL`, `ADMIN_URL` (test runs) | Targets for the Playwright suites |

## 3. Branches and how changes reach production

| Step | What happens |
| --- | --- |
| 1 | Work on a branch, or on `main` for small changes (git history shows all 38 commits made directly on `main`) |
| 2 | Push or open a pull request to `main`; CI (`ci.yml`) runs type check, API tests, builds, E2E and accessibility |
| 3a | VPS: deploy from the control panel (**Hostinger VPS, Build and deploy**), which packages the last commit (or the working tree, if ticked) |
| 3b | Render: every push to the linked branch deploys automatically (`autoDeploy: true` in `render.yaml`) |
| 4 | Check `https://api.myseed.com.et/healthz`, the site and the console |

There are no release tags. Each VPS release folder is named `<date>-<time>-<short hash>`.

## 4. Deploy and roll back

### 4.1 Deploy to the VPS by hand

```bash
release=$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)
git archive --format=tar.gz -o $release.tar.gz HEAD
scp $release.tar.gz deploy/vps/*.sh root@<VPS IP>:/opt/myseed/incoming/
ssh root@<VPS IP> "bash /opt/myseed/incoming/deploy.sh $release"
```

`deploy.sh` builds the images while the old containers serve, dumps the database, switches `/opt/myseed/current`, starts the new containers and runs health checks. The `migrate` container runs `prisma db push` and the seed before the API starts.

### 4.2 Roll back

```bash
ssh root@<VPS IP> "bash /opt/myseed/incoming/deploy.sh --rollback"
```

This starts the previous release (3 are kept). The database stays as it is. If the release changed data, restore the pre-deploy dump (section 5).

> [!CAUTION]
> Never change `ENCRYPTION_KEY`, `POSTGRES_PASSWORD` or `JWT_SECRET` in `/opt/myseed/.env` once the site is live. A new `ENCRYPTION_KEY` makes every key saved in Admin, Integrations unreadable.

The full guide is [deploy guide](../existing/docs/runbooks/DEPLOY.md).

## 5. Backups and recovery

| Backup | Schedule | Kept | Where |
| --- | --- | --- | --- |
| PostgreSQL dump (`pg_dump`, gzip) | Nightly 02:30 and before every deploy | 14 days | `/opt/myseed/backups/myseed-<stamp>.sql.gz` |
| Uploads volume archive | Weekly (Sunday) or with `WITH_UPLOADS=1` | 35 days | `/opt/myseed/backups/uploads-<stamp>.tar.gz` |
| Off-server copy | When staff press **Back up and download now** in the panel | Until deleted | `backups/vps` on the staff computer (git-ignored) |
| Hostinger VPS snapshots | Weekly, if turned on in hPanel | Per Hostinger | Hostinger |
| Content snapshots | When staff take one | Until deleted | `DbSnapshot` table (Admin, Database) |
| Finance backups | Before every clear, and on demand | Until deleted | `FinanceBackup` table |

Restore the database on the server:

```bash
cd /opt/myseed/current
dc stop api web admin
gunzip -c /opt/myseed/backups/myseed-<stamp>.sql.gz | dc exec -T postgres psql -U myseed -d myseed_academy
dc start api web admin
```

`dc` is the alias from the deploy guide for the long compose command. A restore has never been recorded as practised. To confirm.

> [!NOTE]
> `existing/docs/runbooks/disaster-recovery.md` describes backups every 6 hours in custom format. The scripts actually run nightly plain SQL dumps as above.

## 6. Who owns what

The git history has one contributor. Ownership by role, from the code and docs:

| Area | Owner role |
| --- | --- |
| Code, CI, deploys, control panel | Developer (repository owner) |
| Server, domains, DNS, secrets in `/opt/myseed/.env` | System Admin |
| Website content, homepage, media, newsletter, inquiries | Content Manager |
| Donations, sponsorship applications, finance review | Donation Manager and finance staff |
| SEO | SEO Manager |
| Staff accounts and roles | Super Admin |
| DNS for `myseed.com.et` (hosted at Ethio Telecom) | To confirm |

## 7. Rules for this project

These add to the Myseed Dev team rule book. The rule book itself is not in this repository, so any conflicts are To confirm.

- [ ] No emoji anywhere: interface, copy, commit messages, docs (`docs/guides/no-emoji-watermelon-ui.md`).
- [ ] Build UI from `packages/ui`; follow the Watermelon-style rules.
- [ ] Every content type needs English and Amharic. New interface strings go in `apps/web/lib/i18n/en.ts` and `am.ts`, then run `npm run i18n:translate`.
- [ ] Schema changes use `prisma db push`. Check that the change does not drop data; `db push` will refuse and the deploy will stop.
- [ ] New permissions go in `packages/types/src/rbac.ts`. Mark areas with donor data or secrets as `sensitive` so the Developer role can never get them.
- [ ] New outside services go in the integrations catalog (`packages/types/src/integrations.ts`), read through `providers/registry.ts`, log usage, and need a working fallback.
- [ ] Never write test data to a real database. For browser tests that save data, point the test API at an unreachable database so it runs in memory mode.
- [ ] After any email change, send a test email and confirm it arrived before calling the work done.
- [ ] Never commit `.env`, `control-panel/.state` or `backups/`. Backups hold donor and staff data.
- [ ] Keep the Turborepo agent guidance block in `AGENTS.md` committed.
- [ ] The repository sits in OneDrive on the main workstation; build folders can hit file locks. Use a separate `NEXT_DIST_DIR` for verification builds and delete it afterwards.
