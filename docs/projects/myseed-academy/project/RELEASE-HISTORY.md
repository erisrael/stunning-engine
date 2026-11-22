# MySeed Academy release history

## 1. How this history is built

The repository has no git tags and no changelog file. This history groups the 38 commits on `main` by date, from `git log`. Newest first. Commit hashes are given so each entry can be traced.

> [!NOTE]
> `existing/docs/ops/07-release-notes-and-checklist.md` describes a release "v2.4.0" with a tag `v2.4.0-prod-release`, a learning curriculum and offline sync. No such tag or feature exists in this repository. Treat that document as a template, not as history.

## 2. 17 November 2026: quarterly sponsorship pricing (`31bd529`)

### New

- Sponsorship priced per 3 months by default: 1,000 ETB per student, add-on grades 100 ETB, plans of 3 months, 6 months and 1 year (`packages/types/src/sponsorship.ts`).
- Company outreach on the partnerships page, with a jump menu between sections.
- `llms.txt` route on the website for AI crawlers.
- Founders and proof content, with new site photos.
- Operations documents in `docs/ops/` (and a copy in `OPS doc/`).

### Improved

- About page, learning pages, homepage content and SEO metadata.
- Office address updated to Bole.

## 3. 11 to 13 November 2026: finance workspace, MySeed Verify and sponsorship aid

### New

- Student sponsorship applications ("Get sponsored"): screening, document upload, automatic warnings, review, a funded waiting list, finance approval, packages and access codes (`c3c78eb`).
- Finance workspace per payment method, with billing periods and sortable packages; donor details asked last and optional (`2f84c1e`).
- MySeed Verify integration: automation tab, single and bulk verification, filters, instant confirmation during the bank transfer flow, receipt QR scanning, and a background sync of open requests every 2 minutes (`c19d264`, `0542607`, `d43a306`, `84165d8`, `1d9f576`).
- Fakes tab and delete mechanism for suspected fake payments; MySeed Verify rejection handling (`8321b26`).
- Auto-filtering toolbar across all finance tabs (`4d2987d`).
- Site appearance and login page settings, new admin shell and logo component (`8b16854`).

### Improved

- Admin console look: ink sidebar, denser scale, sidebar that follows the theme, surface themes, icon packs, colourful navigation, personal appearance settings (`71f02a4`, `c79a92b`, `df2ed75`).
- Visual page builder navigation and preview tokens; compose frame-ancestors for the builder (`4551da1`).
- Bank transfer: a proof item is required before the next step (`d43a306`).

### Fixed

- Upload dropzone click trigger in the bank transfer flow; admins can hide proof options; automatic verify badge (`8dffc46`).

## 4. 5 to 10 November 2026: VPS hosting fixes

### New

- Other apps on the same server can share MySeed's Caddy through an `edge` Docker network (`f18949e`).

### Fixed

- Environment values are quoted in `env.sh`; single-domain path routing for the API in Caddy (`7db9d26`).
- API Dockerfile sets `NODE_ENV=production` later so dev dependencies install for the type check (`5f6c50b`).
- API image installs OpenSSL, gives the repository to the `node` user, and runs the migration as root (`6eaedec`).

## 5. 2 to 4 November 2026: payments, receipts, site design tools

### New

- Admin-controlled payment methods, an editable donate page, a receipt designer, site appearance, managed pages and branding; direct Telebirr provider (`410e433`).
- Bank transfers with proof upload, receipt verification page `/receipts/verify`, invoices and receipts with verification codes, SMS providers, Tina Verify (`c54e664`).
- Section backgrounds, header and footer editor, brand assets, favicon route (`ff91add`).
- Data tools: recycle bin, data health checks and fixes, finance exports, backups and clearing (`0a44e0d`).
- Media storage with subfolders and a database copy of every upload (`26fba62`).
- Site photos and section cards (`6f5b664`).
- Block library, motion and animation editor, custom blocks, templates and text effects (`55296f7`, `40cca26`, `a321251`).

### Improved

- Bank transfer flow and SMS providers (`d8e6128`).
- Website performance: deferred and lazy homepage widgets, separate mobile header, static visuals (`b22030f`).

## 6. 1 November 2026: deploy tooling

### New

- Local control panel with Hostinger VPS deploys (`deploy/vps/`, including the nightly `backup.sh`), and the external uptime workflow `.github/workflows/uptime.yml`; "Sponsor a student" tab; contacts; roadmap items; newsletter composer and scheduled campaigns (`e1c741e`).
- Render, Netlify, Vercel and Supabase in the control panel; `render.yaml`; local domains with a proxy; sponsor side dock and quick donate popup (`fc61442`).
- Push and pull between the local database and Supabase (`scripts/db-sync.mjs`); local production run (`cc1e594`, `1c66403`).

## 7. 12 October 2026: first full release (`bcc2d6c`)

### New

- Monorepo with the website, admin console, API and shared packages (326 files).
- Website in nine languages with location-aware language choice, RTL Arabic, WCAG 2.2 AA target.
- Bilingual CMS, translations, media library, page builder with versions.
- Search, assistant with handoff, inquiries, newsletter, donations with Chapa and Stripe.
- Integrations vault, roles and permissions, audit log, SEO tools, analytics, API usage, uptime monitoring.
- Dockerfiles, production compose file, CI workflow, runbooks and ADRs.

## 8. 8 October 2026: repository created (`f4c23f4`)

### New

- Initial commit.
