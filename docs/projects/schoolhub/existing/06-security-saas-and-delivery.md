# 06. Security, SaaS packaging and delivery

## 1. Security and privacy

### 1.1 Controls

| Area | Requirement |
| --- | --- |
| Staff authentication | Argon2id passwords, TOTP MFA required for owners and administrators, lockout and rate limits, session list with revoke |
| Authorization | Entitlement, permission and resource checks on every protected operation (document 05, section 3.1) |
| Tenant isolation | Server-resolved tenant context, Prisma scoping, Postgres RLS, composite foreign keys, isolation test suite |
| Connect API | `private_key_jwt` client auth, connection grant checked per request, signed webhooks with replay protection |
| Data in transit | TLS everywhere, HSTS on web |
| Data at rest | Encrypted disks and backups; integration secrets encrypted with an envelope key (KMS in hosted, key file in self-hosted) |
| Files | Private buckets, 5-minute signed URLs, type sniffing, size limits, malware scan, access log |
| Logging | Never log OTPs, tokens, passwords, message bodies or marks; redact phone numbers to last 3 digits |
| Admin access | Platform support needs a tenant-approved, time-limited grant with a reason; every action audited |
| Supply chain | Dependency, secret and image scanning in CI; signed images; SBOM per release |
| Backups | Hosted: point-in-time recovery plus daily snapshots kept 30 days; restore drill every quarter. Self-hosted: nightly backup script and documented restore |
| Incident response | Runbook covering triage, containment, customer notice, recovery and review |

### 1.2 Children's data

Users are mostly minors (grades 5 to 12). Ethiopia's Personal Data Protection Proclamation No. 1321/2024 applies; the final design needs review by Ethiopian legal counsel before launch (open decision D6). Product rules that do not wait for that review:

- Collect the minimum. Sensitive categories are off by default (document 02, section 4.3).
- No advertising profiles, no sale of data, no use of school records for MySeed marketing.
- School records and MySeed learning data are never merged; sharing between them is explicit and revocable (document 03, section 12).
- Consent is purpose-specific (school link, progress sharing, marketing messages), recorded with time and actor.
- Parents and students can see what is shared with whom in the apps.

### 1.3 Launch security tests

These must pass, automated where possible, before any school goes live:

1. A School A user cannot read or change School B data by changing IDs, hosts or parameters.
2. A student cannot read another student's submissions, marks, attendance or materials outside their audience.
3. A guardian without an active connection, or with a restricted profile, cannot read the blocked data.
4. A revoked or suspended connection fails on the very next request, including cached gateway paths.
5. Draft or unapproved marks never appear in any Connect API response.
6. Editing a published mark without the permission fails; with it, a revision and audit event exist.
7. A worker job never processes one tenant's data under another tenant's context.
8. Replayed payment callbacks and webhooks do not create duplicates.
9. Exports are blocked without permission and audited with it.
10. A restored backup in a clean environment passes the smoke suite.

### 1.4 App device security policy (applies to school screens)

Configured in the Education System, enforced by both apps:

| Policy | Behavior on school screens |
| --- | --- |
| Screen capture | Blocked on `view_only` materials, report cards and results (Android `FLAG_SECURE`; iOS hides content while capture or mirroring is detected) |
| Emulator, root or jailbreak | Configurable: block protected content, or block the app; school schedule and announcements remain viewable by default |
| Integrity attestation | Play Integrity and App Attest verdicts checked by the App API before issuing material access URLs |
| Concurrent devices | Limited by MySeed account policy and parental control |

These controls reduce copying; they cannot prevent someone from photographing a screen. The product must not claim otherwise.

## 2. SaaS packaging and entitlements

### 2.1 How customers buy

1. **Bundles**: Starter, Professional, Enterprise, Institutional.
2. **Build your own package**: core plus any modules, with capacity and support choices; the builder adds dependencies automatically.
3. **Add-ons**: any module on top of any bundle, without upgrading the whole tier.
4. **Negotiated contracts**: school groups, public institutions, self-hosted licenses.

All four produce the same thing: a set of subscription items that the resolver turns into **effective entitlements**. Code checks entitlement keys, never plan names.

### 2.2 Module catalog

| Key | Module | Depends on | Starter | Professional | Enterprise |
| --- | --- | --- | --- | --- | --- |
| `module.core` | Organization, people, enrollment, roles, audit | (required) | Yes | Yes | Yes |
| `module.academics` | Structure, subjects, teaching assignments | core | Yes | Yes | Yes |
| `module.attendance` | Attendance | academics | Yes | Yes | Yes |
| `module.timetable` | Timetable and calendar | academics | Add-on | Yes | Yes |
| `module.results` | Assessments, marks, report cards | academics | Yes | Yes | Yes |
| `module.assignments` | Assignments and submissions | academics | Add-on | Yes | Yes |
| `module.materials` | Materials library | academics | Add-on | Yes | Yes |
| `module.communication` | Announcements and parent-teacher messaging | core | Announcements only | Yes | Yes |
| `integration.myseed_connect` | MySeed Student and Parent connectivity | core | Yes | Yes | Yes |
| `module.finance` | Fees, invoices, receipts | core | Add-on | Yes | Yes |
| `module.finance_online` | Online payment adapters | finance | Add-on | Add-on | Yes |
| `module.reports_advanced` | Report builder, scheduled reports, analytics | core | Add-on | Add-on | Yes |
| `module.multi_campus` | More than one campus, cross-campus reporting | core | No | Add-on | Yes |
| `module.api` | Public API and webhooks for third parties | core | No | Add-on | Yes |
| `module.governance_plus` | Extended audit exports, custom retention | core | No | Add-on | Yes |
| `module.library`, `module.transport`, `module.hr_payroll`, `module.boarding`, `module.inventory` | Optional operations (P2) | core | Add-on | Add-on | Add-on |

Limits: `limit.students.max`, `limit.campuses.max`, `limit.staff.max`, `limit.storage.gb`, `usage.sms.monthly`, `limit.file.max_mb`. Institutional is a contract template, not a fixed list.

Rules:

- MySeed Connect is in every bundle. Students and parents never pay the school or MySeed to see their school records.
- Removing a module never deletes its data; it becomes read-only for 90 days, then export-only per retention policy.
- Plan versions are immutable once sold; existing customers keep their version until renewal.
- Overrides (trial, goodwill, contract exception) need a reason and an end date, and are audited.
- Prices are set in the console price book (ETB and USD) and are an open business decision (D5).

### 2.3 Resolver

```
effective = union(plan_version.modules, add_on_items, active_overrides.grants)
            minus active_overrides.revocations
limits    = max(plan limits, purchased capacity) unless an override sets a value
```

Resolved per organization, cached in Redis, invalidated on any subscription or override change. Self-hosted instances read entitlements from the signed license file.

## 3. Delivery plan

Milestones are gated by working, tested outcomes, not screens. Durations depend on team size and are estimated after M0.

| Milestone | Scope | Exit gate |
| --- | --- | --- |
| **M0 Foundations of the build** | Monorepo scaffold, `packages/ui` per UI rules, `packages/contracts`, Prisma base schema, CI with emoji check, Compose dev environment | `pnpm dev` runs portal, api and worker locally; CI green |
| **M1 Platform core** | Identity, sessions, MFA, tenancy, RLS, roles and permissions, entitlements resolver, audit, outbox, files, console tenant provisioning | Tenant-isolation suite passes; a tenant can be created and an owner can sign in |
| **M2 School core** | Setup wizard, structure, people, admissions and enrollment, imports, attendance, timetable and calendar | A pilot school is configured and takes attendance for a week |
| **M3 Teaching and results** | Assignments, submissions, materials library, assessments, marks workflow, report-card templates and PDF publication | A term's marks are entered, approved and published as report cards |
| **M4 MySeed Connect** | Link codes, link requests, connections, Connect API, webhooks, SDK, contract tests; Education System School Gateway built in parallel in its repository | A student and a guardian link by code and by request; materials, assignments and results reach a test app; revocation works on the next request |
| **M5 Communication and fees** | Announcements, parent-teacher messaging, SMS (Iconic SMS), fee structures, invoices, receipts, Parent app fees | A parent receives an absence alert, messages a teacher, sees an invoice and receipt |
| **M6 Apps and pilot** | Student My School area and Parent app school features and parental controls (app repositories), self-hosted package, backups and restore drill, load tests, legal review | Pilot with at least one private and one public school; all launch security tests pass |
| **M7 Expansion** | Online payments, report builder, relay connectivity, progress sharing, P2 modules by demand | Each module ships with entitlement, permissions, contract tests and docs |

### 3.1 Definition of done for any feature

- Behavior and acceptance criteria written in the issue
- Server-side validation, entitlement, permission and resource checks
- Unit and API tests, including a tenant-isolation case when tenant data is involved
- Audit events for sensitive changes
- Loading, empty, error, offline and no-permission states
- English and Amharic strings
- Light and dark mode at 360, 768 and 1280 px; keyboard and screen-reader pass
- `node scripts/check-emoji.mjs` passes
- Contract and OpenAPI updated when an API changes

## 4. Open decisions

These do not block M0 to M3, but each has a deadline.

| ID | Decision | Recommendation | Needed by |
| --- | --- | --- | --- |
| D1 | Where the Education System and apps live | Separate repositories consuming `@myseed/schoolhub-contracts` and `@myseed/schoolhub-sdk`; this repository stays SchoolHub only | Before M4 |
| D2 | MySeed Identity: new service or bridge from Noor CMS accounts | Build MySeed Identity in the new Education System and migrate existing phone accounts; keep a temporary bridge while the Noor CMS still runs | Before M4 |
| D3 | Hosting region and provider for hosted SaaS | Choose a provider with managed Postgres and point-in-time recovery, and check data residency requirements under the proclamation | Before M6 |
| D4 | Academic defaults | Validate the template in document 02, section 2 with two pilot schools | Before M2 ends |
| D5 | Prices, capacity bands, public-sector model | Set in the console price book; keep bundles few | Before M6 |
| D6 | Legal review | Ethiopian counsel reviews consent, guardian authorization, retention, data-sharing agreements and store disclosures | Before M6 |
| D7 | First payment adapters | Confirm providers schools use most (candidates: Chapa, Telebirr) and their callback and refund support | Before M5 |
| D8 | Figma audit | Map every frame of the MySeed Figma file to screens in documents 01 and 04 and record gaps | Before app work in M6 |
