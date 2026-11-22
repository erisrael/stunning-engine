# MySeed Academy software requirements specification

## 1. Introduction

### 1.1 Purpose

This document states the requirements of the MySeed Academy website, admin console and API as they are built at commit `31bd529` (17 November 2026). It follows the IEEE 830 and ISO/IEC/IEEE 29148 outline. It is written from the code, not from plans. The older planning SRS is kept as [existing SRS](../existing/docs/ops/01-srs-ieee830-iso29148.md).

### 1.2 Scope

In scope: the public website (`apps/web`), the admin console (`apps/admin`), the REST API (`services/api`), shared packages, deployment scripts and the local control panel.

Out of scope: the MySeed learning app (video lessons, quizzes, offline lessons, progress), and the support mini-app for tickets and live agents.

### 1.3 Conventions

- IDs: `FR-` functional, `NFR-` non-functional, `IR-` interface, `DR-` data.
- Priority in brackets uses MoSCoW: (Must), (Should), (Could), (Won't).
- "Acceptance:" names how to check the requirement. TC numbers point to the [test plan](TEST-PLAN.md).

### 1.4 Definitions

| Term | Meaning |
| --- | --- |
| Tier 1 | English and Amharic, written by editors |
| Tier 2 | Spanish, French, Arabic, Mandarin, Hindi, Portuguese, Russian, machine translated |
| Vault | Encrypted storage of provider credentials (`IntegrationConfig`) |
| Memory mode | The API serving from the in-memory store because PostgreSQL is unreachable |
| Pledge | A donation or sponsorship transaction before it is paid |
| Aid application | A student's request to be sponsored |

## 2. Overall description

### 2.1 Product perspective

A three-part web platform: website and console (Next.js) in front of one Express API with PostgreSQL. See [architecture](ARCHITECTURE.md).

### 2.2 Users

| User class | Access |
| --- | --- |
| Visitors, donors, sponsors, applicants, subscribers | Public website, no account |
| Staff | Admin console, one account each, a role from section 3.4 |
| Operators | Control panel and SSH to the server |

### 2.3 Operating environment

- Browsers: last 2 versions of Chrome, Firefox, Safari and Edge, plus browsers that fully support ES modules (`browserslist` in `package.json`).
- Server: Node.js 20, PostgreSQL 16, Docker Compose on Ubuntu 24.04 (VPS) or Render.
- Visitors are mostly in Ethiopia, many on phones and mobile data.

### 2.4 Constraints

- English and Amharic content are mandatory.
- No emoji in the interface.
- Developer role must never see donor data or secrets.
- `ENCRYPTION_KEY` must not change after launch.
- One API process (timers and in-memory caches).
- Payment providers available in Ethiopia: Chapa, Telebirr, local banks.

### 2.5 Assumptions

- A PostgreSQL database is reachable in production. Without it the API runs in memory mode.
- Provider keys are entered by staff. Without them the platform uses its fallbacks.

## 3. Functional requirements

### 3.1 Website and languages

- **FR-1** (Must) The website serves every page under `/[locale]` for 9 languages, with `lang` and `dir` set, and right-to-left layout for Arabic. Acceptance: TC-2.
- **FR-2** (Must) The locale is chosen in this order: saved `myseed_locale` cookie, English for visitors in Ethiopia, browser language, the country's main language, English. Links that already have a locale are never redirected; a banner offers a switch. Acceptance: TC-2.
- **FR-3** (Must) A header toggle switches between English and Amharic in one tap, and a menu lists all nine languages. Acceptance: TC-2.
- **FR-4** (Must) The homepage is rendered from the published page builder layout. Acceptance: TC-6.
- **FR-5** (Must) Content pages exist for about, team, partners, learning programs per grade band, schools, partnerships, careers, privacy, terms and accessibility. Acceptance: TC-1.
- **FR-6** (Should) If the API is down, public pages render from bundled seed content. Acceptance: TC-1 with the API stopped.
- **FR-7** (Should) Maintenance mode shows a maintenance page to visitors while editors can still preview. Acceptance: TC-12.

### 3.2 Content management

- **FR-8** (Must) Staff create, edit and delete articles, categories, FAQs, events, team members, partners, job openings, testimonials and campaigns. English and Amharic fields are required and checked by the API. Acceptance: TC-5.
- **FR-9** (Must) Saving content starts background Tier 2 translation with Google Cloud Translation or Claude. Editor overrides are never overwritten. Acceptance: TC-5.
- **FR-10** (Should) The Translations screen shows coverage per language, machine versus reviewed fields, and allows overrides and re-translation. Acceptance: TC-5.
- **FR-11** (Must) A rich text editor supports headings, fonts, sizes, colors, lists, quotes, code, links, images and tables. The API sanitises stored HTML to an allowlist. Acceptance: unit suite "Platform logic"; TC-5.
- **FR-12** (Must) The page builder keeps versioned layouts: reorder, archive, remove and add sections, hide per device, preview at device widths and languages, run a render test in English and Amharic, apply to the live site, restore an older version. Publishing needs `pages:publish`. Acceptance: TC-6.
- **FR-13** (Should) Staff edit site appearance (header, footer, section backgrounds, brand assets), the donate page and managed pages. Acceptance: unit suite "Section backgrounds, header, footer, brand".
- **FR-14** (Must) The media library accepts uploads up to 10 MB with a MIME allowlist and content checks, sanitises SVG, requires English and Amharic alt text, and supports folders up to 4 levels. Acceptance: unit suite "Media storage and subfolders".
- **FR-15** (Should) Deleted records go to a recycle bin for 30 days and can be restored with their original ID. Acceptance: unit suite "Trash, data health and integrity".
- **FR-16** (Should) Staff can take, compare and restore snapshots of content and settings. Restores never touch payments, sponsors, inquiries, subscribers, staff, roles, credentials or logs. Acceptance: unit suite "Database history snapshots".

### 3.3 Engagement

- **FR-17** (Must) Contact, school demo and partnership forms validate input on both sides, use a honeypot and rate limits, and send an acknowledgement with a reference number. Acceptance: TC-7.
- **FR-18** (Must) Staff triage inquiries by status and type, and reply by email. Acceptance: TC-7.
- **FR-19** (Must) Newsletter sign-up uses double opt-in: a new address is pending until the emailed link is confirmed. Unsubscribe links are HMAC-signed and support one-click POST (RFC 8058). Acceptance: TC-8.
- **FR-20** (Should) Staff compose broadcasts by language and group, preview them, and schedule them. Acceptance: TC-8.
- **FR-21** (Must) Site search covers articles, FAQs, events, team and pages in the visitor's language and both Tier 1 languages, with synonyms. Search queries are logged for the Search insights screen. Acceptance: TC-3.
- **FR-22** (Must) The assistant answers from verified FAQs with a confidence score. With an Anthropic key it may answer with Claude, grounded only in the knowledge base. Low confidence hands off to WhatsApp or Telegram with the question filled in. It never invents fees. Acceptance: TC-4.
- **FR-23** (Should) Unanswered assistant questions land in a queue that staff turn into bilingual FAQs or dismiss. Acceptance: TC-4.
- **FR-24** (Should) The monthly AI budget switches the assistant to FAQ-only answers when it is reached. Acceptance: To confirm (no test found).

### 3.4 Accounts and access

- **FR-25** (Must) Staff sign in with email and password. Sessions last 7 days in an HTTP-only cookie. Login does not reveal whether an account exists. Acceptance: unit suite "Auth"; TC-10.
- **FR-26** (Must) Changing a password signs out every other session. Acceptance: unit suite "Auth".
- **FR-27** (Must) Built-in roles are Super Admin, System Admin, Content Manager, Donation Manager, Developer and SEO Manager. Staff with `roles:write` can create custom roles and edit permissions; privilege escalation and self-lockout are blocked. Acceptance: TC-10.
- **FR-28** (Must) The Developer role can never hold the `donation`, `aid`, `finance` or `settings` areas, in the console or the API. Acceptance: TC-10.
- **FR-29** (Must) Every successful admin change is written to the audit log. Acceptance: TC-10.
- **FR-30** (Should) Staff edit their own profile, photo, console language and sign-in email (current password needed). Acceptance: TC-10.
- **FR-31** (Could) Two-factor sign-in and a list of active sessions. Acceptance: Not built.

### 3.5 Donations and sponsorship

- **FR-32** (Must) Donors pay through Chapa, Telebirr (through Chapa or direct), Stripe cards or bank transfer, in a three-step flow (campaign, amount, details) with optional donor details and an anonymous option. Acceptance: TC-9.
- **FR-33** (Must) Webhooks verify signatures over the raw body and are idempotent; campaign totals update atomically. Acceptance: unit suite "Payments and site configuration".
- **FR-34** (Must) Sponsorship pricing is set in the console: billing unit (default 3 months), base price (default 1,000 ETB), add-on grade price (default 100 ETB), plans (3 months, 6 months, 1 year), grades, and a USD card price (default 3; 0 hides card). A quote endpoint computes the price. Acceptance: unit suite "Sponsorships, invoices and receipts".
- **FR-35** (Must) Bank transfer pledges require proof as configured (screenshot, receipt link or transaction number). One reference or receipt link can pay for only one pledge; reused screenshots, unknown link hosts, short amounts and old receipts are flagged or held. Acceptance: TC-9; unit suite "Payments and site configuration".
- **FR-36** (Should) With MySeed Verify or Tina Verify on, matching transfers are approved automatically; others wait for finance. Open MySeed Verify requests are synced every 2 minutes. Staff can check one or many transactions. Acceptance: unit suite "Billing periods and MySeed Verify".
- **FR-37** (Must) Paid invoices and receipts carry an HMAC verification code that anyone can check at `/receipts/verify`; rejected payments show as not valid. Signature and stamp images are encrypted and appear only on valid paid receipts. Acceptance: TC-9.
- **FR-38** (Must) Test checkout runs only outside production, and only when an admin allows it. Acceptance: unit suite "Payments and site configuration".
- **FR-39** (Should) Recurring sponsorship billed automatically by the provider. Acceptance: Not found in the code; plans are paid up front per period.

### 3.6 Sponsorship applications (aid)

- **FR-40** (Must) Applicants pass a screening questionnaire. Qualifying answers get a signed pass for 2 hours, tied to the device and IP. Acceptance: TC-11.
- **FR-41** (Must) Applicants upload documents one at a time against the pass, then submit. Each application gets automatic warnings (same device, same IP, reused document, location outside Ethiopia); obvious repeats are refused. Acceptance: TC-11.
- **FR-42** (Must) Reviewers with `aid:review` approve, reject or waitlist. Approval commits money from the sponsorship fund (paid sponsorships less refunds and commitments); without enough money the application waits in order. Finance approves with `aid:fund`; the reviewer then gives a 3, 6 or 12 month package and an access code. Acceptance: TC-11.
- **FR-43** (Should) Applicants check their status on `/get-sponsored/status`. Acceptance: TC-11.

### 3.7 Finance

- **FR-44** (Must) Finance views per receiving method (Chapa, Telebirr, cards, bank transfer) show payments, a ledger of withdrawals, refunds, swaps and adjustments, and follow-ups. Nothing in these views moves money. Acceptance: TC-9.
- **FR-45** (Should) Finance shows live Chapa and Stripe balances, Stripe fees and payouts, and verifies stuck payments. Acceptance: To confirm with live keys.
- **FR-46** (Should) Finance data can be exported, backed up, cleared (after an automatic backup) and restored into an empty ledger. Acceptance: unit suite "Finance exports, backups and clearing".
- **FR-47** (Should) Suspected fake payments can be marked, filtered and deleted from a Fakes tab. Acceptance: To confirm (no automated test found).

### 3.8 SEO and analytics

- **FR-48** (Must) Every page has a title, description, canonical URL, Open Graph tags and hreflang alternates for 9 locales plus x-default; structured data is added where it fits. Acceptance: TC-3.
- **FR-49** (Must) The website serves `sitemap.xml`, `robots.txt`, a web manifest and `llms.txt`. Acceptance: TC-3.
- **FR-50** (Should) Admin, SEO runs a site audit, per-page metadata overrides, redirects (applied by the website middleware), keyword checks, PageSpeed reports and IndexNow submissions. Acceptance: TC-3.
- **FR-51** (Should) Cookie-free page view and Web Vitals beacons feed the Analytics screen, and respect Do Not Track and Global Privacy Control. Acceptance: TC-1.

### 3.9 Platform operations

- **FR-52** (Must) Admin, Integrations stores provider credentials encrypted, validates their format, runs live tests before saving, and shows webhook URLs. Acceptance: unit suite "Vault".
- **FR-53** (Should) Feature flags switch the assistant, auto-translation, donations, demo bookings, newsletter and the announcement bar. Acceptance: TC-12.
- **FR-54** (Should) Uptime monitors check the website, admin, API and added URLs, group failures into incidents, and alert by email, Slack, Discord or Telegram. Acceptance: TC-12.
- **FR-55** (Should) API usage shows calls, errors, latency, tokens and estimated cost per provider. Acceptance: TC-12.
- **FR-56** (Could) Deployment history and a Redeploy button for Vercel or a deploy hook. Acceptance: To confirm with a configured hook.
- **FR-57** (Should) The console shows an OpenAPI 3.1 reference generated from the route registry, and a system health page. Acceptance: TC-12.
- **FR-58** (Should) A data health screen finds inconsistent records and fixes one kind at a time. Acceptance: unit suite "Trash, data health and integrity".

### 3.10 Out of scope

- **FR-59** (Won't) Support tickets or live agent chat on the website.
- **FR-60** (Won't) Learning content delivery (videos, quizzes, offline sync). This belongs to the MySeed app.

## 4. Non-functional requirements

### 4.1 Security

- **NFR-1** (Must) Provider secrets are encrypted with AES-256-GCM and only masked values reach the browser. Acceptance: unit suite "Vault".
- **NFR-2** (Must) Passwords are stored as PBKDF2-SHA512 hashes; tokens are HMAC-signed and checked in constant time. Acceptance: unit suite "Auth".
- **NFR-3** (Must) API responses carry Helmet headers; the website sends a Content Security Policy, HSTS, nosniff, and referrer and permissions policies; Caddy adds HSTS. Acceptance: TC-1 (headers).
- **NFR-4** (Must) Rate limits: login 15 per 15 minutes, password change 10 per 15 minutes, API writes 120 per minute, reads 1,200 per minute, forms and chat 20 per minute. Acceptance: unit suite "Rate limiter".
- **NFR-5** (Must) CORS allows only `ALLOWED_ORIGINS`. Acceptance: TC-10.
- **NFR-6** (Must) Uploaded files are checked by content and SVGs are sanitised. Acceptance: unit suite "Media storage".
- **NFR-7** (Must) On the VPS only ports 80 and 443 (and SSH) are reachable. Acceptance: To confirm on the live server.

### 4.2 Privacy

- **NFR-8** (Must) Logs mask client IP addresses. Acceptance: code review of `requestLogger.ts`.
- **NFR-9** (Must) Analytics set no cookies and respect Do Not Track and Global Privacy Control. Acceptance: TC-1.
- **NFR-10** (Must) Applicant identity numbers, documents and location are visible only with the `aid` permission. Acceptance: TC-11.
- **NFR-11** (Should) Database backups and downloaded backups are kept private (mode 600 on the server, git-ignored locally). Acceptance: inspection.

### 4.3 Availability

- **NFR-12** (Must) The API keeps serving from memory when PostgreSQL is unreachable and reports `memory` on `/readyz`. Acceptance: CI runs the whole E2E suite in memory mode.
- **NFR-13** (Should) A deploy keeps the old containers serving while new images build, and fails safely if health checks fail. Acceptance: To confirm on the live server.
- **NFR-14** (Should) An external check alerts when the site, admin or API is down. Acceptance: `uptime.yml`, once `UPTIME_ENABLED` is `true`.

### 4.4 Performance

- **NFR-15** (Should) Public pages are statically generated per locale with incremental revalidation (60 seconds by default). Acceptance: build output.
- **NFR-16** (Should) Fonts are self-hosted and subset; icons and motion imports are tree-shaken; heavy homepage widgets load lazily. Acceptance: build output.
- **NFR-17** (Could) Mobile Largest Contentful Paint under 2.5 seconds on 3G. Acceptance: To confirm (no measured result in the repository).

### 4.5 Phones and accessibility

- **NFR-18** (Must) Layouts work from 320 px to 1920 px wide. Acceptance: TC-13.
- **NFR-19** (Must) Public pages meet WCAG 2.2 AA in light and dark themes, in English, Amharic and Arabic. Acceptance: TC-14.
- **NFR-20** (Should) The admin console meets WCAG 2.2 AA. Acceptance: Not yet tested.

### 4.6 Language

- **NFR-21** (Must) All interface text exists in all nine languages; Amharic uses Noto Sans Ethiopic and Arabic uses Noto Sans Arabic. Acceptance: TC-2.
- **NFR-22** (Must) No emoji anywhere in the interface. Acceptance: code review.
- **NFR-23** (Could) The admin console in Amharic. Acceptance: To confirm; a console language setting exists on the profile.

## 5. Interface requirements

| ID | Priority | Service | Use | Required config | Fallback |
| --- | --- | --- | --- | --- | --- |
| IR-1 | Must | Chapa (`api.chapa.co/v1`) | ETB checkout, verification, webhooks, balances | `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET` or vault | Test checkout outside production |
| IR-2 | Should | Telebirr Fabric H5 C2B | Direct Telebirr checkout and notifications | Vault `PAYMENT_TELEBIRR` | Telebirr through Chapa |
| IR-3 | Should | Stripe (`api.stripe.com`) | International cards, balance, fees, payouts | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Card option hidden |
| IR-4 | Should | MySeed Verify (`transactionverify.myseed.com.et`) | Payment requests and proof verification | Vault `VERIFY_MYSEED` | Manual approval |
| IR-5 | Could | Tina Verify (`api.tinaverify.com`) | Bank and Telebirr receipt checks | Vault `VERIFY_TINA` | Manual approval |
| IR-6 | Must | Email: SMTP, Resend, SendGrid, Mailgun, Postmark | Acknowledgements, receipts, newsletter, alerts | `SMTP_*`, `RESEND_API_KEY` and others, or vault | Email logged, not sent |
| IR-7 | Could | SMS: AfroMessage, Iconic SMS | SMS messages | Vault `SMS_AFROMESSAGE`, `SMS_ICONIC` | No SMS |
| IR-8 | Should | Google Cloud Translation v2 | Tier 2 content translation | `GOOGLE_TRANSLATE_API_KEY` | Claude, then English |
| IR-9 | Should | Anthropic API | Assistant answers, translation fallback, interface translation script, billed usage | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` | FAQ matching only |
| IR-10 | Should | S3-compatible storage | Media uploads | `S3_*` | Disk plus database copy |
| IR-11 | Could | Vercel API, deploy hooks | Deploy history, redeploy | `VERCEL_*`, `DEPLOY_HOOK_URL` | Hidden |
| IR-12 | Could | PageSpeed Insights, IndexNow | SEO reports and indexing | `PAGESPEED_API_KEY`, `PUBLIC_SITE_URL` | Hidden |
| IR-13 | Should | Alert channels: email, Slack, Discord, Telegram | Downtime, failed payments, new inquiries and donations | Vault `MONITORING_ALERTS` | No alerts |
| IR-14 | Should | WhatsApp, Telegram links | Support handoff | `WHATSAPP_NUMBER`, `TELEGRAM_HANDLE` | Not shown |
| IR-15 | Must | CDN country headers (`CF-IPCountry`, `X-Vercel-IP-Country`, `CloudFront-Viewer-Country`) | Locale detection | None | Browser language region |
| IR-16 | Must | Website revalidation endpoint `/api/revalidate` | Refresh cached pages on publish | `REVALIDATE_SECRET` on API and website | Pages refresh on their timer |
| IR-17 | Must | Public REST API `/api/*` | Website and console data; OpenAPI at `/api/developer/openapi.json` | None | None |

## 6. Data requirements

- **DR-1** (Must) Every content type stores English and Amharic; Tier 2 values live in `ContentTranslation` with a machine or reviewed flag.
- **DR-2** (Must) Money amounts are stored with their currency. Each payment has a unique transaction reference; a bank reference or receipt link can be claimed by one pledge only (`PaymentReferenceClaim`).
- **DR-3** (Must) Finance records are never deleted by a content snapshot restore. Clearing the ledger always writes a `FinanceBackup` first.
- **DR-4** (Must) Deleted records stay in `TrashItem` for 30 days with what they linked to.
- **DR-5** (Must) Credentials are stored only encrypted; `ENCRYPTION_KEY` is kept outside the database and must not change.
- **DR-6** (Must) Applicant documents are stored with the application and served only to staff with `aid:read`.
- **DR-7** (Should) Uploaded media is kept on disk or in a bucket and also in `MediaBlob`.
- **DR-8** (Should) Production database dumps are kept 14 days on the server; weekly uploads archives are kept 35 days.
- **DR-9** (Should) Audit log, API usage and analytics are kept in the database. Retention limits: To confirm (none found in the code).
- **DR-10** (Must) Schema changes are applied with `prisma db push`; no data-losing change may be forced in production.

## 7. Open requirements

| Item | State |
| --- | --- |
| Two-factor sign-in and active sessions list (FR-31) | Not built |
| Automatic recurring billing (FR-39) | Not built |
| Admin console accessibility audit (NFR-20) | Not done |
| Running more than one API instance (shared rate limits, single job runner) | Not built; Redis unused |
| Migration history instead of `db push` | Not built |
| Mobile performance budget measured (NFR-17) | To confirm |
| Retention rules for logs, analytics and applicant documents | To confirm |
| Learning app integration (for example sponsor impact data) | Not built; depends on the separate app |
| Publishing workflow with review and scheduling for articles | Not built (newsletters can be scheduled) |
| Pages other than the homepage built from blocks, menu editor | Partly: the block library and managed pages exist; full site builder not done |
