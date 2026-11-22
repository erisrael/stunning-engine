# Transaction Verify documentation index

> [!NOTE]
> Every document in this export, grouped by library folder. Export made on 23 November 2026 from commit `3435810`. Documents in `project/` were written for this export from the code. Documents in `existing/` are the repository's own Markdown, copied as they are (line endings set to LF, links to files outside the export changed to code names, and a sample SMTP address given placeholder credentials).

## 1. Start here

| Title | File | What it is for |
| --- | --- | --- |
| Transaction Verify documentation index | [INDEX.md](INDEX.md) | This list |
| Transaction Verify product overview | [PRODUCT-OVERVIEW.md](PRODUCT-OVERVIEW.md) | The problem, the users and roles, modules and screens, where it runs, the principles it keeps |
| Transaction Verify progress report | [PROGRESS.md](PROGRESS.md) | What is built and open as of 23 November 2026, status by phase, items not yet checked live, risks, what to do next |

## 2. Requirements and plans

| Title | File | What it is for |
| --- | --- | --- |
| Transaction Verify software requirements specification | [SRS.md](SRS.md) | Requirements as built: FR, NFR, IR and DR with priorities and acceptance lines, and open requirements |
| Repository README | [README.md](../existing/README.md) | The repository's landing page: purpose, deployment models, status table, getting started |
| Repository documentation map | [docs/README.md](../existing/docs/README.md) | The repository's own map of documents and folders |
| Product and UI specification | [product-ui.md](../existing/docs/product-ui.md) | User journeys, roles, screen inventory and feedback |
| Build roadmap and release gates | [roadmap.md](../existing/docs/roadmap.md) | Stages, phase status notes, console track, demo and test inventory |
| MySeed Verify master roadmap v5 | [master-roadmap-v5.md](../existing/docs/master-roadmap-v5.md) | The source of phase numbers 0 to 12, mechanism map, risks |
| Payments and provider coverage | [payments-providers.md](../existing/docs/payments-providers.md) | External payments, checkout, billing, partners and provider certification |
| Progressive web apps plan | [pwa.md](../existing/docs/pwa.md) | Hosted page, cashier and console PWAs, caching, offline, release checks |
| Storefront, QR stands, branches and the builders | [commerce-and-builders.md](../existing/docs/commerce-and-builders.md) | Branches and purposes, QR stands, storefront commerce, Telegram, builders |
| Shoppers, the MySeed Shop app and store features | [storefront-marketplace.md](../existing/docs/storefront-marketplace.md) | Shopper accounts, the shop app, landing pages, vouchers, memberships, auctions, Pay with Chapa |
| Storefront benchmark against other shops | [storefront-benchmark.md](../existing/docs/storefront-benchmark.md) | Feature comparison with large online shops |
| Creative Studio specification | [creative-studio/README.md](../existing/docs/creative-studio/README.md) | What the studio does today and where the code is |
| Creative Studio roadmap | [creative-studio/roadmap.md](../existing/docs/creative-studio/roadmap.md) | Eight further phases for a larger studio |
| Launch communications plan | [launch-communications.md](../existing/docs/launch-communications.md) | What the public launch says, checks before it, ready-to-send texts |

## 3. Architecture and decisions

| Title | File | What it is for |
| --- | --- | --- |
| Transaction Verify architecture | [ARCHITECTURE.md](ARCHITECTURE.md) | Stack with versions, code layout, request flow, database, sign-in, background work, integrations, deployment, observability |
| Transaction Verify architecture decisions | [DECISIONS.md](DECISIONS.md) | ADR-1 to ADR-29 drawn from the code |
| System and repository architecture (design document) | [architecture.md](../existing/docs/architecture.md) | The original design: boundaries, lifecycle, load and failure, trust |
| Decision log | [decisions.md](../existing/docs/decisions.md) | Decisions 1 to 81 with how each is applied and where to change it |
| API versions and deprecation rules | [api-versioning.md](../existing/docs/api-versioning.md) | Breaking changes, Deprecation and Sunset headers, SDK versions |
| Integrations and SDKs | [integrations-sdk.md](../existing/docs/integrations-sdk.md) | API behavior, authentication, SDK release, webhooks, recipes |
| Quickstart: a signed sandbox webhook | [quickstart.md](../existing/docs/quickstart.md) | A new developer's first sandbox payment and signed webhook |
| Security: encryption, key rotation and penetration test scope | [security.md](../existing/docs/security.md) | What is encrypted with which key, rotating keys, test scope |
| UI guidelines | [ui-guidelines.md](../existing/docs/ui-guidelines.md) | Principles, tokens, type, components, writing, accessibility, no-emoji rule |
| Database model | [database/README.md](../existing/database/README.md) | Records, money rules, processing boundaries, applying and verifying migrations |
| Creative Studio architecture | [creative-studio/architecture.md](../existing/docs/creative-studio/architecture.md) | How the studio is built |
| Creative Studio document format | [creative-studio/document-format.md](../existing/docs/creative-studio/document-format.md) | The saved design document |
| Creative Studio motion and sound | [creative-studio/motion-and-sound.md](../existing/docs/creative-studio/motion-and-sound.md) | Timeline and sound engine |
| Creative Studio scripts and AI | [creative-studio/scripts-and-ai.md](../existing/docs/creative-studio/scripts-and-ai.md) | Script sandbox and the AI assistant |
| Creative Studio 3D studio | [creative-studio/3d-studio.md](../existing/docs/creative-studio/3d-studio.md) | Materials, models, lights and Blender-style controls |
| Tesseract OCR adapter | [packages/evidence/README.md](../existing/packages/evidence/README.md) | Local OCR setup, command-line runner, worker integration |
| Server SDK (@myseed-verify/server) | [packages/sdk-server/README.md](../existing/packages/sdk-server/README.md) | Node client and webhook verification |
| Web SDK (@myseed-verify/web) | [packages/sdk-web/README.md](../existing/packages/sdk-web/README.md) | Browser upload, submit, polling and the payment component |
| React Native SDK (@myseed-verify/react-native) | [packages/sdk-mobile/README.md](../existing/packages/sdk-mobile/README.md) | Mobile adapter |

## 4. Operations and runbooks

| Title | File | What it is for |
| --- | --- | --- |
| Operations runbooks | [runbooks.md](../existing/docs/runbooks.md) | What to do for each alert, monitoring from outside, monthly restore drills, key rotation |
| Incident guide | [incident-guide.md](../existing/docs/incident-guide.md) | Severity, the first 15 minutes, status updates, data breach duties |
| Deploy on the Myseed VPS | [deploy/vps/README.md](../existing/deploy/vps/README.md) | One-time setup, every deploy, roll back, restore on the server |
| Control panel guide | [control-panel/README.md](../existing/control-panel/README.md) | The local control panel and each of its pages |
| Local services with Docker | [ops/README.md](../existing/ops/README.md) | Optional PostgreSQL and MinIO with Docker compose |
| Staff console operator guide | [console.md](../existing/docs/console.md) | Sign-in, roles, review queue, accounts, deliveries, reconciliation, data, retention |
| Platform admin guide | [platform-admin.md](../existing/docs/platform-admin.md) | Platform roles, reviewing organizations, approval, packages, partners |
| Billing rules and finance runbook | [billing.md](../existing/docs/billing.md) | How invoices are worked out, numbering, refunds, monthly reconciliation |
| Customer success and support playbook | [customer-success.md](../existing/docs/customer-success.md) | Onboarding steps, weekly routine, tickets, organizations in trouble |
| Offboarding an organization | [offboarding.md](../existing/docs/offboarding.md) | Data handover, the 30-day delete date, what is kept |
| Employees, branches and the cashier | [branches-and-cashier.md](../existing/docs/branches-and-cashier.md) | Inviting people, branches, counter payments, what each bank needs, relays |
| Cashier app notes | [apps/cashier/README.md](../existing/apps/cashier/README.md) | Where the cashier lives in the web app |
| Cashier phone app (Android) | [apps/cashier-android/README.md](../existing/apps/cashier-android/README.md) | Permissions, phone relay, build |
| MySeed Shop app (Android) | [apps/shop-android/README.md](../existing/apps/shop-android/README.md) | The shop app shell, sign-in, payments, build |
| Relay browser extension | [apps/relay-extension/README.md](../existing/apps/relay-extension/README.md) | Installing and pairing the Chrome and Edge relay, what it may do |

## 5. Quality and releases

| Title | File | What it is for |
| --- | --- | --- |
| Transaction Verify test plan | [TEST-PLAN.md](TEST-PLAN.md) | Test levels and commands, CI, fakes, release cases TC-1 to TC-38, entry and exit criteria, gaps |
| Transaction Verify release history | [RELEASE-HISTORY.md](RELEASE-HISTORY.md) | Changes by day from git history, newest first |
| Verification and organization data audit, 15 November 2026 | [verification-audit-2026-11-15.md](../existing/docs/verification-audit-2026-11-15.md) | Credential error cause, result meanings, connector hardening, validation results |
| End-to-end test notes | [tests/e2e/README.md](../existing/tests/e2e/README.md) | What the e2e suite covers |
| Sandbox examples | [examples/README.md](../existing/examples/README.md) | Running the sandbox and the academy demo, synthetic references |

## 6. Working on this project

| Title | File | What it is for |
| --- | --- | --- |
| Working on Transaction Verify | [WORKING-ON-IT.md](WORKING-ON-IT.md) | Setup, environment variables, branches, deploy and roll back, backups, ownership, project rules |
