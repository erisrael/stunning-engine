# MySeed Academy

The official website and admin console for MySeed Academy: bilingual (English and Amharic) STEM learning for Grades 5 to 12 in Ethiopia, available in nine languages.

- **Public website** (`apps/web`, port 3000): Next.js 14, server-rendered for every locale, WCAG 2.2 AA, right-to-left Arabic.
- **Admin console** (`apps/admin`, port 3001): bilingual CMS with a rich text editor and previews, a page builder with versioned layouts, translations, media, inquiries, assistant queue, newsletter, donations, finance, SEO tools, integrations, API usage, uptime and deployments, API reference, profiles, users, and custom roles.
- **API** (`services/api`, port 8080): Express and TypeScript, PostgreSQL through Prisma, with an automatic in-memory fallback.
- **Design system** (`packages/ui`): components, animated components, and blocks modelled on Watermelon UI. Browse them all at `http://localhost:3001/design-system`.

The complete feature list, mapped to the 22-phase plan, is in [docs/FEATURES.md](docs/FEATURES.md).

## Quick start

Requirements: Node.js 20 or newer. PostgreSQL 16 is recommended but optional.

```bash
npm install
cp .env.example .env          # then edit values
npm run db:generate
npm run dev                   # API :8080, web :3000, admin :3001
```

Open http://localhost:3000 for the site and http://localhost:3001 for the console.

### Database

If PostgreSQL is reachable at `DATABASE_URL`, the API uses it and seeds an empty database automatically. If not, the API logs a warning and serves everything from a seeded in-memory store, so the site and console still work (changes reset on restart). To set up PostgreSQL:

```bash
docker compose up -d postgres   # or use a local PostgreSQL with the same credentials
npm run db:setup                # prisma generate + db push + seed
```

Upgrading a database created before October 2026? Run `packages/database/prisma/manual/2026-10-roles-as-data.sql` first (the command is in the file). It converts staff roles to plain text so custom roles work, without losing anyone's role. Then run `npm run db:push`.

### Staff accounts (seeded)

All seeded accounts use the shared seed password `<seed password>` (defined as `SEED_DEFAULT_PASSWORD` in `packages/types`). Change it before deploying.

| Email | Role |
| --- | --- |
| admin@myseedacademy.org | Super Admin |
| sysadmin@myseedacademy.org | System Admin |
| content@myseedacademy.org | Content Manager |
| donations@myseedacademy.org | Donation Manager |
| developer@myseedacademy.org | Developer (no donor data, no secrets) |
| seo@myseedacademy.org | SEO Manager (SEO tools, read-only content and pages) |

Roles are stored in the database. Create custom roles and change what any role can do in **Users and roles, Roles and permissions**. Super Admin always keeps full access, and the Developer role can never be given donor data or integration secrets. Everyone can change their own details and password on **My profile**; changing a password signs out every other session.

## Languages

| Tier | Languages | How content is produced |
| --- | --- | --- |
| 1 | English, Amharic | Written by editors; both are required for every content type |
| 2 | Spanish, French, Arabic (RTL), Mandarin, Hindi, Portuguese, Russian | Machine translated from English in the background; editors can review and override each field |

The interface (menus, buttons, forms, page copy) is fully translated into all nine languages and ships with the site (`apps/web/lib/i18n/machine/`). Reviewed wording in `lib/i18n/tier2.ts` overrides it. After changing English strings, run `npm run i18n:translate` (needs `ANTHROPIC_API_KEY`) to fill in the new keys.

Content written in the admin (articles, FAQs, events) is translated into Tier 2 when it is saved, using Google Cloud Translation if `GOOGLE_TRANSLATE_API_KEY` is set and Claude if `ANTHROPIC_API_KEY` is set. With neither key, Tier 2 pages show that content in English.

### Which language a visitor sees

1. A language the visitor picked before (`myseed_locale` cookie) always wins.
2. Visitors in Ethiopia start in English. The EN / አማ toggle in the header switches to Amharic in one tap. If their browser is set to Amharic, a banner offers Amharic.
3. Visitors outside Ethiopia get their browser's language if the site supports it. Otherwise they get the main language of their country, for example Brazil gives Portuguese. If neither matches, they get English.
4. Links that already include a language, like `/en/about`, are never redirected. A small banner, written in the suggested language, offers to switch.

The country comes from the CDN header (`CF-IPCountry`, `X-Vercel-IP-Country`, `CloudFront-Viewer-Country`). Without one, such as in local development, the region in the browser language is used.

## Admin console guide

| Page | What it does |
| --- | --- |
| Pages | Homepage layout builder: drag sections into order, archive or remove them, add them back. Every change is a version. Preview a version on the real website at desktop, tablet, and phone sizes, run Test (renders it in English and Amharic and checks every section), then Apply to main site. Older versions can be restored. |
| Articles, FAQs, Events | Rich text editor with headings, fonts, sizes, colors, highlights, alignment, lists, quotes, code, links, images, and tables. The Preview tab shows unsaved edits with the website's typography; articles also open as a draft preview on the real site. |
| SEO | Site audit (titles, descriptions, headings, canonical and language tags, alt text, structured data, speed, duplicates), per-page metadata overrides with a search result preview, redirects, keyword checks, PageSpeed Insights, IndexNow submissions, and visitor search queries. |
| Finance | Donations by gateway and currency, success rate, live Chapa and Stripe balances, Stripe fees, net amounts and payouts, and one-click verification of stuck payments. |
| Integrations | Credentials for every provider with format validation, encrypted storage, live tests (including test checkouts, test emails, and AI prompts) that can run before saving, setup guides, and webhook URLs. |
| API usage | Calls, errors, latency, tokens, and estimated cost per provider, a monthly AI budget that switches the assistant to FAQ-only answers when reached, key rotation dates, and billed Claude usage through the Anthropic Admin API. |
| Status and deploys | Uptime monitors for the website, admin, and API (plus any URL you add) with history bars, response times, and incidents; alerts by email, Slack, Discord, or Telegram; maintenance mode; deployment history and a Redeploy button for Vercel or any deploy hook. |

The current myseed.com.et content, ready to bring into the admin, is in [docs/content/myseed-com-et.md](docs/content/myseed-com-et.md).

## Optional providers

Each provider is used only when it is configured, either in **Admin, Integrations** (encrypted, takes priority) or through these environment variables; otherwise a local fallback runs. Values that do not match a provider's key format are ignored and flagged on the Integrations page.

| Variable | Enables |
| --- | --- |
| `CHAPA_SECRET_KEY` | Chapa and Telebirr donations (ETB) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | International card donations |
| `RESEND_API_KEY` | Real email delivery (otherwise emails are logged) |
| `GOOGLE_TRANSLATE_API_KEY` | Tier 2 translation of admin content (preferred when set) |
| `ANTHROPIC_API_KEY` | Assistant answers grounded in the FAQ (otherwise FAQ matching only); Tier 2 content translation when Google is not set; `npm run i18n:translate` |
| `WHATSAPP_NUMBER`, `TELEGRAM_HANDLE` | Support handoff targets |
| `S3_*` | Media storage bucket (S3, R2, MinIO) |
| `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_DEPLOY_HOOK`, `DEPLOY_HOOK_URL` | Deployment history and the Redeploy button |
| `PAGESPEED_API_KEY`, `PUBLIC_SITE_URL` | PageSpeed reports and IndexNow submissions |
| `REVALIDATE_SECRET` | Set the same value on the API and the website so publishing a layout refreshes cached pages |

## Testing

```bash
npm test             # API unit suites
npm run test:e2e     # Playwright: E2E flows, axe WCAG 2.2 AA, responsive matrix
```

The E2E suite expects the three apps to be running; set `WEB_URL` and `ADMIN_URL` to target other hosts.

## Production

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Set `POSTGRES_PASSWORD`, `ENCRYPTION_KEY`, and `JWT_SECRET` (long random values) plus any provider keys. The compose file runs schema migration and seeding before starting the API. See `docs/runbooks/` for deployment and recovery procedures.

## Repository layout

```
apps/web            Public website (Next.js)
apps/admin          Admin console (Next.js)
services/api        REST API (Express, TypeScript)
packages/ui         Design system
packages/types      Shared types, language registry, bilingual seed content
packages/database   Prisma schema, client, seed script
packages/config     Shared TypeScript config
tests               Playwright suites
docs                Plan, ADRs, runbooks, feature inventory
```
