# MySeed Academy product overview

## 1. What this product is

MySeed Academy (`my-seed-academy`) is the official website and staff console of MySeed EdTech PLC in Addis Ababa. MySeed makes a mobile learning app for Ethiopian students in Grades 5 to 12. This repository does not contain that app. It contains the platform around it:

- the public website, which tells the MySeed story in nine languages and collects sponsorships, donations, inquiries and newsletter sign-ups
- the admin console, where staff edit the site, review payments and sponsorship applications, and run the platform
- the REST API, which serves both and talks to the payment, email, translation and AI providers

> [!IMPORTANT]
> The learning app itself (video lessons, quizzes, offline lessons, the Android package `com.noor.ethiopia`) is a separate product. It is not in this repository. Pages such as `/learning` describe it, and documents in `existing/docs/ops/` describe planned learning features, but no learning code exists here.

## 2. The problem it solves

| Problem | How the platform answers it |
| --- | --- |
| Families cannot always pay for the learning app | Sponsors pay for a student's access: by default 1,000 ETB per student per 3 months, set in Admin, Sponsorship (`DEFAULT_SPONSORSHIP_PRICING` in `packages/types/src/sponsorship.ts`) |
| Students who need help have no way to ask for it | "Get sponsored" applications with screening, document upload, review and a funded waiting list (`/get-sponsored`, `services/api/src/services/aid.service.ts`) |
| Many donors in Ethiopia pay by bank transfer, not card | Bank transfer with proof upload, fraud checks and optional automatic verification (`bankTransfer.service.ts`, MySeed Verify, Tina Verify) |
| Content must reach readers in English and Amharic and beyond | Tier 1 English and Amharic written by editors; Tier 2 (seven languages) machine translated and reviewable |
| A small team has to run the site without developers | A bilingual CMS, a page builder with versions, and integrations configured from the console |

## 3. Who uses it

| Role | Where | What they do |
| --- | --- | --- |
| Visitor (student, parent, school, partner) | Website | Reads content, searches, asks the assistant, contacts MySeed, requests a school demo |
| Sponsor or donor | Website | Sponsors a student or donates through Chapa, Telebirr, Stripe card or bank transfer; checks a receipt |
| Student applying for sponsorship | Website | Answers the screening questions, uploads documents, checks application status |
| Newsletter subscriber | Website, email | Subscribes, confirms, unsubscribes |
| Super Admin | Console | Everything, including other administrators (`system:*`) |
| System Admin | Console | Content, users, integrations, deployments and SEO; can view donations |
| Content Manager | Console | Content, homepage, media, newsletter, inquiries |
| Donation Manager | Console | Campaigns, donations, sponsorship applications, finance reports |
| Developer | Console | API reference, system health, deployments; never sees donor data or secrets |
| SEO Manager | Console | Page metadata, redirects, audits, indexing |
| Custom roles | Console | Any mix of permissions a Super Admin defines (`packages/types/src/rbac.ts`) |

## 4. Modules and main screens

### 4.1 Public website (`apps/web`)

| Area | Routes |
| --- | --- |
| Home (built from page builder sections) | `/[locale]` |
| About, team, partners | `/about`, `/about/team`, `/about/partners` |
| Learning programs (describes the app) | `/learning`, `/learning/[grade]` |
| Schools and demo requests | `/schools`, `/schools/demo` |
| Partnerships | `/partnerships` |
| Resources: articles, events, FAQ | `/resources`, `/resources/articles`, `/resources/articles/[slug]`, `/resources/events`, `/resources/faq` |
| Donate and sponsor | `/donate`, `/donate/success`, the quick donate popup |
| Get sponsored | `/get-sponsored`, `/get-sponsored/apply`, `/get-sponsored/status` |
| Receipt check | `/receipts/verify` |
| Newsletter | `/newsletter`, `/newsletter/confirmed`, `/newsletter/unsubscribed` |
| Search and support | `/search`, `/support`, chat widget |
| Careers and contact | `/careers`, `/careers/[slug]`, `/contact` |
| Legal | `/privacy`, `/terms`, `/accessibility` |
| Machine-readable | `sitemap.xml`, `robots.txt`, `llms.txt`, `indexnow-key.txt` |

### 4.2 Admin console (`apps/admin`)

| Group | Screens (route under `app/(console)/`) |
| --- | --- |
| Content | `content/[resource]` (articles, FAQs, events, team, partners, careers, testimonials, campaigns), `translations`, `media`, `pages`, `site-appearance`, `donate-page` |
| Engagement | `inquiries`, `assistant`, `newsletter`, `search-insights` |
| Money | `donations`, `finance`, `finance/[method]`, `finance/[method]/[view]`, `bank-transfers`, `payment-methods`, `verify`, `receipt-designer`, `sponsorship`, `applications` |
| Growth | `seo`, `analytics` |
| Platform | `integrations`, `usage`, `operations`, `database`, `developer`, `developer/health`, `audit-log`, `users`, `profile`, `design-system` |
| Sign-in | `login` |

### 4.3 API (`services/api`)

Express REST API under `/api/*`, plus `/healthz`, `/readyz` and `/uploads/*`. See [architecture](ARCHITECTURE.md).

### 4.4 Local control panel (`control-panel/`)

A Python web panel that runs only on a staff computer (`127.0.0.1:8766`). It deploys to a Hostinger VPS, Render, Netlify or Vercel, syncs the database with Supabase, commits to GitHub and downloads backups. See [control panel guide](../existing/control-panel/README.md).

## 5. Where it runs

| Surface | Exists | Notes |
| --- | --- | --- |
| Web (desktop and phone browsers) | Yes | Website and admin console; responsive from 320 px |
| Mobile app | No (not in this repository) | The learning app is a separate product |
| Bots | Partly | No bot code; support hands off to WhatsApp and Telegram links; alerts can go to a Telegram chat |
| Devices or kiosks | No | Not found in the code |
| Server | Yes | Docker Compose on a VPS (Hostinger is the documented default), or Render; database on the VPS or Supabase |

## 6. Principles the code keeps

- **Bilingual first.** English and Amharic are required on every content type and checked by the API.
- **Works without its providers.** Each provider is optional. Without keys the platform uses a fallback: logged email, test checkout outside production, English text for Tier 2, FAQ-only assistant. Without PostgreSQL the API serves from a seeded in-memory store.
- **Secrets stay on the server.** Provider keys saved in the console are encrypted with AES-256-GCM and never returned to the browser in full.
- **Least privilege.** Permissions are `area:action` strings; the Developer role can never hold donor data or secrets.
- **Nothing is lost by accident.** Deletes go to a 30-day recycle bin; content snapshots can be restored; finance clears save a backup first.
- **Accessible and calm.** WCAG 2.2 AA is the target, checked with axe in CI. No emoji anywhere in the interface (see [UI rules](../existing/docs/guides/no-emoji-watermelon-ui.md)).
- **Privacy-respecting analytics.** Cookie-free page views; Do Not Track and Global Privacy Control are respected.
- **The website never runs a support desk.** Tickets and live agent chat belong to a separate support mini-app (see [boundary charter](../existing/docs/architecture/boundary_charter.md)).
