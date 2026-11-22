# MySeed Academy architecture decisions

## 1. Summary

These records describe decisions that are visible in the code as of commit `31bd529` (17 November 2026). ADR-1 to ADR-5 match the original records in `docs/adr/` (copied to [existing ADRs](../existing/docs/adr/ADR-001-modular-monolith-express-ts.md)). The rest are written here for the first time from the code.

> [!NOTE]
> `existing/docs/ops/05-architecture-decision-record.md` describes an "ADR-006" for offline-first sync of learning content. That design is not implemented in this repository, so it is not listed below.

| ID | Decision | Status |
| --- | --- | --- |
| ADR-1 | Modular monolith: one Express and TypeScript API | Accepted |
| ADR-2 | PostgreSQL through Prisma | Accepted |
| ADR-3 | Next.js App Router apps in one monorepo | Accepted |
| ADR-4 | First-party design system modelled on Watermelon UI | Accepted |
| ADR-5 | Two language tiers | Accepted |
| ADR-6 | Automatic in-memory database fallback | Accepted |
| ADR-7 | Schema changes with `prisma db push`, no migration files | Accepted, to review |
| ADR-8 | Provider credentials in an encrypted vault, configured at runtime | Accepted |
| ADR-9 | Roles and permissions stored as data | Accepted |
| ADR-10 | Own signed session token and PBKDF2, no auth library | Accepted |
| ADR-11 | Background jobs as timers inside the API process | Accepted, limits scaling |
| ADR-12 | One VPS with Docker Compose and Caddy as the default host | Accepted |
| ADR-13 | Bank transfers with proof and outside verification | Accepted |
| ADR-14 | Media files copied into the database | Accepted |
| ADR-15 | Soft delete with a recycle bin and content snapshots | Accepted |
| ADR-16 | The website never runs a support desk | Accepted |

## 2. Records

### ADR-1: Modular monolith with Express and TypeScript

- **Status:** Accepted (original: `docs/adr/ADR-001-modular-monolith-express-ts.md`).
- **Context:** A small team runs a website, a console and payment flows. Separate services would add deployment and network failure points.
- **Decision:** One Express API (`services/api`) split into routes, controllers, services and providers. Shared types live in `packages/types`.
- **Consequences:** One process to deploy and observe. Module boundaries are a convention, not enforced. The API runs TypeScript directly with `tsx`, so there is no compiled `dist/`.

### ADR-2: PostgreSQL through Prisma

- **Status:** Accepted (original: `docs/adr/ADR-002-postgres-prisma.md`).
- **Context:** Donations, roles and content need relational integrity and transactions.
- **Decision:** PostgreSQL 16 with the Prisma client, schema in `packages/database/prisma/schema.prisma`.
- **Consequences:** Typed queries across the monorepo. Any PostgreSQL host works (VPS container, Supabase, Render).

### ADR-3: Next.js App Router apps in a monorepo

- **Status:** Accepted (original: `docs/adr/ADR-003-nextjs-app-router-monorepo.md`).
- **Context:** The website needs server rendering in nine locales for SEO. The console shares components with it.
- **Decision:** Two Next.js 14 apps (`apps/web`, `apps/admin`) in npm workspaces, with tasks run by Turborepo.
- **Consequences:** Shared UI and types without publishing packages. Next.js 14 no longer gets new fixes; the roadmap lists an upgrade to Next.js 15 and React 19.

### ADR-4: First-party design system modelled on Watermelon UI

- **Status:** Accepted (original: `docs/adr/ADR-004-watermelon-ui-adaptation-layer.md`).
- **Context:** The site and the console need one consistent, accessible look, in light and dark themes, with Amharic and Arabic text.
- **Decision:** Build `packages/ui` on Radix primitives and Tailwind tokens, modelled on Watermelon UI, with no emoji anywhere.
- **Consequences:** Full control over accessibility and RTL. The team maintains the components. Rules are in `docs/guides/no-emoji-watermelon-ui.md`.

### ADR-5: Two language tiers

- **Status:** Accepted (original: `docs/adr/ADR-005-dual-tier-multilingual-architecture.md`).
- **Context:** Editors can write English and Amharic well. Seven more languages are wanted, but there are no editors for them.
- **Decision:** Tier 1 (English, Amharic) is required on every content type and checked by the API. Tier 2 (Spanish, French, Arabic, Mandarin, Hindi, Portuguese, Russian) is machine translated on save with Google Cloud Translation or Claude, with per-field editor overrides that machine output never overwrites. The interface strings for Tier 2 are generated once into `apps/web/lib/i18n/machine/`.
- **Consequences:** Nine languages with a small team. Without a translation key, Tier 2 pages show English content.

### ADR-6: Automatic in-memory database fallback

- **Status:** Accepted.
- **Context:** Designers and testers must be able to run the site without PostgreSQL, and CI runs the API without a database.
- **Decision:** `services/api/src/lib/db.ts` connects to PostgreSQL if it is reachable, otherwise it uses `MemoryClient`, a Prisma-compatible store seeded from shared content.
- **Consequences:** The site always starts. In production, a database outage silently switches to memory mode, and writes made then are lost on restart. `/readyz` reports the mode, so monitoring must check it.

### ADR-7: Schema changes with `prisma db push`

- **Status:** Accepted, to review.
- **Context:** Early development changed the schema often.
- **Decision:** No `prisma/migrations` folder. `prisma db push` runs locally, in the `migrate` container and in the Render build. One-off data fixes go in `packages/database/prisma/manual/`.
- **Consequences:** Fast changes. There is no migration history to review or roll back, and `db push` refuses changes that would lose data, which stops a deploy. Rolling back code does not roll back the schema.

### ADR-8: Encrypted vault for provider credentials

- **Status:** Accepted.
- **Context:** Staff need to add and rotate payment, email and AI keys without a developer or a restart.
- **Decision:** Keys saved in Admin, Integrations are encrypted with AES-256-GCM using `ENCRYPTION_KEY` (`services/vault.service.ts`) and take priority over environment variables. `providers/registry.ts` builds providers at call time. Keys that do not match a provider's format, or still hold placeholders, are ignored.
- **Consequences:** No restarts to change keys. `ENCRYPTION_KEY` must never change after launch, or the saved keys become unreadable.

### ADR-9: Roles and permissions as data

- **Status:** Accepted.
- **Context:** MySeed needs roles beyond the built-in ones, and donor data must stay away from developers.
- **Decision:** Permissions are `area:action` strings defined in `packages/types/src/rbac.ts`. Roles live in the `Role` table, are cached in memory and can be edited in the console. Super Admin is fixed to `system:*`. The Developer role can never hold sensitive areas.
- **Consequences:** Flexible access without code changes. The role cache is per process.

### ADR-10: Own session tokens and PBKDF2

- **Status:** Accepted.
- **Context:** Only staff sign in, and the team wanted no outside auth dependency.
- **Decision:** PBKDF2-SHA512 password hashes and an HMAC-SHA256 signed token in an HTTP-only cookie, valid 7 days (`services/auth.service.ts`). Each request re-checks the account and the last password change.
- **Consequences:** No vendor lock-in. There is no second factor and no list of active sessions yet.

### ADR-11: Background jobs as timers in the API

- **Status:** Accepted, limits scaling.
- **Context:** A few jobs must run continuously: uptime checks, scheduled newsletters and MySeed Verify sync.
- **Decision:** `setInterval` timers started by `bootstrap()`. No queue or worker.
- **Consequences:** Simple to run on one server. Running two API instances would duplicate jobs and split rate limits. Redis is in `docker-compose.yml` but unused.

### ADR-12: One VPS with Docker Compose and Caddy

- **Status:** Accepted.
- **Context:** Low running cost and full control, with HTTPS and backups.
- **Decision:** `docker-compose.prod.yml` plus `deploy/vps/docker-compose.vps.yml` on a Hostinger VPS, with Caddy for HTTPS, release folders and nightly `pg_dump`. Render, Netlify, Vercel and Supabase stay supported through `render.yaml`, `netlify.toml` and the control panel.
- **Consequences:** One server is a single point of failure. Deploys and rollbacks run from one staff computer through the control panel or SSH.

### ADR-13: Bank transfers with proof and outside verification

- **Status:** Accepted.
- **Context:** Many Ethiopian donors pay by bank transfer. Sending them to a contact form lost them.
- **Decision:** Donors submit a receipt screenshot, receipt link or transaction number (`services/bankTransfer.service.ts`). Fraud rules refuse reused references and flag reused screenshots and unknown links. MySeed Verify or Tina Verify confirm automatically when switched on; otherwise finance approves by hand.
- **Consequences:** More donors can pay. Finance has a review queue (verify, fakes, follow-ups). Receipt links are never opened by the server.

### ADR-14: Media files copied into the database

- **Status:** Accepted.
- **Context:** Some hosts (Render) replace the disk on every deploy, so uploads disappeared.
- **Decision:** Each upload is also stored in `MediaBlob`. `/uploads/:file` serves from disk, or from the database copy and writes it back. An S3-compatible bucket can be connected.
- **Consequences:** Uploads survive deploys. The database grows with media size.

### ADR-15: Recycle bin and content snapshots

- **Status:** Accepted.
- **Context:** Staff delete and edit content directly in production.
- **Decision:** Deletes move a full copy to `TrashItem` for 30 days (`services/trash.service.ts`). `DbSnapshot` stores point-in-time copies of content and settings. Payments, sponsors, inquiries, subscribers, staff, roles, credentials and logs are excluded from restores on purpose.
- **Consequences:** Mistakes can be undone without a database restore. A content restore never deletes a payment or locks anyone out.

### ADR-16: No support desk on the website

- **Status:** Accepted (see [boundary charter](../existing/docs/architecture/boundary_charter.md)).
- **Context:** A separate support mini-app handles tickets and live agents.
- **Decision:** The website offers the FAQ, a FAQ-grounded assistant and handoff to WhatsApp or Telegram. It never creates tickets.
- **Consequences:** Less scope here. Questions the assistant cannot answer go to a queue that staff turn into FAQs.
