# Transaction Verify test plan

> [!NOTE]
> Written from the test suites, `package.json` scripts and `.github/workflows/ci.yml` at commit `3435810` (20 November 2026). Requirement IDs (FR, NFR) refer to the [SRS](SRS.md). Case counts are the number of `test(` calls found in each file.

## 1. Test levels and commands

| Level | What it covers | Command | At this commit |
| --- | --- | --- | --- |
| No-emoji scan | Every tracked file | `npm run check:emoji` | 1 script |
| Build | Every workspace compiles (TypeScript, esbuild bundles) | `npm run build` | 16 workspaces |
| Contract types | Generated types match `contracts/openapi.v1.json` | `npm run generate:contract && git diff --exit-code -- packages/contracts/src/generated` | CI step |
| Unit and package tests | Domain, contracts, messages, UI, storage, evidence, connectors, persistence, SDKs, API, worker, hosted page, web build | `npm test` (Node test runner, `node --test test/*.test.mjs` per workspace) | 32 files, 174 cases |
| End-to-end tests | Full journeys on a real PostgreSQL 17 with API, workers, console and a webhook receiver in one process | `npm run test:e2e` (`node --test --test-concurrency=1 tests/e2e/*.test.mjs`) | 43 files, 180 cases |
| Full check | No-emoji, build, unit and end-to-end | `npm run check` | all of the above |
| SDK packaging | The SDKs publish without private packages | `npm run sdk:check` | 1 script |
| Database model | Core SQL functions with synthetic fixtures, rolled back | `psql -X -v ON_ERROR_STOP=1 "<DATABASE_URL>" -f database/verify_model.sql` | 1 script |
| Control panel | Python control panel | `npm run test:panel` (`python -m unittest discover -s control-panel/tests`) | 1 file, 11 cases |
| Deploy scripts | Shell syntax | `for f in deploy/vps/*.sh; do bash -n "$f"; done` | 5 scripts |
| Image | The image starts the API, answers `/health` and `/pay/`, has Tesseract languages | CI job `image` (`docker build`, `docker run`) | 1 job |
| Compose file | `deploy/vps/docker-compose.yml` is valid | `docker compose ... config --quiet` | CI step |
| Browser fixtures | Console pages at 320, 390 and 1280 pixels in Chromium | `node apps/web/test/accounts-data.browser.mjs`, `node apps/web/test/admin-reference.browser.mjs` (needs Playwright; `PLAYWRIGHT_PATH` or `BROWSER_PATH`) | 2 files, run by hand |
| Native OCR | Tesseract reads the synthetic receipt | `OCR_NATIVE_TEST=1 npm test -w packages/evidence` | part of unit tests |

### 1.1 Unit and package suites

| Workspace | Files | Cases |
| --- | --- | --- |
| `packages/provider-connectors` | 10 | 62 |
| `apps/api` | 5 | 26 |
| `packages/domain` | 1 | 8 |
| `packages/messages` | 1 | 8 |
| `packages/ui` | 1 | 7 |
| `packages/evidence` | 2 | 11 |
| `packages/persistence` | 1 | 6 |
| `apps/web` | 3 | 11 |
| `apps/hosted` | 1 | 5 |
| `apps/worker` | 1 | 5 |
| `packages/sdk-server`, `sdk-web`, `sdk-mobile`, `sdk-myseed` | 4 | 17 |
| `packages/contracts` | 1 | 4 |
| `packages/storage` | 1 | 4 |

## 2. Where tests run

| Where | What runs | Database |
| --- | --- | --- |
| Local computer | Any command above; the control panel's Local system page runs build, unit, e2e, full check and migrations as jobs | Embedded PostgreSQL 17 in a temporary folder for e2e; `npm run db:start` serves `data/pg` for development |
| GitHub Actions `CI` (`.github/workflows/ci.yml`) | On every push to `main` and every pull request: job `check` (contract types, `npm run check`, `npm run sdk:check`, `verify_model.sql`, panel tests, deploy script syntax) and job `image` (build and smoke the image, validate compose) | Service container `postgres:17`; `DATABASE_URL_TEST` and `E2E_DATABASE_URL` point at it |
| Before a push from the control panel | No-emoji check | none |
| Release tags | `publish-sdks.yml` runs the SDK tests and `sdk:check` before publishing; `release.yml` builds the image | none |

> [!NOTE]
> The e2e harness creates and drops its own database. With `E2E_DATABASE_URL` set it uses that server; without it, it starts an embedded PostgreSQL 17. The persistence package's external-database test is skipped without `DATABASE_URL_TEST`.

## 3. What is faked

| Real dependency | Stand-in in tests |
| --- | --- |
| Banks and wallets | The synthetic sandbox bank (`packages/provider-connectors/src/synthetic.ts`) with references such as `SYN-1000`, `SYN-0800`, `SYN-WRONG`, `SYN-NORCPT`, `SYN-PEND`, `SYN-DOWN`, `SYN-SLOW`; recorded receipt pages and fixtures in `packages/provider-connectors/test` and `tests/e2e/fixtures` |
| Official receipt pages | `linkFetch` returns 503 "no network in tests" unless a test passes its own fake (`tests/e2e/harness.mjs`) |
| Chapa, ArifPay, YaYa | Fake fetch functions (`merchantFetch`, `chapaFetch`) |
| Email and SMS | Recording transports passed by the harness |
| Web Push | Keys made by the deployment; sending is exercised with fakes |
| Webhook receiver | An in-process receiver in the harness |
| Relays | Simulated relay agents in `tests/e2e/telebirr-relay.test.mjs`, `relay-receipt-tags.test.mjs`, `phone-relay-health.test.mjs` |
| AI providers | Fake provider responses in `tests/e2e/creative-ai.test.mjs` and `store-design-ai.test.mjs` |
| Telegram | Fake Bot API in `tests/e2e/storefront-telegram.test.mjs` |
| Time | Injected `now()` in API and worker |
| OCR | Native Tesseract only with `OCR_NATIVE_TEST=1`; otherwise a stub |

## 4. Devices and networks

| Item | State |
| --- | --- |
| Desktop browsers | Chromium through the browser fixtures (by hand) |
| Phone widths | 320 and 390 pixels in the browser fixtures |
| Real Android and iOS phones | Not found in the repository. Real-device checks of the hosted page, console and cashier are listed as open in `docs/roadmap.md` |
| Cashier Android app | Built with Gradle; no automated tests found |
| MySeed Shop Android app | Built with Gradle; no automated tests found |
| Relay extension | No automated tests found |
| Ethiopian networks | Live bank checks depend on networks inside Ethiopia; no network test is automated |
| Slow connections | No throttled-network test found |

## 5. Release test cases

Run these on a staging or sandbox deployment before a release, after `npm run check` passes. Cases marked "automated" have an e2e test that covers the main path.

| ID | Case | Steps | Expected result | Covers | Automated |
| --- | --- | --- | --- | --- | --- |
| TC-1 | Create a request and pay in the sandbox | Create a request with a test key; open `/pay/`; submit `SYN-1000` | Accepted; one signed `payment.accepted` webhook | FR-1, FR-2, FR-4, FR-14, FR-15, FR-24 | `flow.test.mjs`, `quickstart.test.mjs` |
| TC-2 | Repeat submission and redelivery | Submit the same evidence twice; redeliver the webhook | One acceptance; the receiver applies one business action | FR-7, FR-15, FR-24 | `flow.test.mjs` |
| TC-3 | Wrong amount, wrong account, no recipient | Submit `SYN-0800`, `SYN-WRONG`, `SYN-NORCPT` | Refused for amount; `recipient_mismatch`; review | FR-15, FR-16 | `flow.test.mjs`, `verification.test.mjs` |
| TC-4 | Provider pending and down | Submit `SYN-PEND` and `SYN-DOWN` | Retries on schedule, then review | FR-17, FR-20 | `flow.test.mjs` |
| TC-5 | Same transfer on two bills | Pay two bills with one reference at two cashiers | One Paid, one Already used | FR-15, FR-46 | `cashier.test.mjs`, `cashier-scan.test.mjs` |
| TC-6 | Token scope and expiry | Use a token on another request; wait past expiry; renew | Refused, refused, new token works | FR-2 | `flow.test.mjs`, `apps/api/test/api.test.mjs` |
| TC-7 | Upload limits | Upload a file over `MAX_UPLOAD_MB` and a renamed non-image | Both refused | FR-3, NFR-6 | `flow.test.mjs` |
| TC-8 | Rate limit | Send 11 submissions in a minute to one request | The 11th gets 429 | FR-9 | `flow.test.mjs` |
| TC-9 | Batch intake | Send 100 items, then repeat with the same key | Per-item results; the same batch | FR-6 | `developer.test.mjs` |
| TC-10 | Sandbox isolation | Use a synthetic reference on a live request | Not confirmed; no usage counted | FR-18, DR-9 | `sandbox.test.mjs` |
| TC-11 | Review decision | Decide a review case with evidence | Acceptance through `accept_payment`; audit row | FR-31, FR-40 | `console.test.mjs`, `payments-reviews.test.mjs` |
| TC-12 | Escalation | Leave a case past its due time | One escalation, one notice without names or amounts | FR-32, NFR-10 | `escalation.test.mjs` |
| TC-13 | Receiving account approval | Propose an account; try to approve it yourself; approve as a second admin | Self-approval refused; second approval works | FR-33 | `console.test.mjs` |
| TC-14 | Refund | Refund part of a payment; try to refund more than remains | First works and emits `payment.adjusted`; second refused | FR-26, FR-35 | `money.test.mjs` |
| TC-15 | Cashier terminal | Make a terminal; sign in as a cashier; idle 15 minutes | Cashier pages only; signed out | FR-44 | `terminal.test.mjs` |
| TC-16 | Not sent queue | Turn the network off on the cashier; check a receipt; reconnect | Shows Not sent; sent once after reconnecting | FR-45 | By hand |
| TC-17 | Roles and branches | Make a custom role; limit a person to a branch; try to grant a missing permission | Branch-only data; grant refused | FR-49 | `admin-tools.test.mjs`, `console.test.mjs` |
| TC-18 | Sign-in security | Sign in with a passkey; with password and two-step; reset password | Works; remembered devices forgotten after reset | FR-50 | `security.test.mjs` |
| TC-19 | Single sign-on | Connect an OIDC provider; sign in a known and an unknown email | Known signs in; unknown refused | FR-51 | `sso.test.mjs` |
| TC-20 | Organization isolation | Read another organization's payment with a key and a session | Refused | NFR-1 | `saas.test.mjs`, `security.test.mjs` |
| TC-21 | Sign-up and approval | Sign up; approve with a missing verification check | Approval refused until every check is done | FR-59 | `saas.test.mjs`, `platform.test.mjs` |
| TC-22 | Organization lifecycle | Pause, trash, restore and purge an organization | 403 `service_paused`; restore works; purge leaves a record | FR-60, DR-10 | `organizations.test.mjs` |
| TC-23 | Billing | Make an invoice with an add-on, discount and VAT; pay it through MySeed Verify | Gap-free number; marked paid by the worker | FR-62, DR-8 | `billing.test.mjs` |
| TC-24 | Messages | Trigger a payer email and SMS; fail the transport | Sent from the outbox; retried; marked not delivered at the end | FR-55 | `messages.test.mjs` |
| TC-25 | Exports | Export payments with a refund and a formula-like cell | Negative refund row; cell written as text; link expires | FR-56, DR-12 | Partly: `messages.test.mjs` reads the export; check formula cells by hand |
| TC-26 | Operations | Stop the worker; make the backup old; run a restore drill | Alerts open once; drill signed off; live database untouched | FR-70, FR-71, NFR-14 | `operations.test.mjs` |
| TC-27 | Relays | Fetch a telebirr page through a relay; send a page with another receipt number | Read; refused | FR-21 | `telebirr-relay.test.mjs`, `relay-receipt-tags.test.mjs` |
| TC-28 | Bank templates | Run every draft against errors, empty pages, dropped connections and lookalike hosts | Never a payment from a failure | FR-19, NFR-4 | `packages/provider-connectors/test/every-bank.test.mjs` |
| TC-29 | Live bank receipt | In Live check, read a real receipt of a method in pilot | Observation recorded; payment goes to review with `provider_pilot` | FR-19 | By hand on production |
| TC-30 | Storefront order | Order an item, pay, confirm stock | Stock taken once; order lifecycle works | FR-81, FR-82 | `commerce.test.mjs` |
| TC-31 | Shopper and marketplace | Sign up as a shopper; follow a store; review without a paid order | Review refused | FR-86, FR-87, FR-89 | `shop.test.mjs`, `store-browse.test.mjs` |
| TC-32 | Telegram store bot | Connect a bot; call the webhook without the secret | Connected; call refused | FR-85 | `storefront-telegram.test.mjs` |
| TC-33 | Creative Studio and AI | Save versions; connect an AI key; run a task | Versions restore; key never in the browser; run logged | FR-90, FR-92 | `creative.test.mjs`, `creative-ai.test.mjs` |
| TC-34 | Phone layout | Open every console page at 360 pixels on a mid-range Android phone | No sideways scrolling; nothing behind the tab bar | NFR-18, NFR-19 | Partly (browser fixtures) |
| TC-35 | Language and calendar | Switch calendar modes; view a date in Pagume | Correct Ethiopian date | NFR-20 | `messages.test.mjs` |
| TC-36 | Deploy and roll back | Deploy a release on staging; run `deploy.sh --rollback` | `/health` answers on both | NFR-15 | By hand |
| TC-37 | Monitoring endpoints | Call `/metrics` without and with the token; stop the database and call `/ready` | 401 then text; 503 | FR-69 | Partly: `apps/api/test/api.test.mjs` checks `/ready`; check `/metrics` by hand |
| TC-38 | No emoji | Run the scan | Passes | NFR-21 | CI |

## 6. Entry and exit criteria

### 6.1 Entry criteria

- [ ] `npm ci` and `npm run build` succeed on Node 24.
- [ ] Migrations apply cleanly to an empty PostgreSQL 17 database (`npm run db:migrate`).
- [ ] The CI workflow is green on the commit under test.
- [ ] A sandbox organization exists (`npm run sandbox:seed`) for by-hand cases.

### 6.2 Exit criteria

- [ ] `npm run check`, `npm run sdk:check`, `npm run test:panel` and `verify_model.sql` pass.
- [ ] All automated release cases pass; by-hand cases TC-16, TC-29, TC-34 and TC-36 are recorded with their result.
- [ ] No wrong accept in any test (the master roadmap measure that must stay at zero).
- [ ] Any new migration was applied to a copy of production data and re-running migrations reports nothing to apply.
- [ ] No open alert on the target deployment before switching traffic.

## 7. Known gaps

- [ ] No real bank or wallet receipt is part of the automated suites beyond recorded fixtures. The audit of 15 November 2026 states that results are fixture and integration results, not live certification.
- [ ] Browser fixtures need Playwright, which is not a dependency, and they are not run by `npm test` or CI.
- [ ] No automated tests for the two Android apps or the relay extension.
- [ ] No real-device matrix for Android and iOS.
- [ ] No load or concurrency benchmark (queue age by organization, OCR saturation, provider concurrency) as described in the demo inventory of `docs/roadmap.md`.
- [ ] No penetration test report.
- [ ] No test for the package `apiRequestsPerMinute` limit, which does not appear to be enforced (see [SRS](SRS.md) FR-9).
- [ ] No staging deployment is described in the repository; by-hand release cases have no fixed place to run.
- [ ] The Creative Studio's 3D features (model import, walk mode, video recording) have no automated tests beyond `design-builder.test.mjs`.
