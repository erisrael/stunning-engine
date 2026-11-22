# 05. Tech stack and architecture

## 1. Stack

Exact versions are pinned in `package.json` and lockfiles when the workspace is scaffolded; use the current stable major of each at that time unless noted.

| Layer | Choice | Notes |
| --- | --- | --- |
| Runtime | Node.js LTS (24.x) | Same version in dev, CI and images |
| Language | TypeScript, `strict` | Shared `tsconfig` in `packages/config` |
| Monorepo | pnpm workspaces + Turborepo | Each app builds and deploys independently |
| Web apps | Next.js (App Router), React | Portal and platform console |
| Web UI | Tailwind CSS 3, Radix UI, class-variance-authority, `cn()` helper, lucide-react, motion, next-themes, sonner, cmdk, recharts | Exactly as required by [no-emoji-watermelon-ui.md](UI-RULES.md) |
| Web data | TanStack Query, TanStack Table, React Hook Form with Zod resolver | |
| Web i18n | next-intl | English and Amharic; `:lang(am)` typography rules from the UI rules |
| API | NestJS on the Express adapter | Modular monolith |
| Validation and contracts | Zod schemas in `packages/contracts`, used by NestJS (via `nestjs-zod`) and the web | OpenAPI generated from the same schemas |
| Database | PostgreSQL (17) | Row-level security as defense in depth |
| ORM and migrations | Prisma | Tenant-scoping client extension; SQL migrations for RLS policies |
| Jobs and queues | Redis (or Valkey) + BullMQ | Outbox relay, notifications, imports, exports, PDFs, reconciliation |
| Realtime | Socket.IO through a NestJS gateway, Redis adapter | Portal live updates (messages, attendance completion) |
| Files | S3-compatible storage; MinIO in dev and the self-hosted profile | Private buckets, presigned URLs |
| Malware scanning | ClamAV container (optional in self-hosted) | Scans uploads before they become visible |
| PDF | Playwright (Chromium) in the worker, HTML templates | Report cards, receipts, invoices, transcripts; Ethiopic fonts embedded |
| Auth (staff) | Email or phone + password (Argon2id), TOTP MFA (required for owners and admins), httpOnly cookie sessions stored in Postgres, CSRF protection | Optional "Sign in with MySeed ID" in P1 |
| Auth (Connect API) | OAuth 2.0 client credentials with `private_key_jwt` (Ed25519), `jose` library | Document 03, section 3 |
| SMS | Provider adapter interface; Iconic SMS first | Delivery reports by webhook |
| Email | Nodemailer over SMTP; adapter interface for API providers later | |
| Payments | Provider adapter interface; first adapters to confirm (Chapa, Telebirr) | Callbacks verified server side |
| Search | PostgreSQL full-text and `pg_trgm` | Meilisearch only if needed later |
| Logging | Pino (JSON), request ID and tenant ID on every line, PII redaction | |
| Tracing and metrics | OpenTelemetry SDK; Prometheus and Grafana in hosted | |
| Errors | Sentry (hosted); optional in self-hosted | Scrubbing rules for student data |
| Testing | Vitest (unit), Supertest (API), Testcontainers (Postgres, Redis, MinIO), Playwright (web e2e) | Tenant-isolation suite runs on every PR |
| CI/CD | GitHub Actions | Lint, typecheck, test, emoji check, build, image scan, SBOM, signed images |
| Containers | Docker; Docker Compose for hosted v1 and self-hosted | Kubernetes only when scale requires it |
| Reverse proxy | Caddy (automatic TLS) in self-hosted profile | Hosted uses the cloud load balancer |

Mobile apps (separate repositories): React Native with Expo (dev client and config plugins for `FLAG_SECURE`, Play Integrity, App Attest), TanStack Query, MMKV, react-native-video, react-native-pdf.

## 2. Repository layout (this repository)

```
apps/
  portal/            Next.js: school portal (tenant-resolved by host)
  console/           Next.js: MySeed platform console (hosted only)
  api/               NestJS: REST API, Connect API, realtime gateway
  worker/            NestJS standalone: BullMQ processors, outbox relay, schedulers
packages/
  ui/                Design system per the UI rules (primitives, blocks, tailwind preset, globals.css)
  contracts/         Zod schemas, OpenAPI generation, event schemas (published)
  sdk/               Typed Connect API client + webhook verifier (published)
  db/                Prisma schema, migrations, RLS SQL, tenant-scoped client, seed templates
  calendar/          Ethiopian and Gregorian conversion and formatting
  i18n/              Message catalogs (en, am) shared by portal and console
  config/            eslint, tsconfig, prettier, tailwind preset re-export
deploy/
  compose/           docker-compose.dev.yml, docker-compose.selfhosted.yml, Caddyfile, .env.example
  scripts/           backup, restore, upgrade, diagnostics bundle
docs/                This specification
scripts/
  check-emoji.mjs    From the UI rules; runs in CI
```

`console` is never shipped to self-hosted customers. A self-hosted instance has a small **License** page in the portal instead.

## 3. Backend modules

Each module owns its tables, services, controllers and events. Modules call each other through exported services, never through each other's tables.

| Module | Owns |
| --- | --- |
| `identity` | Users, credentials, sessions, MFA, invitations |
| `access` | Roles, permissions, role assignments, policy evaluation |
| `tenancy` | Organizations, campuses, tenant context, settings |
| `entitlements` | Modules catalog, plans, subscriptions, overrides, usage counters, resolver |
| `licensing` | Self-hosted license validation and activation |
| `people` | Students, guardians, staff, documents, custom fields |
| `admissions` | Applications, enrollment, transfers, promotion |
| `academics` | Years, terms, structure, subjects, teaching assignments, grading configurations |
| `attendance` | Sessions, records, corrections |
| `timetable` | Periods, timetables, calendar events |
| `learning` | Assignments, submissions, feedback, materials, file access |
| `results` | Assessments, marks, results, report cards, revisions |
| `finance` | Fee structures, invoices, payments, receipts, discounts, reconciliation, payment adapters |
| `communication` | Announcements, conversations, messages, templates, delivery log, SMS and email adapters |
| `connect` | Link codes, link requests, connections, Connect API controllers, webhook delivery |
| `reports` | Report definitions, export jobs |
| `files` | Upload slots, scanning, storage adapters, signed URLs |
| `audit` | Audit events, retention, privacy requests |
| `outbox` | Outbox table and relay |

### 3.1 Request pipeline

Every protected request passes these NestJS guards in order:

1. **Authenticate**: staff session cookie, or Connect API bearer token.
2. **Resolve tenant**: from host (portal) or token (Connect API). Never from a request body or query.
3. **Entitlement**: the route declares `@RequiresModule('module.attendance')`; the resolver's cached effective entitlements must include it.
4. **Permission**: the route declares `@RequiresPermission('attendance.session.take')`; checked against the user's role assignments at the right scope.
5. **Resource policy**: the service checks the specific record (teacher assigned to this section, connection's student in this audience).

Then the handler runs inside a database transaction with `SET LOCAL app.tenant_id` so RLS applies.

## 4. Multi-tenancy

- Shared database, shared schema for hosted. Every tenant-owned table has `organization_id uuid not null`.
- **Prisma extension** injects `organization_id` into every query on tenant-owned models and refuses queries without tenant context.
- **RLS policies** on every tenant-owned table: `using (organization_id = current_setting('app.tenant_id')::uuid)`. The application role is not a table owner and cannot bypass RLS. Platform jobs that must cross tenants use a separate role, audited.
- Composite foreign keys `(organization_id, id)` prevent cross-tenant references.
- Workers receive the tenant ID in the job payload and open the same tenant-scoped transaction.
- Object keys are prefixed `org/{organization_id}/...`; signed URLs are issued only after the authorization chain passes.
- Enterprise option: dedicated database per tenant using the same migrations; self-hosted is naturally single-tenant (one organization, many campuses).

## 5. Data model

Identifiers are UUIDv7. Timestamps are `timestamptz` in UTC; school-local dates are `date` with the campus time zone (`Africa/Addis_Ababa` default). Money is `bigint` minor units with a `currency` column.

| Domain | Tables |
| --- | --- |
| Platform | `organizations`, `campuses`, `organization_settings`, `licenses`, `license_activations` |
| Entitlements | `modules`, `module_dependencies`, `plans`, `plan_versions`, `plan_modules`, `organization_subscriptions`, `subscription_items`, `entitlement_overrides`, `usage_counters` |
| Identity and access | `users`, `user_credentials`, `sessions`, `mfa_factors`, `invitations`, `roles`, `role_permissions`, `role_assignments` |
| People | `students`, `student_identifiers`, `guardians`, `student_guardians` (with `access_profile`), `staff`, `documents`, `custom_field_definitions`, `custom_field_values` |
| Admissions | `applications`, `enrollments` (append-only, effective dates), `transfers`, `promotion_decisions` |
| Academics | `academic_years`, `terms`, `levels`, `grades`, `streams`, `sections`, `subjects`, `grade_subjects`, `teaching_assignments`, `academic_configurations` (versioned) |
| Attendance | `attendance_sessions`, `attendance_records`, `attendance_corrections` |
| Timetable | `periods`, `timetables`, `timetable_slots`, `calendar_events` |
| Learning | `assignments`, `assignment_audiences`, `submissions`, `submission_files`, `feedback`, `materials`, `material_versions`, `material_audiences`, `file_objects`, `file_access_log` |
| Results | `assessments`, `marks`, `mark_revisions`, `results`, `report_card_templates`, `report_cards`, `report_card_revisions` |
| Finance | `fee_categories`, `fee_structures`, `invoices`, `invoice_lines`, `discounts`, `payment_intents`, `payments`, `receipts`, `refunds`, `ledger_entries` (append-only) |
| Communication | `announcements`, `announcement_audiences`, `conversations`, `conversation_participants`, `messages`, `message_attachments`, `templates`, `deliveries` |
| Connect | `link_codes`, `link_requests`, `connections`, `connect_clients`, `webhook_endpoints`, `webhook_deliveries` |
| Integration and reliability | `outbox_events`, `idempotency_keys`, `integration_configs` (secrets encrypted) |
| Governance | `audit_events`, `retention_policies`, `export_jobs`, `privacy_requests`, `support_access_grants` |

Modelling rules:

1. Phone numbers, student numbers and national IDs are attributes, never keys.
2. Enrollment, guardian links, academic configuration and marks keep history; nothing that was published is overwritten in place.
3. Status columns are explicit enums with documented transitions; existence of a row never implies approval.
4. Financial corrections are new ledger entries (reversal plus correction), never updates.
5. File bytes live in object storage; metadata, audience and policy live in Postgres.

## 6. Reliability patterns

- **Outbox:** domain services write `outbox_events` in the same transaction as the change. The worker relays them to BullMQ and to webhook endpoints, marking delivery per endpoint.
- **Idempotency:** `idempotency_keys(organization_id, key, route, response_hash, created_at)` stores the first response for 24 hours; repeats return it.
- **Retries:** exponential backoff with jitter; dead-letter queue visible in the console and the school's sync health page.
- **Scheduled jobs:** due-soon reminders, invoice generation, reconciliation, retention, license checks, backups (self-hosted script).

## 7. Deployment profiles

One image per app (`portal`, `api`, `worker`, `console`), same images for hosted and self-hosted, configured by environment variables.

### 7.1 Hosted (v1)

- Region and provider to be confirmed (open decision D3); requirements: managed Postgres with point-in-time recovery, managed Redis, S3-compatible storage, load balancer with TLS, container hosting.
- Wildcard domain `*.schoolhub.myseed.et` plus custom domains per tenant.
- Environments: `dev`, `staging`, `production`; staging receives every release first.

### 7.2 Self-hosted

`docker-compose.selfhosted.yml` services: `caddy`, `portal`, `api`, `worker`, `postgres`, `redis`, `minio`, `clamav` (optional), `connector` (relay mode, P1).

Provided with it:

- Minimum host: 4 vCPU, 8 GB RAM, 100 GB SSD for up to 2,000 students (to be validated in load tests)
- `install`, `upgrade`, `backup`, `restore`, `diagnostics` scripts; migrations run automatically on upgrade with a pre-upgrade backup
- Offline license validation with a signed license file; 30-day grace period after expiry; no data lockout on expiry, only feature freeze for new changes
- Documented outbound connections (MySeed Connect, SMS, payment providers, update checks) each switchable off
- Diagnostics bundle that excludes student records by default

## 8. Web implementation rules

Apply [no-emoji-watermelon-ui.md](UI-RULES.md) in full:

- `packages/ui` is the only home of primitives; apps never restyle them.
- MySeed brand: keep the green primary and amber `seed` accent from the UI rules.
- Fonts: Inter and Inter Tight, plus Noto Sans Ethiopic in the stack; `:lang(am)` rules for headings and body.
- Data-dense school screens (attendance roster, gradebook, invoices) use the table recipe: quiet headers, `tabular-nums`, right-aligned numbers, ghost `icon-sm` row actions with `aria-label`.
- Status always uses `Badge` variants (`success`, `warning`, `destructive`, `muted`), for example attendance statuses and invoice states.
- Every screen is checked in light and dark mode at 360, 768 and 1280 px wide, and `node scripts/check-emoji.mjs` passes before work is called done.
