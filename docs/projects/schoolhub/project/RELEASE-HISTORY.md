# MySeedSchoolHub release history

From the git history of `build/m0-sdk-foundations` up to commit `16e8c19`, written on 2026-11-23.

> [!NOTE]
> There are no tags and no published releases. The work below has not been merged to `main` or deployed anywhere recorded in the repository. Entries are grouped by commit date; each date is a development period, not a release.

## 1. 2026-11-16: website studio, media manager, theme builder

Commits `9df6407` to `16e8c19`.

### New

- Media manager with folder hierarchy, subfolders and full create, rename, move and delete (`5ef6ea9`).
- Website studio for school and platform websites: granular component editing, batch styling of component groups, expanded fonts and animations, live text editing, icon picker (`d94991e`, `d598bbe`).
- Website drafts and versions, with draft and version deletion behind a confirmation (`5eaa3e7`, `f7053a2`).
- Independent theme settings for the platform website and the platform console (`5d0ff9d`, `040d63a`).
- Switches to turn off badge pills in navigation, all at once, by group or one by one (`be97028`).
- Rich theme builder in school administration (`16e8c19`).

### Improved

- Platform console navigation aligned with the school shell; console tabs shown when its sidebar is collapsed (`040d63a`, `16e8c19`).
- Report builder no longer listed twice in the sidebar (`16e8c19`).
- Submenu counters removed and navigation sidebars cleaned up (`28737f4`).
- Game modules removed from the portal (`9df6407`).

### Fixed

- Branding and logo streaming (`9df6407`).
- Next.js build typecheck errors and unused variables (`050597d`).
- Server-side rendering hydration mismatch in the media manager (`5ef6ea9`).
- JSON parse error on delete, logo and favicon selection, and the themed school sign-in page (`7bf7d3e`).
- Exception on school subdomains in the website renderer (`5eaa3e7`).
- Badge pill removal (`f7053a2`).

## 2. 2026-11-15: certificates and admin settings

Commits `dfe4ed0`, `eafb46a`, `242732e`.

### New

- Certificates: six kinds (completion, merit, honor roll, conduct, leaving, attendance), four visual styles, single and bulk issue, printable HTML and PDF, QR verification, revocation with a reason (migration `0015_certificates`).
- Document core utilities and PDF export templates with barcodes and QR codes.
- Admin modules, platform settings and school configuration screens.

### Improved

- Accessibility audit split into 60 checks (20 pages in desktop light, desktop dark and phone light), with fixes for list view button names and dashboard overflow at 360 px (recorded in the [continuation note](../existing/CONTINUATION.md)).

## 3. 2026-11-14: exams, designers, list work, page states

Commits `3fb1bd8` to `667603b`.

### New

- Exams module: scheduling, admission cards with QR and eligibility rules, door lists, check-in scanning, incident notes, online exams and a simulator (migration `0011_exams`).
- ID card designer with versioned templates and approval, layers, guides, 3D preview, bulk print checks and press sheets (migration `0012_template_versions`).
- Report-card block layout, comment bank, head sign-off, append-only published revisions, hold and release to the apps, bulk generation as a job (migration `0013_report_card_workflow`).
- List work: bulk change with a result report and 15-minute undo, recycle bin, record timeline, edit conflict merge, inline edit, saved views, keyboard shortcuts, import column mapping (migration `0014_list_work`).
- Send SMS to people selected in student, guardian and staff lists, with a recipient count (`d57aa48`).
- Virtual filters and grouping for resources (`5871be2`).

### Improved

- Loading, error and empty states on every page, with retry; dashboard tiles link to the records behind each number, with 12-week sparklines and trends (`b4c4e54`).

### Fixed

- Amharic printed as empty boxes in server PDFs: the API image now installs an Ethiopic font (`667603b`).

## 4. 2026-11-13: app shell, themes, teaching and finance screens

Commits `f56bdc8` to `b3472d1`.

### New

- App shell component for portal layout and navigation.
- Admin, auth and tenant theme modules with API routes and portal components.
- Teaching, attendance, finance and resources modules in the API and portal.
- School branding and theme settings; per-user appearance preferences.
- Migrations `0009_rename_themes` and `0010_booking_guards` (constraints against double booking).

## 5. 2026-11-12: documents, branding and insights

Commits `28b771b`, `e2ce2fb`, `026400b`.

### New

- Document generation with branding and template resolution.
- Modules and user preferences (migration `0008_user_preferences`).
- Insights API and portal resource views.
- Appearance customization.

## 6. 2026-11-11: exports everywhere, console desks, self-hosting kit

Commits `dbca6f3`, `7c5cfa0`, `3d27909`, `5cecae7`.

### New

- Filter panel, group-by, column chooser and PDF, print, XLSX, CSV and JSON exports on every resource page.
- Template designer with live preview for exports, report cards, transcripts and ID cards.
- School pages for ID cards, duplicates, alumni, admissions, rooms, transcripts, finance, payroll, boarding, canteen, clinic, behavior plans, report builder, documents, custom fields and data governance.
- Platform console desks, team, role templates, providers, templates, support, billing, ID card orders, events and settings, with permission-based navigation.
- Live updates, Sign in with MySeed ID, school edition portal build without the console.
- Provider install packages with per-school settings.
- Self-hosting kit: Compose file with license, relay, MySeed ID, Redis, optional ClamAV and `API_WORKERS`; install, backup, restore, upgrade and diagnostics scripts.
- Load-test script reporting p50, p95 and p99 per endpoint.
- One-time install codes and Connect discovery, install and client endpoints, the console MySeed integration page, `pnpm connect:code` and the local dev gateway. [Build status](../existing/07-build-status-and-gaps.md) section 7 describes this work under 16 October 2026; it was committed on 2026-11-11.
- Migrations `0005_connect_install`, `0006_platform_and_school_expansion` and `0007_dashboard_indexes`.

### Improved

- Dashboard figures counted in the database and shared per school for 30 seconds, cleared by live signals.
- Staff roles cached for 5 seconds per process; sessions still checked on every request.
- One API process per CPU with `API_WORKERS`; only the lead process syncs catalogs and holds the relay connection.
- Database connection pool cap for multi-process servers.
- Tests no longer depend on data left by earlier runs.

## 7. 2026-10-16: foundations

Commits `d364dee` to `3ce85a0`.

### New

- Workspace tooling, shared config and the specification documents.
- Shared packages: contracts, calendar, database schema and UI.
- API, worker and test suite.
- Staff portal, platform console and public site.
- Connect SDK: typed client and webhook verifier.
- Container images, Compose files, Caddy and CI.

### Improved

- Prettier applied to the whole tree and checked in CI; the format commit is skipped in blame (`70976b1`, `b120b27`).
- LF line endings kept; Turborepo agent file turned off (`bd053ee`).

### Fixed

- Replication of school data into MySeed removed: change feed, snapshots, contract schemas and integration views dropped (migration `0004_drop_integration_views`, `2a9632f`).
- CORS rule for school subdomains that never matched; production start refused with development secrets (recorded in build status section 6).

## 8. 2026-10-13: initial commit

Commit `f67f9cb`, the only commit on `origin/main`.
