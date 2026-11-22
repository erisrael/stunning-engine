# Transaction Verify progress report

> [!NOTE]
> Progress as of 23 November 2026, written from the code and git history at commit `3435810` (last commit 20 November 2026). Phase numbers follow the [master roadmap v5](../existing/docs/master-roadmap-v5.md) (phases 0 to 12) plus Phase 13 (Amharic) and Phase 14 (clean mobile experience). "Built" means the code and automated tests exist; "Done" means built and its exit gate is met.

## 1. Summary

| Item | State |
| --- | --- |
| What is built | Verification API (13 operations), hosted payment page, workers (extract, OCR, provider, outbox and the scheduled tasks listed in the architecture), staff console, cashier, platform admin, billing, developer platform with SDKs, messages and exports, operations tooling, SSO with OpenID Connect, automation rules, partners, dedicated installs, lookup network with relays, storefront and shopper marketplace, Creative Studio, two Android shells, a relay browser extension, the control panel |
| What is open | Certification of every bank and wallet with real receipts; Phase 11 exit gate; Phase 12 (SAML, dedicated database per organization, custom domains and white label); Phase 13 (Amharic); Phase 14 (clean mobile, in progress); npm publication of the SDKs; real-device checks; penetration test; first signed-off restore drill on the VPS |
| Database | PostgreSQL 17, 67 migrations (`001` to `067`) |
| Test suites | 32 unit and package test files (174 cases); 43 end-to-end files (180 cases) on a real PostgreSQL 17; control panel tests (11 cases); database model check; 2 browser fixtures run by hand |
| CI | GitHub Actions `CI` on every push to `main` and pull request: full check, SDK check, model check, panel tests, image build and smoke test |
| Where production runs | Hostinger VPS shared with myseed.com.et, at `https://transactionverify.myseed.com.et` (containers `tv-api`, `tv-worker`, `tv-postgres`). Code comments mention production use in November 2026 (migration 064); the commit running there is not recorded (To confirm) |
| Commits | 88 on `main`, from 10 to 20 November 2026; no tags |
| Contributors | 1 (Kidus Sebsibe, 88 commits) |
| Last commit | `3435810`, 20 November 2026 |

## 2. Status by area

| Area | Phase | State | Still open |
| --- | --- | --- | --- |
| Foundations: workspace, migration runner, storage, reason catalog, contract, synthetic provider | 0 | Done | OpenAPI lint; Myseed receiving account list and coverage register entries (from `docs/roadmap.md`) |
| Tenant core: organizations, sandbox isolation, tenant wall, platform organization | 1 | Built | Isolation tests on every release (in CI through e2e) |
| Method registry and connector framework: templates, link connector, drafts for 39 banks and wallets, Chapa, ArifPay, YaYa, circuit breaker, provider health | 2 | Built | Certify each method with real receipts and switch its connector on; most methods are drafts or pilots |
| Receipt intelligence: QR, PDF text, OCR, readings | 3 | Built | Fixtures from real receipts per method |
| PWA surfaces: hosted page, cashier, terminals, per-organization install, Not sent queue, push | 4 | Built | Real-device checks on Android and iOS |
| Console, review and cases: escalation, home cards, saved views, assignments, comments, notifications, bulk review | 5 | Built | `docs/roadmap.md` still lists saved views, assignments, comments, notification center and bulk actions as "Next" although routes exist; to confirm what is left (column choice, keyboard navigation) |
| Platform admin and packages: business verification, approval, packages, entitlements, flags, organization lifecycle | 6 | Built | None recorded |
| Billing: VAT, gap-free invoices, add-ons, discounts, paying through MySeed Verify, ledgers | 7 | Built | VAT rate, seller TIN and invoice account to be set by finance |
| Developer platform: keys, webhooks per environment, test payments, batches, SDKs, deprecation rules | 8 | Built | npm scope and first `sdk-v*` publication; React Native device tests |
| Notifications, reports and reconciliation: email, SMS, templates, exports, schedules | 9 | Built | SMTP and SMS credentials on the server (To confirm) |
| Data lifecycle, security and operations: roles, archive, retention, database tools, alerts, metrics, backups, drills, status page, key rotation | 10 | Built | First restore drill on the VPS; outside monitor; legal confirmation of retention; penetration test |
| Public launch: pricing, coverage, changelog, support desk, onboarding measures, playbook, launch texts | 11 | Built | Send the launch announcements; exit gate: three outside organizations live without help |
| Scale and tiers | 12 | In progress | Built: OIDC single sign-on, automation rules, partners, dedicated installs with licenses. Open: SAML, dedicated database per organization (exit gate), custom domains and white label, usage-based pricing options |
| Amharic interface | 13 | Not started | Amharic catalog exists as a draft for reason codes, states and the hosted page; the console is English only |
| Clean mobile experience | 14 | In progress | Built: Scan QR first, iOS-style cashier result, Apple HIG alignment of navigation and tables. Open: phone audit of every screen, lists instead of wide tables everywhere, role-based tabs, exit gate with five tasks |
| Lookup network and relays (outside the phase plan) | - | Built | Depends on shop devices being online for banks reachable only inside Ethiopia |
| Storefront, shopper marketplace, Telegram bots (outside the phase plan) | - | Built | Scope and owner to confirm; no product requirement document in the repository before the code |
| Creative Studio and website builder (outside the phase plan) | - | Built | `docs/creative-studio/roadmap.md` lists eight further phases |

## 3. Built but not yet checked on the live system

- [ ] Live acceptance through any certified bank or wallet. The audit of 15 November 2026 states that connector results are fixture and integration results, not live certification. Commit `b287873` says Bank of Abyssinia, Dashen, CBE and Chapa receipts were checked "for real"; whether any of them is certified and switched on in production is To confirm.
- [ ] Chapa, ArifPay and YaYa with an organization's own live key.
- [ ] telebirr and other inside-Ethiopia lookups through a phone relay and the browser extension on real shop devices.
- [ ] Email and SMS delivery from the VPS.
- [ ] Web Push on real phones.
- [ ] Nightly backup and restore drill on the VPS, signed off by a platform operator.
- [ ] Outside monitoring of `/health` and `/ready`.
- [ ] Single sign-on with a real identity provider.
- [ ] Telegram store bots with a real bot token.
- [ ] Google shopper sign-in with real OAuth credentials.
- [ ] Dedicated install from a published image and license (no `v*` tag yet).
- [ ] The two Android APKs and the relay extension on real devices.
- [ ] Phone audit at 360 pixels on a mid-range Android phone (Phase 14).

## 4. Risks

| Risk | Level | Why | Response |
| --- | --- | --- | --- |
| Secrets committed to the repository | High | `scratch/fix_env.py` holds server settings that look like real production secrets; `scratch/check_db.py` holds the server address | Rotate the values, remove the files and clean git history; see [working on it](WORKING-ON-IT.md) |
| Uncertified bank coverage | High | Most methods are drafts or pilots, so most payments end in staff review | Collect real receipts per method in Live check; certify in order of the organizations' actual accounts |
| Receipt formats change | High | Official receipt pages change without notice (several fix migrations in November 2026) | Provider health checks, template versions, fixtures from real receipts |
| Scope growth | High | Storefront, marketplace and Creative Studio were added beyond the master roadmap in five days, while launch gates are still open | Decide scope and owners; keep gates unchanged (master roadmap section 6) |
| Single person | High | One contributor holds the code, the deploy key and the control panel settings | Name phase owners; document access; give a second person deploy rights |
| Single shared server | Medium | Transaction Verify shares the VPS and Caddy with myseed.com.et | Capacity plan; outside monitor; consider moving off the shared server |
| Deploys outside CI | Medium | The control panel deploys the local last commit; CI is not required to pass first | Push and wait for CI before deploying; consider a CI deploy job |
| Banks reachable only inside Ethiopia | Medium | Lookups depend on shop devices as relays while the server is abroad | Keep relays online; consider hosting inside Ethiopia (`server_location` setting) |
| Package rate limit not enforced | Low | `apiRequestsPerMinute` is stored but no API check uses it | Confirm the intent and add the check or remove the field |
| Large page files | Low | `apps/web/src/pages/design-builder.tsx` has 6,455 lines | Split as planned in the Creative Studio roadmap |
| Legal retention period not confirmed | Medium | Evidence retention default is 5 years | Confirm with legal counsel (decision 57) |

## 5. Recommended order for what is next

1. **Remove and rotate the committed secrets** in `scratch/`, and check whether the GitHub repository is public. Nothing blocks this.
2. **Record what production runs**: the deployed commit, applied migrations, and which methods are pilot, certified or switched on. Blocked only by access to the VPS.
3. **Run and sign off the first restore drill** on the VPS and set up an outside monitor for `/health` and `/ready`.
4. **Certify the first methods** used by MySeed Academy's own receiving accounts (CBE, telebirr, Bank of Abyssinia, Dashen, Chapa) with real receipts in Live check. Blocked by real receipts and, for Chapa, the organization's live key.
5. **Set the finance and messaging settings**: VAT rate, seller TIN, invoice account, SMTP and SMS credentials. Blocked by finance decisions and provider accounts.
6. **Decide the scope and owner** of the storefront, marketplace and Creative Studio modules, and record it in the decision log.
7. **Meet the Phase 11 exit gate** with three outside organizations onboarding without help. Blocked by 4 and 5.
8. **Real-device checks and the Phase 14 phone audit**, then the penetration test before the first paying organizations.
9. **Publish the SDKs** after registering the npm scope and adding `NPM_TOKEN`.
10. **Phase 12 remainder** (dedicated database per organization, SAML, custom domains), then **Phase 13** (Amharic, with MySeed's review of every text).

## 6. To confirm

Items this export could not settle from the repository.

- [ ] Which commit and which migrations run in production, and since when.
- [ ] Which bank and wallet methods are certified, in pilot or switched on in the production database.
- [ ] Whether the GitHub repository is public (it decides how exposed the `scratch/` secrets are).
- [ ] Whether SMTP and SMS credentials are set on the VPS.
- [ ] Whether a restore drill has been run and signed off on the VPS.
- [ ] Whether an outside monitor watches `/health` and `/ready`.
- [ ] Whether the package `apiRequestsPerMinute` limit should be enforced on API calls.
- [ ] Whether the hosted page's language choice in `localStorage` is an intended exception to the no-browser-storage rule.
- [ ] Performance targets for admission, time to decision and throughput.
- [ ] Scope and owners of the storefront, marketplace and Creative Studio modules.
- [ ] Phase owners (the master roadmap asks for one per phase; none are named).
- [ ] Which project rules already exist in the Myseed Dev team rule book.
- [ ] `scratch/check_db.py` uses a compose path, service name and database user that differ from `deploy/vps/docker-compose.yml`; which layout the server really has.
- [ ] The library project name: "Transaction Verify" (repository and package name) or "MySeed Verify" (the name users see).
