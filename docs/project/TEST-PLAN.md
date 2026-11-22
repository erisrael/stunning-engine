# Test plan: Myseed Ops

How Myseed Ops is tested: the automated suites, what runs where, the devices and networks, the manual checks a release needs, and when a change is good enough to ship. Requirement IDs refer to the [requirements specification](SRS.md).

## 1. Scope

Everything in the SRS. Automated tests cover the server logic and permissions of every module and the main screens in a real browser. Outside services (Chapa, Noor, Telegram, SMS, mail, AI providers, YouTube) are faked in tests and checked by hand after a deploy that touches them.

## 2. Test levels

| Level | Command | What it covers | Where it runs |
| --- | --- | --- | --- |
| Type check | `npm run typecheck` | The whole code base compiles under TypeScript | Locally, CI |
| Build | `npm run build` | The production build of every page | Locally, CI, the VPS on every deploy |
| Server tests | `npm test` | About a hundred test files in `tests/server/`: workflow rules, permissions, imports and exports, every department and module | Locally, CI |
| Browser tests | `npm run test:e2e` (after a build) | About seventy flows in `tests/e2e/` in headless Chrome against the built app, with screenshots on failure | Locally, CI |
| Verification | `npm run verify` | 66 checks of workflow permissions, transitions and imports against a throwaway instance | Locally |
| Scheduled checks | `npm run checks` | Deadline, blocker, timer, handoff and question checks | Locally |
| Health | `/api/health` | The live site answers and its database is reachable | Production, every 10 minutes from GitHub Actions |

Run part of a suite by name: `npm test -- library dev-studio`, `npm run test:e2e -- library`.

## 3. Test environment

- **Databases**: `tests/run.ts` seeds a demo workspace once (`tests/fixtures/demo-seed.ts`) and gives every test file its own copy in a temporary folder. `DATABASE_URL` is set to empty for every child process, so the live database is never touched (ADR-8, RULE-40).
- **Fakes**: `MAIL_FAKE=1` (mail is recorded, not sent), `AI_FAKE=1` (canned AI answers), local stand-ins for Chapa (`CHAPA_API_BASE`) and YouTube (`YOUTUBE_OEMBED_BASE`). The browser tests also run with `MYSEED_TIMER=0` and `MYSEED_DOCS_SYNC=0`, so scheduled jobs and the docs sync do not change the data under test.
- **CI**: `.github/workflows/ci.yml` runs on every push to `main` and every pull request: type check, build, server tests, browser tests, and keeps the screenshots for seven days when something fails.

## 4. Devices and networks

| Device | Why |
| --- | --- |
| Android phone with 2 GB of memory, Android 8 | The lowest phones staff and students use |
| Android phone with 3 GB, Android 10 | A common mid-range phone |
| A recent Android phone and an iPhone | Current phones, Safari |
| A tablet as the attendance kiosk | The kiosk's camera, QR and face check-in |
| A laptop with Chrome and Edge | Most staff work; the Windows app |
| The Windows app on a GTX 1050 Ti class computer | Seed Town and the arcade kiosk performance |

Networks: office Wi-Fi, 4G, 3G (Chrome's network throttling), and offline (for the kiosk and the offline page).

## 5. Test cases for a release

The automated suites cover the logic; these are the checks a person makes before or right after a release that touches the area. Each lists the requirements it covers.

| Case | Covers | Steps | Expected |
| --- | --- | --- | --- |
| TC-1 | FR-2, FR-3 | As a Recording member, start a part, log a camera code, submit; as the lead, approve and hand over | Editing receives it; submitting without a camera code is refused |
| TC-2 | FR-4, FR-5 | As the Editing lead, return the part with a note | The Recording member sees it as Redo with the note |
| TC-3 | FR-11, FR-21 | As a Dev member, move a task to Done and send it; as the lead, approve; as the tester, pass it | The task reaches Ready to release; the member cannot drag it past review |
| TC-4 | FR-23, FR-24 | Make an SRS from the template with FR-1 and FR-2, link FR-1 to a task, submit for review, approve | Version 1 approved; FR-2 shows "not covered"; editing it starts version 2 |
| TC-5 | FR-25, FR-26 | Import a Markdown file with a table, a checklist and a code block; open it Formatted; print to PDF; download Word | The stored text equals the file; the formatted view, PDF and Word show the table, checklist and code |
| TC-6 | FR-27 | Deploy a change to a file in `docs/library.json` | Its document updates in Specs and docs; a document edited in the app is not overwritten |
| TC-7 | FR-41, FR-43 | At the kiosk, check in by QR; switch the phone offline and check in | Both check-ins arrive; the offline one when the phone is back online |
| TC-8 | FR-51 | In Finance, Chapa, Settings press Check API, then run a full sync | The counts from Chapa and stored match; reconciliation lists the differences |
| TC-9 | FR-60, FR-61, FR-62 | From the support widget, start a chat and a call; answer as an agent; transfer the call | The conversation and call show in the desk and Call records |
| TC-10 | FR-70 | As a person without live Noor, open Legacy CMS | The saved copy is shown; no live Noor request is made |
| TC-11 | FR-95, NFR-1 | As a role without a permission, open its page and call its action (through the browser's console or a test) | The page is hidden and the server refuses the action |
| TC-12 | FR-97, NFR-6 | In Admin, System, Backups, back up now, then run a test restore | The backup is listed; the test restore compares every table |
| TC-13 | NFR-8, NFR-9 | Open the changed pages on the 2 GB Android phone, with an Amharic name in the data | Usable at phone width; Ethiopic text displays correctly |
| TC-14 | NFR-5 | After the deploy, open `/api/health` and sign in | Health is OK; sign-in works |

## 6. Entry and exit criteria

A change enters QA when its pull request is approved and CI is green. It leaves QA (passes) when:

- every acceptance criterion of the task holds;
- the test cases above for the areas it touches pass on the devices that matter for it;
- no open bug of severity 1 or 2 remains against it.

A release ships when every task in it has passed and the checklist in the [release guide](../dev-team/RELEASE-GUIDE.md) is complete.

## 7. Bugs

A bug found in QA goes back to the assignee as a bug task with steps to reproduce, the expected and actual result, the role, page, device and browser, and a screenshot or the error from Admin, System, Errors (RULE-4). The fix comes with the test that would have caught it (RULE-41).

## 8. Known gaps

- Outside services are only faked in automated tests; real Chapa, Noor, Telegram and SMS behaviour is checked by hand after deploys that touch them.
- There is no staging site yet ([RECOVERY.md](../RECOVERY.md), section 5 has the steps); risky changes are tried against a copy of production data on a developer's computer.
- Native Android and iPhone builds are not tested automatically.
