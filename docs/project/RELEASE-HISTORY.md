# Release history

What has shipped in Myseed Ops, newest first, grouped the way the work was planned (the roadmap's phases and the named updates). Dates are when the work was committed; production follows `main`. The detail of each phase is in the [roadmap](../ROADMAP.md); each release made in Dev team, Releases and quality has its own notes.

## Documentation and specs (Phase 46), 23 November 2026

**New**
- Specs and docs shows every document as a formatted company document: the logo and name, the document control table (reference, version and status, owner, project, dates, reviewers, source), contents, and styled headings, tables, checklists, code, callouts, requirement IDs and priorities.
- Three ways to view a document: Formatted, Markdown, and Side by side on wide screens.
- The project's documentation (this set) appears in the Dev team library and follows the repository on every deploy: the Dev team handbook (rule book, operating guide, onboarding, specs guide, release and incident guide) and the project documents (index, overview, requirements, design, decisions, test plan, this history, the progress report), with the existing runbooks and plans.
- `npm run docs:sync` brings them in on a developer's computer.

**Improved**
- Imported Markdown is stored exactly as the file, and names itself from its title; Word imports keep tables, bold, italic, links and nested lists; web pages keep tables, code and links.
- PDF (print) and HTML exports use the same company format, with a cover page, contents and page numbers; Word exports gain the header with the logo, the document control table, quotes, checklists, links and page numbers.
- Documents can be up to 1,000,000 characters, and a longer one is refused rather than cut.

## Seed Town and the arcade (Phases 42 to 45), 20 to 21 November 2026

**New**
- Seed Town becomes a city: districts, streets with traffic, houses with interiors, weather and a day cycle, town folk with lives and conversations, real car physics, a Grand Prix with three circuits, archery, Seed Strike and Seed Core (five against five with six original agents), five-a-side football against bots.
- Real licensed cars and trees (CC BY), with credits in the Admin asset library.
- The guest arcade (`/arcade`) for visitors without an account, a locked Windows arcade kiosk and an Android arcade app.
- The Windows app (launcher, graphics presets, diagnostics, automatic updates) and Seed Town Offline (the site and games with their own database, no account, no internet).

**Improved**
- Frame rate: merged and culled meshes, distance-based detail, an adaptive resolution that holds the frame cap.

## Production and admin changes (Phase 44), 20 November 2026

**New**
- Redo status for work sent back, everywhere.
- Roles and permissions as a View, Edit, Delete, Update grid per area.
- The Assistant Manager role; the recording team overview on members' Home.

## UI styles and Fun mode (Phases 40 and 41), 20 November 2026

**New**
- Seven UI styles with their own effects and sidebars; Fun mode with points from work, music, games, a pet and focus mode; games in chat; Myseed Fun as an installable app; 15 more presentation templates.

**Fixed**
- No emojis anywhere in the product; a test now enforces it.

## Support, Noor and operations hardening, 18 to 20 November 2026

**New**
- Support desk laid out like Team chat; customers rate the agent; Telegram help buttons open real answers; the support app on the web with Telegram sign-in or a guest.
- Noor admin pages through Noor's own forms; the academic content manager with batch imports; Noor parents and students matched by phone.
- External API console per provider; SMS console with parts, cost and delivery tracking.
- The assistant's autopilot: it opens pages and presses buttons itself, stopping before typing and risky steps.

**Improved**
- Noor protection: every Noor request gated and paced; live Noor only for Admin and granted people.
- Operations: a watchdog restarts a stuck app; a health check and memory cap; the database protected from running out of memory.

## Update 1.2, 17 to 18 November 2026

**New**
- Chapa sync that fetches every page and date window, a Chapa transactions screen and a reconciliation hub.
- Noor complete collection with a field registry, filtering and table customisation.
- Support content manager and Telegram bot completion; support chat at team-chat level; Customer Support Requests with approvals.
- Calling with one call lifecycle, an IVR with a drag-and-drop builder, queues and call records; ten new permissions; reports and help.

**Fixed**
- Next.js upgraded from 16.4.3 to 16.4.6 for a security advisory.

## Department data managers and the Dev studio's sprints, 16 November 2026

**New**
- Data managers for Dev, Marketing, Studio, HR and Finance; Dev import templates.
- Department heads can submit documents for their own review.

## Update 1.1, 13 to 14 November 2026

**New**
- Connected systems with per-system channels, Telegram bots, signed webhooks and customer sync (phase 11).
- Live chat with typing, read receipts, presence, files and voice notes (phase 12).
- Telegram bot manager with scheduled sends, forms and surveys (phase 13).
- Call center: mute, hold, conference, warm and cold transfer, call-backs (phase 14).
- Knowledge base with how-to guides and checked YouTube videos (phase 15).
- Live admin dashboard with the staff roster and desk numbers (phase 16).

## Update 1.0, 10 to 14 November 2026

**New**
- Sticky curriculum context, kiosk access, the profile PIN switch (phase 1).
- Date-first Legacy CMS with live updates, invoice states and reports (phase 2).
- Chapa for every business, with payment follow-up to Support (phase 3).
- One help menu everywhere, routed to Support and Finance; the Telegram Mini App; a public help center (phase 4).
- Assistant v2 with role buttons, guided actions and Amharic (phase 5).
- My work for everyone, taking work under Admin's rules, import undo (phase 6).
- Integrations hub, call and call-back monitor, SMS routing, email setup and bounces, AI usage and cost (phase 7).
- Six colour themes, more fonts, a customisable Chapa overview (phase 8).

## Noor, Chapa and integrations, 6 to 9 November 2026

**New**
- The Legacy CMS: Noor's data read and mirrored, with sign-in, session checks, deep reading and exports.
- Chapa for several businesses; i-Conic SMS; several AI providers; email providers; Google sign-in.
- Kiosk pairing, a role creator, inter-department requests and a budget simulator.

## The platform grows (Phases 11 to 37), 31 October to 4 November 2026

**New**
- Departments as each person's sidebar and Profile tabs (11); department flows (12); the Dev studio with sprints, roadmap, specs and docs, releases, incidents and DORA (12b); the presentation studio (12c).
- The assistant (13 to 13d); the company inbox (14); foundations: sign-in policy, passkeys, scheduled jobs, backups, tests in CI, in-app errors (15).
- Myseed's own needs: presenters and fees, file places and link checks, publishing to the Myseed App, the Ethiopian calendar and Amharic, data protection (16).
- Performance management with KPIs, KRAs, scorecards and OKRs (17); announcements and Light mode (18).
- Customer support with queues, the SDK and browser calls (19, 20); attendance by hand, payroll for everyone and recognition (21).
- The assistant as an agent (22); the team analyzer and import helper (23); presentation templates (24); strategic planning, monitoring and evaluation (25); the document library (26); Office, Power BI and Notion (27); Admin platform pages (28); designed for phones (29).
- Handovers on Approvals, curriculum fixes, routines, the Legacy catalog, personal Settings, My work (30 to 36).
- The control panel deploys to a Hostinger VPS with auto deploy from GitHub (37).

## The first release (Phases 1 to 10b), 28 to 31 October 2026

**New**
- Admin data control, the editorial workflow with handovers and checklists, chat, email from the app (1 to 4).
- Departments (Dev, Studio, Marketing, Owners) with configurable statuses, views, dashboards and requests; calls with the app's own ringing; the native app shell's web part (5 to 5d).
- Overview, help and onboarding (6); HR (7); workspace polish, security and integrations (7b, 7c); Finance (8).
- Attendance at the kiosk, then face check-in (9); the open items in three batches (10); attendance by printed QR and the office network (10b).
