# MySeed Academy test plan

## 1. Scope

This plan covers the website, admin console and API as built at commit `31bd529`. It lists the tests that exist, how to run them, and the release test cases. The requirement IDs refer to the [SRS](SRS.md). The older device-lab plan in [existing test plan](../existing/docs/ops/06-test-plan-myseed-devices.md) was written for the learning app and does not match this repository.

## 2. Test levels and commands

| Level | What it covers | Command | Where it lives |
| --- | --- | --- | --- |
| Type check | All four TypeScript apps and packages | `npm run typecheck` (CI runs it per workspace: `npm run typecheck -w @myseed/ui`, `-w @myseed/api`, `-w @myseed/web`, `-w @myseed/admin`) | `tsconfig.json` in each workspace |
| API unit and integration suites | 16 suites run in order by a custom runner (Node `assert`, no test framework) | `npm test` (runs `tsx tests/runTests.ts` in `@myseed/api`) | `services/api/tests/*.test.ts` |
| Build | Production builds of website and console | `npm run build -w @myseed/web`, `npm run build -w @myseed/admin` | |
| End-to-end | Public site, locales, engagement flows, admin, platform | `npm run test:e2e` (Playwright, Chromium, 1 worker) | `tests/e2e/*.spec.ts` |
| Accessibility | axe-core WCAG 2.2 AA scans, light and dark | `npm run test:a11y -w @myseed/e2e` | `tests/e2e/a11y.spec.ts` |
| Responsive | No horizontal overflow at 320, 390, 768, 1280 and 1920 px | Part of `npm run test:e2e` | `tests/e2e/responsive.spec.ts` |
| Live integration tests | Credential checks, test checkouts, test emails, AI prompts, sample translations, S3 requests | Admin, Integrations, **Test** on each provider | `services/api/src/services/integration.tests.ts` |

The E2E suite needs the three apps running first. By default it targets `http://localhost:3000` and `http://localhost:3001`; set `WEB_URL` and `ADMIN_URL` to test other hosts.

### 2.1 API suites

| Suite | File |
| --- | --- |
| Vault (AES-256-GCM) | `vault.test.ts` |
| Auth (PBKDF2, signed tokens, RBAC) | `auth.test.ts` |
| Rate limiter | `rateLimiter.test.ts` |
| Translation fallback chain | `translation.test.ts` |
| Accessibility and localization rules | `accessibilityAudit.test.ts` |
| Database bootstrap and seed | `databaseSeed.test.ts` |
| Platform logic | `platform.test.ts` |
| Sponsorships, invoices and receipts | `sponsorship.test.ts` |
| Database history snapshots | `snapshot.test.ts` |
| Payments and site configuration | `payments.test.ts` |
| Section backgrounds, header, footer, brand | `pageStyles.test.ts` |
| Trash, data health and integrity | `dataTools.test.ts` |
| Finance exports, backups and clearing | `financeData.test.ts` |
| Media storage and subfolders | `media.test.ts` |
| Animations, block library and text changes | `motionBlocks.test.ts` |
| Billing periods and MySeed Verify | `verifyAndUnits.test.ts` |

## 3. Where tests run

| Place | What runs | Trigger |
| --- | --- | --- |
| Developer computer | Any of the commands above; the control panel's **Local app** page runs type check, API tests and builds | By hand |
| GitHub Actions (`.github/workflows/ci.yml`, `ubuntu-latest`, Node 20) | `npm ci`, Prisma generate, type check, `npm test`, start API in memory mode, build and start web and admin, Playwright Chromium, E2E and accessibility; uploads the Playwright report on failure | Every push and pull request to `main` |
| GitHub Actions (`uptime.yml`) | HTTP checks of the live website, admin and API | Every 30 minutes once `UPTIME_ENABLED` is `true` |
| Production | Built-in uptime monitors, `/healthz`, `/readyz` | Always |

## 4. What is faked

| Real thing | Fake used in tests |
| --- | --- |
| PostgreSQL | In-memory store (`MemoryClient`). CI has no database. Locally, tests that write data set the memory mode themselves; a local database that is reachable is used by read tests |
| Payment providers | Mock payment provider ("Test checkout"), only outside production |
| Email | Logged, not sent, when no email provider is set |
| Translation | Passthrough (English) when no key is set |
| AI assistant | FAQ matching only when no Anthropic key is set |
| Login rate limit | Raised with `AUTH_RATE_LIMIT_MAX` for test runs |
| Uptime monitors and MySeed Verify sync | Timers stopped with `UPTIME_MONITORING=off`; newsletter timer with `NEWSLETTER_SCHEDULER=off` |

## 5. Devices and networks

| Item | Covered by |
| --- | --- |
| Desktop Chrome | Playwright Chromium project |
| Phone, tablet and desktop widths | Responsive matrix (320 to 1920 px) and page builder previews |
| Firefox, Safari, Edge | Not automated. To confirm by hand before a release |
| Real Android phones common in Ethiopia | Not automated. To confirm by hand |
| Slow mobile networks | Not automated. To confirm with browser throttling |
| Right-to-left (Arabic) and Ethiopic script | Public E2E and axe scans in English, Amharic and Arabic |

## 6. Release test cases

"Auto" means an existing automated test covers the case. "Manual" means it must be checked by hand.

| ID | Case | Steps and expected result | Covers | Type |
| --- | --- | --- | --- | --- |
| TC-1 | Public pages | `/` redirects to a locale; every top-level page renders without runtime errors; unknown pages return 404; security headers present | FR-1, FR-5, FR-6, FR-51, NFR-3, NFR-9 | Auto (`public.spec.ts`), headers Manual |
| TC-2 | Languages | Amharic and Arabic set `lang` and `dir`; the switcher keeps the page; the EN and Amharic toggle remembers the choice; deep links offer but never force a language; Tier 2 interfaces are fully translated | FR-1, FR-2, FR-3, NFR-21 | Auto (`public.spec.ts`, `locale.spec.ts`) |
| TC-3 | Search and SEO | Command search finds content; sitemap, robots, hreflang and structured data are correct; `llms.txt` loads; Admin, SEO audit runs | FR-21, FR-48, FR-49, FR-50 | Auto (`public.spec.ts`), audit and `llms.txt` Manual |
| TC-4 | Assistant | Answers a known FAQ from the knowledge base; offers WhatsApp or Telegram handoff when unsure; the question appears in Admin, Assistant | FR-22, FR-23 | Auto (`engagement.spec.ts`), queue Manual |
| TC-5 | Content and translation | An editor publishes a bilingual article and it appears on the site; missing Amharic is refused; Tier 2 translation appears after save when a key is set; rich text is sanitised | FR-8, FR-9, FR-10, FR-11 | Auto (`admin.spec.ts`, `platform.spec.ts`), Tier 2 Manual |
| TC-6 | Page builder | Create a draft, drag a section on the live page into it, test it, apply it to the main site, restore the earlier version; drafts preview only with a token | FR-4, FR-12 | Auto (`platform.spec.ts`) |
| TC-7 | Inquiries | The contact form validates, then submits; the inquiry appears in Admin, Inquiries; an acknowledgement is sent | FR-17, FR-18 | Auto (`engagement.spec.ts`), email Manual |
| TC-8 | Newsletter | Subscribe without an account; the confirm email arrives; confirm; unsubscribe by link | FR-19, FR-20 | Auto for sign-up (`engagement.spec.ts`), email steps Manual |
| TC-9 | Donations and receipts | The donation flow reaches the confirmation page (test checkout); in production with live keys: a small Chapa payment, a bank transfer with proof, approval in Admin, Donations; the receipt arrives and passes `/receipts/verify`; an edited receipt fails | FR-32, FR-33, FR-35, FR-36, FR-37, FR-44 | Auto for test checkout (`engagement.spec.ts`), rest Manual |
| TC-10 | Accounts and roles | Unauthenticated visitors go to `/login`; custom roles can be created, restricted and deleted; SEO Manager and Developer see only their areas; Developer cannot reach donor records or secrets; every console page loads for a Super Admin; the change shows in the audit log | FR-25, FR-27, FR-28, FR-29, FR-30, NFR-5 | Auto (`admin.spec.ts`, `platform.spec.ts`), audit log Manual |
| TC-11 | Sponsorship applications | Screening gives a pass; documents upload; the application submits; status shows on `/get-sponsored/status`; a reviewer approves or waitlists; finance approves; the package and access code are given | FR-40, FR-41, FR-42, FR-43, NFR-10 | Manual (no automated test found) |
| TC-12 | Operations | Integrations validate, test live and apply at runtime; maintenance mode hides the site and brings it back; uptime monitors detect up and down; feature flags take effect; API usage records calls | FR-7, FR-52, FR-53, FR-54, FR-55, FR-57 | Auto (`platform.spec.ts`), flags and usage Manual |
| TC-13 | Responsive | No horizontal overflow at 320, 390, 768, 1280 and 1920 px | NFR-18 | Auto (`responsive.spec.ts`) |
| TC-14 | Accessibility | No serious axe violations on public pages in light and dark themes | NFR-19 | Auto (`a11y.spec.ts`) |
| TC-15 | Media | Folders, upload, search, move, usage and delete work; oversize and wrong-type files are refused | FR-14, NFR-6 | Auto (`platform.spec.ts`, `media.test.ts`) |
| TC-16 | Database fallback and recovery | With PostgreSQL stopped, `/readyz` reports memory and the site still serves; after a restore from `backup.sh` output, the data is back | NFR-12, DR-8 | Auto for fallback (CI runs in memory mode), restore Manual |
| TC-17 | Deploy and roll back | Deploy a release on the VPS; health checks pass; roll back and confirm the previous release serves | NFR-13 | Manual |

## 7. Entry and exit criteria

### 7.1 Entry

- [ ] The change is on a branch with a pull request to `main`, or committed for a control panel deploy.
- [ ] `npm ci` and `npm run db:generate` succeed.
- [ ] Any schema change has been tried with `npm run db:push` on a copy of the data.

### 7.2 Exit

- [ ] CI is green: type check, `npm test`, builds, E2E, accessibility.
- [ ] The manual cases that the change touches (TC-9, TC-11, TC-16, TC-17 and others marked Manual) are checked and noted.
- [ ] After deploy: `https://api.myseed.com.et/healthz` answers, `/readyz` reports `postgres`, and the site and console load.
- [ ] For email changes: a test email is sent from Admin, Integrations and confirmed as received.

## 8. Known gaps

- No automated tests for sponsorship applications (aid), bank transfer proof, MySeed Verify or Tina Verify flows end to end, or receipt verification in the browser.
- No accessibility scan of the admin console.
- Only Chromium is automated; no Firefox, Safari or real-device runs.
- No load or performance test, and no measured mobile performance budget.
- API tests use a custom runner with Node `assert`; there is no coverage report.
- No test of the VPS deploy, rollback or backup restore scripts.
- Provider integrations with live keys are tested only by hand from Admin, Integrations.
