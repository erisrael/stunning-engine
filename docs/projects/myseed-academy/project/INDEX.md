# MySeed Academy documentation index

This export documents the MySeed Academy website, admin console and API (`my-seed-academy`) at commit `31bd529`, generated on 23 November 2026. Documents in `project/` were written from the code and git history. Documents in `existing/` are copies of the repository's own docs, unchanged apart from removed secrets, placeholder phone numbers and fixed links.

> [!WARNING]
> The documents marked "planning set" come from `docs/ops/` in the repository. They describe plans and the separate learning app (video lessons, offline sync, a v2.4.0 release) that are not in this code. Read the documents in `project/` for what is actually built.

## 1. Start here

| Title | File | What it is for |
| --- | --- | --- |
| [MySeed Academy documentation index](INDEX.md) | `project/INDEX.md` | This list: every document in the export, grouped by folder. |
| [MySeed Academy product overview](PRODUCT-OVERVIEW.md) | `project/PRODUCT-OVERVIEW.md` | What the platform is for, who uses it, its modules and screens, where it runs and the principles it keeps. |
| [MySeed Academy progress report](PROGRESS.md) | `project/PROGRESS.md` | State on 23 November 2026: what is built and open, tests, hosting, risks and the recommended next steps. |

## 2. Requirements and plans

| Title | File | What it is for |
| --- | --- | --- |
| [MySeed Academy software requirements specification](SRS.md) | `project/SRS.md` | Requirements as built, with FR, NFR, IR and DR IDs, priorities and acceptance checks. |
| [Feature inventory by plan phase](../existing/docs/FEATURES.md) | `existing/docs/FEATURES.md` | Every feature mapped to the 22-phase plan and to where it lives in the code. |
| [Roadmap and site builder plan (October 2026)](../existing/docs/ROADMAP.md) | `existing/docs/ROADMAP.md` | Fixes before launch, features to add, and the path from the homepage builder to a site builder. Some items are now built. |
| [Stage map and 22-phase implementation plan](../existing/docs/architecture/stage_map_and_implementation_plan.md) | `existing/docs/architecture/stage_map_and_implementation_plan.md` | The original phased build plan. |
| [myseed.com.et content inventory (10 October 2026)](../existing/docs/content/myseed-com-et.md) | `existing/docs/content/myseed-com-et.md` | Public content of the old site, and how it differs from the new site placeholders. |
| [Ops document suite index (planning set)](../existing/docs/ops/README.md) | `existing/docs/ops/README.md` | Index of the docs/ops set. That set describes plans and the learning app, not this code as built. |
| [Planning SRS, IEEE 830 and ISO 29148 (planning set)](../existing/docs/ops/01-srs-ieee830-iso29148.md) | `existing/docs/ops/01-srs-ieee830-iso29148.md` | Earlier requirements framework. Use the as-built SRS for what exists. |
| [Planning SRS: Smart Learning Loop (learning app, not in this repository)](../existing/docs/ops/02-srs-myseed-learning-feature.md) | `existing/docs/ops/02-srs-myseed-learning-feature.md` | Feature specification for the learning app; nothing in it is implemented here. |
| [Product brief: the MySeed learning companion (planning set)](../existing/docs/ops/03-product-brief.md) | `existing/docs/ops/03-product-brief.md` | Market, personas and strategy for the wider MySeed product. Prices in it predate the quarterly pricing. |

## 3. Architecture and decisions

| Title | File | What it is for |
| --- | --- | --- |
| [MySeed Academy architecture](ARCHITECTURE.md) | `project/ARCHITECTURE.md` | Stack with versions, code layout, request flow, database, auth, jobs, integrations, deployment and observability. |
| [MySeed Academy architecture decisions](DECISIONS.md) | `project/DECISIONS.md` | ADR-1 to ADR-16 as visible in the code. |
| [ADR-001: Modular monolith with Express and TypeScript](../existing/docs/adr/ADR-001-modular-monolith-express-ts.md) | `existing/docs/adr/ADR-001-modular-monolith-express-ts.md` | Original record. |
| [ADR-002: PostgreSQL with Prisma](../existing/docs/adr/ADR-002-postgres-prisma.md) | `existing/docs/adr/ADR-002-postgres-prisma.md` | Original record. |
| [ADR-003: Next.js App Router monorepo](../existing/docs/adr/ADR-003-nextjs-app-router-monorepo.md) | `existing/docs/adr/ADR-003-nextjs-app-router-monorepo.md` | Original record. |
| [ADR-004: Watermelon UI adaptation layer](../existing/docs/adr/ADR-004-watermelon-ui-adaptation-layer.md) | `existing/docs/adr/ADR-004-watermelon-ui-adaptation-layer.md` | Original record. |
| [ADR-005: Two-tier multilingual architecture](../existing/docs/adr/ADR-005-dual-tier-multilingual-architecture.md) | `existing/docs/adr/ADR-005-dual-tier-multilingual-architecture.md` | Original record. |
| [ADR-006 proposal: offline-first sync (not implemented)](../existing/docs/ops/05-architecture-decision-record.md) | `existing/docs/ops/05-architecture-decision-record.md` | Proposed design for the learning app; not built in this repository. |
| [System boundary charter: website and support mini-app](../existing/docs/architecture/boundary_charter.md) | `existing/docs/architecture/boundary_charter.md` | What the website does and what belongs to the separate support app. |
| [Technical design of the MySeed stack (planning set)](../existing/docs/ops/04-technical-design-myseed-stack.md) | `existing/docs/ops/04-technical-design-myseed-stack.md` | Earlier technical design. Some parts (offline sync, queues) are not built. |
| [UI rules: no emoji, Watermelon-style design system](../existing/docs/guides/no-emoji-watermelon-ui.md) | `existing/docs/guides/no-emoji-watermelon-ui.md` | Rules for every interface change. |

## 4. Operations and runbooks

| Title | File | What it is for |
| --- | --- | --- |
| [Repository README: quick start and console guide](../existing/README.md) | `existing/README.md` | Quick start, database, seeded accounts, languages, console pages, providers, tests and production. |
| [Deploying to a Hostinger VPS](../existing/docs/runbooks/DEPLOY.md) | `existing/docs/runbooks/DEPLOY.md` | The current deploy guide: domains, server setup, secrets, deploy, rollback, backups, troubleshooting, other hosts. |
| [SEO and GEO audit and guidelines](SEO-GEO-GUIDE.md) | `project/SEO-GEO-GUIDE.md` | The live-site audit of 23 November 2026, the fixes it calls for (tasks WEB-18 to WEB-24), and the rules for search engines and AI assistants. |
| [Control panel guide](../existing/control-panel/README.md) | `existing/control-panel/README.md` | The local panel that deploys, syncs the database and downloads backups. |
| [Disaster recovery and secret rotation (older version)](../existing/docs/runbooks/disaster-recovery.md) | `existing/docs/runbooks/disaster-recovery.md` | Earlier recovery notes; its backup schedule differs from the scripts. Use the deploy guide first. |
| [Zero-downtime deployment (older version)](../existing/docs/runbooks/zero-downtime-deployment.md) | `existing/docs/runbooks/zero-downtime-deployment.md` | Earlier deploy notes that assume Prisma migrations; the code uses db push. |
| [Production runbook (planning set)](../existing/docs/ops/08-runbook.md) | `existing/docs/ops/08-runbook.md` | Earlier SOPs and escalation template; on-call contacts are placeholders. |
| [Postmortem INC-2026-10-18 (to confirm)](../existing/docs/ops/09-postmortem.md) | `existing/docs/ops/09-postmortem.md` | Describes an incident that git history does not show; confirm whether it happened. |

## 5. Quality and releases

| Title | File | What it is for |
| --- | --- | --- |
| [MySeed Academy test plan](TEST-PLAN.md) | `project/TEST-PLAN.md` | Test levels and commands, CI, fakes, devices, release test cases TC-1 to TC-17, gaps. |
| [MySeed Academy release history](RELEASE-HISTORY.md) | `project/RELEASE-HISTORY.md` | Changes by period from git history, newest first. |
| [Production readiness checklist](../existing/docs/runbooks/production-readiness-checklist.md) | `existing/docs/runbooks/production-readiness-checklist.md` | Security, RBAC and operations checklist. Some numbers (rate limits) differ from the code. |
| [Device test plan (planning set, learning app)](../existing/docs/ops/06-test-plan-myseed-devices.md) | `existing/docs/ops/06-test-plan-myseed-devices.md` | Device and network matrix written for the learning app. |
| [Release notes v2.4.0 (template, not a real release)](../existing/docs/ops/07-release-notes-and-checklist.md) | `existing/docs/ops/07-release-notes-and-checklist.md` | Release notes and checklist format; no v2.4.0 tag exists. |

## 6. Working on this project

| Title | File | What it is for |
| --- | --- | --- |
| [Working on MySeed Academy](WORKING-ON-IT.md) | `project/WORKING-ON-IT.md` | Setup, environment variables, branches, deploy and rollback, backups, ownership and project rules. |

## 7. Not exported

| Item | Why |
| --- | --- |
| `OPS doc/` | A copy of `docs/ops/` with Windows line endings |
| `OPS doc/claudestooped here.md` | A tool session transcript, not documentation |
| `AGENTS.md` | Turborepo agent guidance generated by `turbo`, not project documentation |
| `docs/content/myseed-com-et-assets/` | Images; the library shows no images |
