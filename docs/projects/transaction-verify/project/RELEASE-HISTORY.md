# Transaction Verify release history

> [!NOTE]
> Built from `git log` at commit `3435810`. The repository has no release tags (no `v*` or `sdk-v*` tag), so changes are grouped by the day they were committed, newest first. The repository holds 88 commits from 10 to 20 November 2026. Which commit runs in production is not recorded in the repository (To confirm). Migration numbers show the database change that came with each day.

## 1. 20 November 2026

Commits `3b1144d` to `3435810`. Migrations 064 to 067.

### New

- 3D view mode: clean full screen, look around or walk with W A S D, camera shots, walkthrough video recording and live walk recording.
- 3D motion effects (spin, float, pulse, glow, pop, shake, swing, circle), turning car wheels, opening doors, windows and shutters, a path drawn on the floor, map navigation, a model loading screen and STL export.
- Path animation (a car driving a route) and a Car model.
- 3D studio starts empty, with placeable bulbs, spotlights and suns, and ready business scenes.
- Import of SketchUp (`.dae`), OBJ, FBX, STL and Sketchfab models; light sources can be dragged in the 3D view.
- 14 store UI styles with light and dark, a theme gallery, inventory filters, table and CSV import, media folders per store (migration 067), bot commands and a store map.
- Store design studio with AI, script mode, motion and 24 themes (migration 066).
- Scan QR on the Cashier page recognizes the payer's bank from the QR (migration 066, on by default).

### Improved

- Store builder grouped into tabs (Basics, Look, Selling, Telegram; theme settings Look, Layout, Shopping, About).
- Store builder preview shows the real store page with the unsaved design, scaled per device, with light and dark preview, reload, undo, redo and discard.
- Review details are shown first; banks were checked live.

### Fixed

- A relay that cannot fetch a bank page hands the job to another online relay (migration 064).
- CBE Birr's answer for an unknown receipt reads as not found instead of a failed check (migration 065).
- Terminal-style scanlines no longer cover the console; the store preview opens full screen.

## 2. 19 November 2026

Commits `6b9925d` to `b287873`. Migrations 058 to 063.

### New

- Each store's own Telegram bot connected with one token, with a Mini App (migration 058).
- MySeed shopper accounts, the MySeed Shop app, store templates and landing pages, vouchers, memberships and auctions (migration 059).
- Pay with Chapa, ratings and reviews, search filters, branch-aware stores, orders given to employees (migration 060).
- Store filters, item pages, theme settings, item galleries, followed stores, carts kept on the account (migration 061).
- "Verify with this phone" on the Cashier page (migration 063).

### Improved

- Bank of Abyssinia, Dashen, CBE and Chapa receipts checked against real receipts (migration 062).
- The Transaction ID box reads as you type; storefront themes and one-step Telegram setup.
- Password fields have a show and hide control.

## 3. 18 November 2026

Commits `a8b0cb8` to `cb61084`. Migrations 046 to 057.

### New

- Commerce: branches and purposes with details, transfer routes, counter QR stands, storefront stock, delivery, promotions and orders (migrations 049 to 051).
- Lookup network: relays for banks that answer only inside Ethiopia (migration 047); phone relays per organization and provider health checks (migration 053).
- Receipt drafts for every bank and wallet that has one (migration 048); Bank of Abyssinia's official slip lookup enabled (migration 046).
- Creative Studio with version history and brand kits (migrations 052, 053), studio pages and a pen tool.
- Native phone relay in the cashier Android app, and the relay extension for Chrome and Edge; relay jobs carry the receipt number (migration 055).
- AI providers for the Creative Studio with the organization's own key (migration 054), an AI connection page with live models and a three-step test (migration 057).
- Phone fallback for banks the server cannot reach.

### Improved

- Studio layout and touch on phones and tablets.

### Fixed

- A telebirr transfer to a bank is credited to the bank account on the receipt (migration 056).
- A bank down from the server is still reachable through an online relay.
- The platform owner can open Settings.

## 4. 16 November 2026

Commits `c162d8b` to `616d3da`. Migrations 037 to 045.

### New

- Web application front end and build system committed (`c162d8b`).
- Chapa public and secret key support, all Ethiopian banks wired, official vector logos (migration 037).
- Visual website builder, flyers and banners studio, AI financial analysis module.
- 3D animated ads studio for the platform admin, counter QR stands and storefront ordering (migration 038).
- Visual landing page editor with drafts, revisions and device visibility (migration 039).
- Creative Studio with a 3D timeline animation engine and a live 2D flyer canvas (migration 040).
- Visual storefront builder, industry categories, variants and Telegram Web App support (migration 041).
- telebirr Transfer to Bank receipts, base64 TLV QR extraction and cross-bank account matching (migration 042).
- Cashier console routes, database views and e2e tests; cashier amount ranges (migrations 043, 044).
- Ethio Telecom provider relay.

### Improved

- Live telebirr receipt verification (migrations 043, 045).

### Fixed

- Migration 038 uses a composite foreign key for payment requests.
- The exact checksum of migration 041 restored.

## 5. 15 November 2026

Commits `4d47b0c` and `6f5fe32`. Migration 036.

### Improved

- Mobile navigation, typography and tables aligned with the Apple Human Interface Guidelines.
- Successful checks show the same details as unsuccessful ones; payment pages show provider diagnostics (migration 036).
- Organization data reset and import controls on the Data page.

### Fixed

- Saving a Chapa, YaYa or ArifPay key no longer returns an error after the key was saved; the key and its audit record are written in one transaction (see the [verification audit](../existing/docs/verification-audit-2026-11-15.md)).
- Connector hardening: success-shaped HTTP errors, mismatched references, zero amounts and malformed responses are refused.

## 6. 14 November 2026

Commits `1994e64` to `c3a7973`. Migrations 031 to 035.

### New

- Support desk with response targets per package (migration 032).
- Onboarding conversion measures; Phase 14 (clean mobile experience) planned.
- Cashier Scan QR button; Phase 11 customer success playbook and launch texts.
- Single sign-on with OpenID Connect (migration 033).
- Automation rules that route work and never decide payments (migration 034).
- Reseller and referral partners (migration 035).

### Improved

- Cashier result in the iOS style; Already used shown apart from Not paid; Show details for every result except Paid.
- The payer is told when a typed number is not a reference for the chosen bank.

### Fixed

- Dashen accepts only its real 16-character reference (migration 031).

## 7. 13 November 2026

Commits `f5fd8e2` to `011d5a1`. Migrations 023 to 030.

### New

- Phase 9: payer and staff messages, editable templates, email preferences, payment and accountant exports with schedules (migration 023).
- Phase 10: organization roles and permissions, sealed receipt archive, recipient mismatch rejection, database maintenance tools, Chapa connector (migration 024).
- Phase 10 operations: alerts, metrics, nightly backups, restore drills, status page, key rotation (migration 025).
- Server errors with request IDs, pilot for Awash, Siinqee and Abay, bank logos, more database tools (migration 026).
- More banks in pilot, ArifPay and YaYa, and the organization lifecycle: create, edit, trash, restore, delete for good, pause service, clear all (migrations 027, 028).
- Cashier: scan a receipt without a bill number or amount.
- User deletion, cashier receipt upload, mobile bank selector with logos (migration 029); real bank and wallet logos (migration 030); platform logos page.

### Improved

- Every bank draft tested against errors, empty pages, dropped connections and lookalike links.

### Fixed

- Restore of tables with identity columns; pool error during restore drill teardown.
- Control panel retries a file replace on a transient Windows file lock.
- `method_templates` update without an `updated_at` column; migration 029 `refresh_method_draft`; atomic copy in `deploy.sh`.
- `METRICS_TOKEN` kept in `env.sh`; duplicate `DELETE /staff/:id` route removed; CBE receipt links.

## 8. 12 November 2026

Commits `1663e45` to `d6e3006`. Migrations 017 to 022.

### New

- Cashier page with branch-bound employees; cashier terminals, per-organization install, Not sent queue, update notice, push categories (Phase 4, migration 017).
- Escalation of overdue review cases and home page cards per person (Phase 5, migration 018).
- Business verification checklist before approval; platform admin guide (Phase 6, migration 019).
- VAT and gap-free invoice numbers, add-ons and discounts, invoices paid through MySeed Verify, billing and provider fee ledgers (Phase 7, migration 020).
- Developer platform: sandbox webhooks per environment, test payments, batch intake, embeddable payment component, React Native adapter, publishable SDKs, quickstart and deprecation rules (Phase 8, migration 022).

### Improved

- Bank and wallet definitions from real receipt layouts; Siinqee and Abay Bank added (migration 021).
- Dashboards list only wired and configurable channels.
- Amharic interface moved to Phase 13.

## 9. 11 November 2026

Commits `f32c4f8` to `58b5ce9`. Migrations 008 to 016.

### New

- Console redesign: work-management layout, views, appearance and branding (migration 008).
- Kalon platform: web app, sign-up, platform admin, dedicated installs with licenses (migration 009).
- MySeed Verify v5 SaaS core across roadmap phases 0 to 12 (migration 010).
- Landing page and website managed by the platform admin; Phase 3 receipt reading (migration 011).
- Sandbox isolation, live scan on every phone, phone tab bar, setup guide (migration 012).
- Row-level security as a second wall between organizations (migration 013).
- The MySeed Verify team as its own platform organization with nine platform roles (migration 014).
- Passkeys, optional two-step, remembered devices, team user management, clean start (migration 015).
- Banks connected by data: official receipt link connector, draft definitions, live check, circuit breaker (migration 016).

### Improved

- On phones, tables become labelled cards and no console page is wider than the screen.

## 10. 10 November 2026

Commits `6d3bbb3` to `b84291e`. Migrations 001 to 007.

### New

- Initial project structure: API, worker, hosted page and control panel; migrations 001 to 003 (core model, upload reservations and idempotency, delivery history and extraction status).
- Phases 2 and 3: VPS deploy, organization settings and the 43-channel catalog (migration 004), staff console with review (migration 005), refunds, reversals and push (migration 006), frozen recipients per request (migration 007).
- README and repository setup.
