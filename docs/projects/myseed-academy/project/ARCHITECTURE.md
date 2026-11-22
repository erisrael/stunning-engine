# MySeed Academy architecture

## 1. Summary

MySeed Academy is a TypeScript monorepo: two Next.js apps (website and admin console) in front of one Express API, with PostgreSQL through Prisma. Turborepo runs the tasks and npm workspaces link the packages. The whole stack runs as Docker containers behind Caddy on one server, or as three services on Render. Every outside provider is optional and configured at runtime.

## 2. Stack and versions

Versions are the ranges in the `package.json` files, with the installed version from `node_modules` on 2026-11-23 in brackets.

| Layer | Technology | Version |
| --- | --- | --- |
| Runtime | Node.js | 20 (`node:20-alpine` in every Dockerfile; `node-version: 20` in CI; `NODE_VERSION=20` on Render) |
| Package manager | npm workspaces | `npm@11.19.0` (`packageManager` field) |
| Task runner | Turborepo | `^2.0.0` (2.11.7) |
| Language | TypeScript | `^5.5.0` (5.9.3) |
| Website and console | Next.js App Router, React | `next ^14.2.5` (14.2.35), `react ^18.3.1` (18.3.1) |
| Styling | Tailwind CSS, Radix UI primitives, `motion` | `tailwindcss ^3.4.4` (3.4.19), `motion ^12.43.0` |
| Rich text (console) | Tiptap | `^3.31.4` |
| Drag and drop (console) | dnd-kit | `@dnd-kit/core ^6.3.1` |
| Charts | Recharts | `^3.10.1` |
| API | Express, Helmet, CORS, zod | `express ^4.19.2` (4.22.3), `helmet ^7.1.0`, `zod ^3.23.8` (3.25.76) |
| API runner | tsx (no compile step; `build` is `tsc --noEmit`) | `^4.16.2` |
| ORM | Prisma | `^5.16.1` (5.22.0) |
| Database | PostgreSQL | 16 (`postgres:16-alpine`) |
| AI SDK | `@anthropic-ai/sdk` | `^0.132.1` |
| Email | `nodemailer` (SMTP) and provider HTTP APIs | `^6.10.1` |
| Receipt QR scanning | `jsqr`, `pngjs`, `jpeg-js` | `^1.4.0`, `^7.0.0`, `^0.4.4` |
| HTML sanitising | `sanitize-html` | `^2.18.0` |
| End-to-end tests | Playwright, axe-core | `@playwright/test ^1.64.0` (1.64.0), `@axe-core/playwright ^4.13.0` |
| Edge proxy (VPS) | Caddy | `caddy:2-alpine` (`deploy/vps/docker-compose.vps.yml`) |
| Control panel | Python 3.10 or newer, standard library only | `control-panel/` |

> [!NOTE]
> `docker-compose.yml` also starts Redis 7, but no code uses it. Rate limits and caches live in each API process's memory.

## 3. Code layout

| Folder | What it holds |
| --- | --- |
| `apps/web` | Public website, port 3000. `app/[locale]/` pages, `components/`, `lib/i18n/` (dictionaries, `machine/` Tier 2 output, `tier2.ts` reviewed overrides), `lib/seo.ts`, `middleware.ts` (locale detection, redirects) |
| `apps/admin` | Admin console, port 3001. `app/(console)/` screens, `app/login`, `components/` (resource manager, rich text editor, block and motion editors, finance views), `middleware.ts` (sign-in guard) |
| `services/api` | Express API, port 8080. `src/routes`, `src/controllers`, `src/services`, `src/providers`, `src/middlewares`, `src/lib`, `tests/`, `scripts/seed-with-history.ts` |
| `packages/database` | `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/manual/` (one-off SQL), Prisma client export |
| `packages/types` | Shared types and catalogs: languages, RBAC (`rbac.ts`), integrations catalog (`integrations.ts`), sponsorship pricing, blocks, site config, seed content (`seed-data.ts`) |
| `packages/ui` | Design system modelled on Watermelon UI: components, motion components, blocks, Tailwind preset |
| `packages/config` | Shared `tsconfig.base.json` |
| `tests` | Playwright suites in `tests/e2e` |
| `deploy/vps` | `setup.sh`, `env.sh`, `deploy.sh`, `backup.sh`, `docker-compose.vps.yml` |
| `control-panel` | Local deploy and operations panel (Python) |
| `scripts` | `dev.mjs` (starts everything), `local-proxy.mjs` (local domains on port 80), `db-sync.mjs` (Supabase push and pull), `setup-local-domains.ps1` |
| `docs` | Feature inventory, roadmap, ADRs, runbooks, ops documents, content inventory |
| `.github/workflows` | `ci.yml` (verification), `uptime.yml` (external uptime check) |

## 4. How a request flows

### 4.1 A visitor opens a page

1. Caddy terminates HTTPS for `myseed.com.et` and forwards to the `web` container (`deploy/vps/deploy.sh` writes the Caddyfile).
2. `apps/web/middleware.ts` picks the locale: the `myseed_locale` cookie, then country from the CDN header, then browser language, then English. It also applies redirects managed in Admin, SEO (cached for 60 seconds).
3. The page renders on the server. `lib/api.ts` fetches from the API at `API_INTERNAL_URL` with incremental revalidation (60 seconds by default). If the API is down, it falls back to bundled seed content.
4. Publishing a layout in the console calls the website's `/api/revalidate` route with `REVALIDATE_SECRET`, so cached pages refresh.

### 4.2 A browser calls the API

1. Both Next.js apps rewrite `/api/*` and `/uploads/*` to the API (`next.config.mjs`). On the VPS, Caddy also routes `/api/*`, `/healthz` and `/uploads/*` on the site domain straight to the API.
2. The API middleware runs in this order (`services/api/src/app.ts`): Helmet, extra security headers, CORS allowlist (`ALLOWED_ORIGINS`), JSON body (15 MB; raw body kept for webhook signatures), request ID, structured JSON log with masked IP, rate limit.
3. The route checks the session (`requireAuth`) and permission where needed, calls a service, and the service uses `db` (PostgreSQL or the in-memory store).
4. Successful admin changes are written to the audit log (`auditLog.middleware.ts`). Errors go through `errorHandler.ts` as `{ error: { code, message } }`.

### 4.3 A payment

1. The donor starts a checkout (`POST /api/donations/checkout`). The provider registry (`providers/registry.ts`) builds Chapa, Telebirr, Stripe or bank transfer from the vault or environment.
2. The provider calls back on `POST /api/donations/webhook/:provider`. Signatures are checked over the raw body, and webhooks are idempotent.
3. The return page (`/donate/success`) calls `GET /api/donations/verify/:txRef`. Paid documents get an HMAC verification code that anyone can check at `/receipts/verify`.
4. Bank transfers: the donor submits proof (`/api/donations/bank/:txRef/proof`, `/details`). Fraud checks run, then MySeed Verify or Tina Verify confirm it automatically, or finance approves it by hand.

## 5. Database and migrations

- Schema: `packages/database/prisma/schema.prisma`, 44 models and 8 enums. Main groups: content and translations (`Language`, `ContentTranslation`, `Post`, `Faq`, `Event`, `TeamMember`, `Partner`, `JobOpening`, `Testimonial`, `Category`), engagement (`Inquiry`, `NewsletterSubscriber`, `NewsletterCampaign`, `ChatbotInteraction`, `SearchLog`), money (`DonationCampaign`, `DonationTransaction`, `PaymentProof`, `PaymentReferenceClaim`, `FinanceEntry`, `PaymentFollowUp`, `FinanceBackup`), sponsorship aid (`AidApplication`, `AidDocument`), platform (`User`, `Role`, `AuditLog`, `IntegrationConfig`, `FeatureFlag`, `SiteSetting`, `PageLayout`, `DbSnapshot`, `TrashItem`, `MediaItem`, `MediaFolder`, `MediaBlob`), operations (`ApiUsageLog`, `UptimeMonitor`, `UptimeCheck`, `Deployment`, `AnalyticsEvent`), SEO (`SeoPageMeta`, `SeoRedirect`, `SeoAudit`).
- **Migrations:** there is no `prisma/migrations` folder. Schema changes are applied with `prisma db push`: by `npm run db:push` locally, by the `migrate` container in `docker-compose.prod.yml` on the VPS, and in the Render build command. One-off data changes live in `packages/database/prisma/manual/` (for example `2026-10-roles-as-data.sql`).
- **Seed:** `packages/database/prisma/seed.ts` (`npm run db:seed:raw`) and `services/api/scripts/seed-with-history.ts` (`npm run db:seed`). The API `bootstrap()` also adds built-in roles, seeded staff, feature flags, monitors and the home layout baseline on every start, and each step is idempotent.
- **In-memory fallback:** `services/api/src/lib/db.ts` chooses PostgreSQL if it is reachable and migrated, otherwise `MemoryClient` (`lib/memoryClient.ts`), a Prisma-compatible store seeded from `packages/types/src/seed-data.ts`. Changes in memory mode are lost on restart. `/readyz` reports the mode.
- **Uploaded files:** saved to disk (`services/api/public/uploads`), to an S3-compatible bucket when one is connected, and also as a database copy (`MediaBlob`) so a replaced disk cannot lose them.

## 6. Authentication and permissions

| Part | How it works | Files |
| --- | --- | --- |
| Passwords | PBKDF2-SHA512, 10,000 iterations, random salt | `services/auth.service.ts` |
| Session | HS256 token signed with `JWT_SECRET`, valid 7 days, in the HTTP-only `myseed_token` cookie (or a bearer header) | `auth.service.ts`, `controllers/auth.controller.ts` |
| Checks per request | The account must be active and the token must be newer than the last password change; the role is read from the account, not the token | `middlewares/auth.middleware.ts` |
| Password change | Signs out every other session | `POST /api/auth/password` |
| Rate limits | Login 15 per 15 minutes (`AUTH_RATE_LIMIT_MAX`), password 10 per 15 minutes, API reads 1,200 per minute, writes 120 per minute, analytics 600 per minute, sensitive forms 20 per minute | `middlewares/rateLimiter.ts` |
| Permissions | `area:action` strings, `area:*` and `system:*` wildcards; 18 areas; roles stored in the `Role` table and cached in memory | `packages/types/src/rbac.ts`, `services/role.service.ts` |
| Restrictions | Super Admin is locked to `system:*`; Developer can never get sensitive areas (`donation`, `aid`, `finance`, `settings`) | `ROLE_RESTRICTIONS` |
| Console guard | Redirects to `/login` without a session cookie; screens also gate by permission | `apps/admin/middleware.ts` |
| Second factor | Not found in the code | |

## 7. Background and scheduled work

All timers start in `services/api/src/lib/bootstrap.ts` and run inside each API process.

| Job | Interval | File |
| --- | --- | --- |
| Uptime checks of the website, admin, API and added URLs, with incidents and alerts | 15 seconds tick | `services/monitor.service.ts` |
| Scheduled newsletter campaigns | 30 seconds tick | `services/newsletterCampaign.service.ts` |
| Sync of open MySeed Verify payment requests | 120 seconds | `services/bankTransfer.service.ts` (`startMyseedSync`) |
| Media backfill to the database | Once at start | `services/media.service.ts` |
| Tier 2 translation of saved content | On save, in the background | `services/translation.service.ts` |
| Nightly database backup | 02:30 on the VPS (cron from `setup.sh`) | `deploy/vps/backup.sh` |
| External uptime check | Every 30 minutes on GitHub (off until `UPTIME_ENABLED` is `true`) | `.github/workflows/uptime.yml` |

> [!WARNING]
> With more than one API instance, every timer runs once per instance and rate limits multiply. The platform is designed for one API process.

## 8. Integrations

Each provider is set in Admin, Integrations (encrypted in `IntegrationConfig`, takes priority) or through environment variables. The catalog is `packages/types/src/integrations.ts`, live tests are in `services/api/src/services/integration.tests.ts`, and every outbound call is logged to `ApiUsageLog` (`lib/usage.ts`).

| Service | Purpose | Files |
| --- | --- | --- |
| Chapa | ETB payments (cards, Telebirr and CBE Birr through Chapa), balances | `providers/payment.provider.ts`, `services/finance.service.ts` |
| Telebirr (direct, H5 C2B "Fabric") | Direct Telebirr checkout and signed notifications | `providers/telebirr.provider.ts` |
| Stripe | International card payments, balance, fees, payouts | `providers/payment.provider.ts` |
| MySeed Verify (`transactionverify.myseed.com.et`) | Payment requests and bank or wallet proof verification; receipt QR scanning | `providers/myseedVerify.provider.ts`, `routes/verify.routes.ts`, `lib/qr.ts` |
| Tina Verify | Checks Ethiopian bank and Telebirr receipts | `providers/tina.provider.ts` |
| AfroMessage, Iconic SMS | SMS messages | `providers/sms.provider.ts` |
| SMTP, Resend, SendGrid, Mailgun, Postmark | Transactional and newsletter email; IMAP copy to the Sent folder | `providers/email.provider.ts`, `lib/imap.ts` |
| Google Cloud Translation v2 | Tier 2 content translation (preferred) | `providers/translation.provider.ts` |
| Anthropic Claude | Assistant answers grounded in the FAQ; Tier 2 fallback translation; `npm run i18n:translate`; billed usage through the Admin API | `providers/ai.provider.ts`, `services/usage.service.ts`, `apps/web/scripts/i18n-translate.ts` |
| S3-compatible storage (S3, R2, MinIO) | Media uploads | `services/media.service.ts` |
| WhatsApp, Telegram | Support handoff links; Telegram, Slack, Discord and email alerts | `services/alert.service.ts` |
| Vercel, deploy hooks | Deployment history and Redeploy button | `routes/platform.routes.ts` |
| PageSpeed Insights, IndexNow, search console verification | SEO tools | `services/seo.service.ts` |
| Hostinger, Render, Netlify, Vercel, Supabase, GitHub | Deploys and database sync from the control panel | `control-panel/hosting.py`, `control-panel/providers.py` |

## 9. Deployment

| Target | How | Files |
| --- | --- | --- |
| Hostinger VPS (documented default) | The control panel, or by hand: `git archive` the commit, upload it to `/opt/myseed/incoming`, run `deploy.sh <release>`. Images build while the old containers keep serving; the database is dumped; `/opt/myseed/current` switches; health checks run | `deploy/vps/*.sh`, `docker-compose.prod.yml`, `deploy/vps/docker-compose.vps.yml` |
| Render | Blueprint with three web services (`myseed-api`, `myseed-web`, `myseed-admin`), auto-deploy on push, region Virginia, free plan | `render.yaml` |
| Netlify or Vercel | Website and console only; API stays on Render or the VPS | `apps/web/netlify.toml`, `apps/admin/netlify.toml` |
| Any Docker host | `docker compose -f docker-compose.prod.yml up -d --build` | `docker-compose.prod.yml` |

- **Who can deploy:** anyone with the control panel's password on the staff computer that holds the SSH key, or SSH access to the VPS. Render auto-deploys every push to the linked branch.
- **Roll back:** `bash /opt/myseed/incoming/deploy.sh --rollback` (or **Roll back** in the panel) starts the previous release; the newest 3 releases are kept. The database is not rolled back. Restore a dump for that (see [working on it](WORKING-ON-IT.md)).
- On the VPS only Caddy (ports 80 and 443) is public. The firewall allows SSH, HTTP and HTTPS.

## 10. Observability

| What | Where |
| --- | --- |
| Structured JSON logs with request ID and masked IP | API stdout; `docker compose ... logs api` |
| Liveness and readiness | `GET /healthz`, `GET /readyz` (reports database mode) |
| Uptime, incidents, alerts | Admin, Status and deploys (`operations`); alerts by email, Slack, Discord, Telegram |
| External uptime | `.github/workflows/uptime.yml` opens and closes a `downtime` issue |
| System health | Admin `developer/health`: database mode and latency, memory, event-loop lag, providers, record counts |
| API usage and cost | Admin `usage`: calls, errors, latency, tokens, estimated cost, monthly AI budget |
| Audit log | Admin `audit-log` |
| Web analytics and Web Vitals | Admin `analytics`, cookie-free beacons to `/api/analytics/event` |
| Error tracking service (Sentry or similar) | Not found in the code |
