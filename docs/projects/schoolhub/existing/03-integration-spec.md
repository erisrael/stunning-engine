# 03. Integration with the MySeed Education System

This document defines how SchoolHub and the MySeed Education System work together so that:

- a student signs in to MySeed Student once and sees their school's materials, assignments, timetable, attendance and results next to MySeed learning;
- a parent signs in to MySeed Parent once and follows every child across schools;
- each school stays in control of its records, whether it is hosted by MySeed or self-hosted.

## 1. Components

| Component | Lives in | Responsibility |
| --- | --- | --- |
| **MySeed Identity** | Education System | Phone OTP sign-in, sessions, devices, `myseed_subject_id` for every person |
| **App API** | Education System | The only API the Student and Parent apps call |
| **School Gateway** | Education System | Resolves a user's connections, calls the SchoolHub Connect API, caches briefly, receives SchoolHub webhooks, fans out notifications |
| **School directory** | Education System | Public list of SchoolHub tenants with MySeed Connect enabled |
| **MySeed Connect module** | SchoolHub | Link codes, link requests, connections, Connect API, outgoing webhooks |
| **Connect API** | SchoolHub | Server-to-server API used only by the School Gateway |
| **`@myseed/schoolhub-contracts`** | This repository | Zod schemas, OpenAPI document and event schemas shared by both sides |
| **`@myseed/schoolhub-sdk`** | This repository | Typed Connect API client and webhook verifier used by the School Gateway |

## 2. Why the apps go through the gateway

The apps never call SchoolHub directly. The reasons:

1. **One sign-in.** The apps hold only a MySeed session. There is no second account and no school password.
2. **Self-hosting is invisible to the app.** A self-hosted school may sit behind a firewall or change domains; only the gateway needs to know how to reach it.
3. **One policy point.** Device security, minimum app version, parental controls and rate limits are applied once, in the App API, before any school data is fetched.
4. **School keeps the data.** The gateway reads through and does not store school records. Revoking a link at school takes effect on the next request.

## 3. Trust setup between a school and MySeed

### 3.1 Installing the Education System on a SchoolHub deployment

Trust is set up once per SchoolHub deployment (the MySeed-hosted one, or each self-hosted one), not once per school. One call does it, and no key is copied by hand.

1. A platform administrator or developer issues a one-time **install code** in the platform console (**MySeed integration**), or on a server without console access with `pnpm connect:code`. The code is stored only as a SHA-256 hash, works once, and expires (24 hours by default, at most 7 days).
2. On the Education System server, the installer (`npx myseed-schoolhub-install`, or `installSchoolHub()` from `@myseed/schoolhub-sdk`) reads `GET /connect/v1/discovery`, generates an Ed25519 key pair, and calls `POST /connect/v1/install` with the code, its client ID, the **public** key and its webhook address. A key that includes the private part is refused.
3. SchoolHub registers the client, consumes the code, and returns the token URL, the API base, the contract version and a **webhook signing secret**, shown once. The Education System keeps the private key and the secret in its secret store.
4. From then on SchoolHub sends every event of every school that has MySeed Connect to that webhook, signed, with retries. The console shows when the client last called and whether the last delivery worked, and can send a signed `connect.ping`, change the address or events, or rotate the secret.

A school takes part when it has the `integration.myseed_connect` entitlement and its owner leaves **Administration, Integrations, MySeed Student and Parent apps** switched on. The same page shows the remaining setup steps, the gateway status and the connection counts. Switching off **Show in the app school search** removes the school from `GET /connect/v1/schools`; existing connections keep working.

### 3.2 Authentication on each call

- **Gateway to SchoolHub:** OAuth 2.0 client credentials with `private_key_jwt` (Ed25519). The gateway signs a short-lived assertion; SchoolHub returns a 5-minute access token. Every Connect API request that acts for a person also carries the acting `myseed_subject_id` in `X-MySeed-Subject`, and SchoolHub checks it against the connection on every request. `GET /connect/v1/client` returns the caller's own status, for installation checks.
- **SchoolHub to gateway (webhooks):** each delivery carries `X-SchoolHub-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">` with the client's secret. The SDK's `verifyWebhook` rejects signatures older than 5 minutes; the gateway drops repeated event IDs because deliveries retry.
- The webhook secret rotates from the console. SchoolHub signs with the new secret at once, so the gateway should check a delivery against both the old and new secret until it has stored the new one; failed deliveries retry, so none are lost in between.

## 4. Identity model

Neither side merges accounts. Links between identities are explicit records.

```
Education System                         SchoolHub
----------------                         ---------
user (myseed_subject_id, phone)          student (school record)
  |                                      guardian (school record)
  +-- school_link -----------------+     |
       (myseed_subject_id,          \    +-- connection
        tenant_ref, connection_id,   +------- (connection_id, myseed_subject_id,
        kind, status)                         kind, student_id, guardian_id?,
                                              status, access_profile)
```

- `kind` is `student` (a student viewing their own record) or `guardian` (a guardian viewing a child's record).
- One MySeed user can hold many connections: a student at one school, a guardian of three children at two schools, both at once.
- SchoolHub never receives the MySeed phone number unless the school already has it on record; the subject ID is opaque.
- The phone number is a sign-in attribute, not proof of anything at school.

## 5. Linking flows

Both flows require the school's approval. Approval is either **given in advance** by issuing a link code to a verified contact, or **given on request** by a registrar.

### 5.1 Student link with a school-issued code (recommended, P0)

1. The registrar generates link codes for a section (or a single student) in **MySeed connections, Link codes**. Codes are 10 characters, single use, valid 30 days, bound to one student record.
2. The school hands codes to students on a printed slip, or sends them by SMS to the guardian phone on record.
3. In MySeed Student: **My School, Connect your school**, enter the code.
4. App API forwards to the gateway, which calls `POST /connect/v1/link-codes/redeem` with the code and the student's `myseed_subject_id`.
5. SchoolHub validates the code (exists, unused, unexpired, student enrollment active), creates an active `connection`, marks the code used and emits `connect.connection.activated`.
6. The app shows the school and class immediately. Total time: under a minute.

### 5.2 Student link by request (P0)

1. In MySeed Student: **Connect your school**, search the School directory, then enter: full name as registered, grade, section if known, student number if known.
2. SchoolHub creates a `link_request` in the registrar queue with match suggestions (exact student number match, name and grade match).
3. The registrar approves (choosing the student record), rejects with a reason, or asks for more information. Target: handled within 2 school days; the queue shows age.
4. On approval SchoolHub creates the connection and emits `connect.connection.activated`. The app receives a push and the My School area appears.

Abuse controls: 3 open requests per user at a time, 10 per day; rejected requests are kept for audit.

### 5.3 Guardian link with a school-issued code (P0)

1. The registrar generates a guardian code for a specific guardian record, or the system sends it automatically when a guardian is added with a phone number (setting per school).
2. The code is sent by SMS **to the phone on the school's guardian record**.
3. The parent enters the code in MySeed Parent. If the parent's MySeed phone differs from the phone on record, SchoolHub requires an OTP sent to the phone on record before activating.
4. SchoolHub creates a `guardian` connection with the guardian record's access profile (document 02, section 4.13).

### 5.4 Guardian link by request (P0)

Same as 5.2, from MySeed Parent: school, child's name, grade, relationship. The registrar verifies against the guardian records and approves, choosing the access profile. If no guardian record matches, the registrar can add one (with a reason) and approve.

### 5.5 Connection lifecycle

> [!NOTE]
> Diagram source kept as text. The original is a Mermaid diagram, which the document library does not display.

```text
stateDiagram-v2
  [*] --> pending: link request created
  pending --> active: approved
  pending --> rejected: rejected
  [*] --> active: code redeemed
  active --> suspended: enrollment ended or school suspends
  suspended --> active: re-enrolled or school restores
  active --> revoked: school revokes, user disconnects, or guardian blocked
  suspended --> revoked: retention period passes
  rejected --> [*]
  revoked --> [*]
```

| Trigger | Result |
| --- | --- |
| Student transfers section within the school | Connection stays active; data follows the current enrollment |
| Student leaves the school | Connection becomes `suspended`; the app keeps showing published report cards for 12 months (school setting), nothing else |
| Student enrolls at a new SchoolHub school | New connection at the new school; the old one remains suspended |
| Guardian access profile changes | Applies on the next request; gateway cache purged |
| Guardian set to `blocked` | Connection `revoked`, open conversations closed for that guardian |
| User disconnects in the app | Connection `revoked`; school sees who disconnected and when |
| School disables MySeed Connect | All connections `suspended`; apps show "Your school has paused the connection" |

## 6. Connect API

Base path `/connect/v1`. All responses include `source: "school"`, `published_at` where relevant and `as_of` (server time). All list endpoints use cursor pagination.

### 6.1 Linking

| Method and path | Purpose |
| --- | --- |
| `POST /link-codes/redeem` | Redeem a student or guardian code |
| `POST /link-requests` | Create a link request |
| `GET /link-requests/{id}` | Request status for the app |
| `DELETE /connections/{connection_id}` | User-initiated disconnect |
| `GET /connections/{connection_id}` | Connection summary: school, campus, student display name, grade, section, year, status, access profile, enabled modules |

### 6.2 Reading school data (both kinds, filtered by access profile)

| Method and path | Purpose |
| --- | --- |
| `GET /connections/{id}/today` | Periods, attendance status, due work, new items: one call for the home screen |
| `GET /connections/{id}/timetable?week=` | Published timetable |
| `GET /connections/{id}/calendar?from=&to=` | Events and deadlines |
| `GET /connections/{id}/announcements` | Announcements for the student's audiences |
| `GET /connections/{id}/attendance?from=&to=` | Records and summary |
| `GET /connections/{id}/assignments?status=` | Published assignments with the student's submission state |
| `GET /connections/{id}/assignments/{aid}` | Detail, attachments metadata, feedback |
| `GET /connections/{id}/materials?subject=&term=` | Published materials for the student's audiences |
| `POST /connections/{id}/materials/{mid}/access` | Issue a short-lived access URL (section 7) |
| `GET /connections/{id}/results` | Published assessment results |
| `GET /connections/{id}/report-cards` | Published report cards |
| `POST /connections/{id}/report-cards/{rid}/access` | Short-lived PDF URL |
| `GET /connections/{id}/teachers` | Staff the connection may message |
| `GET /connections/{id}/invoices` | Guardian only, fees module only |

### 6.3 Writes

| Method and path | Purpose |
| --- | --- |
| `POST /connections/{id}/assignments/{aid}/uploads` | Get a presigned upload slot for a submission file |
| `POST /connections/{id}/assignments/{aid}/submissions` | Submit (idempotent; returns a receipt) |
| `POST /connections/{id}/attendance/{rid}/explanations` | Guardian absence explanation (school setting) |
| `GET /connections/{id}/conversations` | Guardian conversations |
| `POST /connections/{id}/conversations` | Start a conversation with an allowed staff member |
| `POST /conversations/{cid}/messages` | Send a message (idempotent) |
| `POST /conversations/{cid}/read` | Mark read up to a message |
| `POST /connections/{id}/invoices/{iid}/payment-intents` | Start an online payment (fees module with an adapter enabled) |
| `POST /connections/{id}/correction-requests` | Ask the school to correct a record |

### 6.4 Authorization chain on every Connect API request

SchoolHub evaluates, in order, and stops at the first failure:

1. Valid gateway access token for this tenant.
2. Connection exists, belongs to this tenant, is `active`, and its `myseed_subject_id` matches the acting subject.
3. The underlying enrollment is active (or the endpoint is allowed for suspended connections: report cards only).
4. The tenant's effective entitlements include the module (for example `module.materials`).
5. The connection's access profile allows the capability (guardian profiles only).
6. The resource is in the student's audience (section, grade, individual) and is published.

Failures return a typed error (`connection_inactive`, `module_not_enabled`, `not_permitted`, `not_found`) so the app can show the right state instead of a generic error.

## 7. How students get their school materials

This is the end-to-end path the system guarantees.

> [!NOTE]
> Diagram source kept as text. The original is a Mermaid diagram, which the document library does not display.

```text
sequenceDiagram
  autonumber
  participant T as Teacher (portal)
  participant SH as SchoolHub API
  participant OB as Outbox worker
  participant GW as School Gateway
  participant N as Notification service
  participant S as Student app
  participant ST as Object storage

  T->>SH: Upload file and publish material for Grade 7 B
  SH->>ST: Store bytes privately
  SH->>SH: Save material + outbox event (one transaction)
  OB->>GW: Webhook school.material.published (connection_ids of 7 B)
  GW->>N: Notify those connections
  N->>S: Push "New material in Mathematics"
  S->>GW: GET materials (via App API)
  GW->>SH: GET /connections/{id}/materials
  SH-->>GW: Items allowed for this student
  GW-->>S: List
  S->>GW: Open item
  GW->>SH: POST /materials/{mid}/access
  SH->>SH: Re-check chain, log access
  SH-->>GW: Signed URL (5 min) + access policy
  GW-->>S: URL + policy
  S->>ST: Download or stream
```

Details:

- **Access policy is returned with every URL**: `view_only`, `download` or `offline_allowed`. The app enforces it: `view_only` renders inside the app viewer with screen capture blocked (Android `FLAG_SECURE`, iOS capture detection), `download` allows save, `offline_allowed` stores an encrypted copy in app storage that expires when the connection is no longer active (checked at each app start when online, and after 14 days offline at most).
- **Self-hosted schools without public storage:** the access endpoint returns `delivery: "proxy"` and the gateway streams the bytes from SchoolHub to the app. The app does not need to know which mode is used.
- **Large files:** video above the tenant's limit must be linked (for example to a MySeed lesson or an approved host) rather than uploaded.
- **Withdrawn material:** disappears from lists on the next fetch; offline copies are deleted at the next online check.

### 7.1 What guarantees delivery

| Risk | Mechanism |
| --- | --- |
| Event lost after publishing | Transactional outbox: the event row is written in the same transaction as the material |
| Webhook delivery fails | Retries with exponential backoff for 24 hours, then dead-letter; sync health page in both admins |
| Push not received | Push is only a hint; the app always fetches the list from the source when the screen opens |
| Gateway cache stale | Cache TTL 60 seconds; webhook events purge affected keys immediately |
| School server unreachable (self-hosted) | App shows last cached list (on-device) with "Last updated" time and a clear offline banner; never shows an empty list as if nothing was published |
| Wrong student sees material | Authorization chain re-checked on every list and every access URL; contract and tenant-isolation tests (document 06) |
| Student cannot link | Two link methods; link-request queue with age indicator; support case routed to the school from MySeed support |
| Breaking API change | Connect API is versioned (`/connect/v1`); additive changes only within a version; a new version runs alongside the old one for at least 6 months; consumer contract tests in CI |

Service targets to monitor (engineering targets, to be confirmed after pilots): material visible in the app within 60 seconds of publication for hosted schools; 99.5 percent of Connect API requests under 800 ms at the gateway; webhook backlog under 5 minutes.

## 8. Assignment submission (write path)

1. The app requests an upload slot: `POST .../uploads` returns a presigned PUT URL (or a gateway proxy URL for self-hosted), max size and allowed types.
2. The app uploads the file, then calls `POST .../submissions` with the upload references, text answer and an `Idempotency-Key` generated when the student pressed Submit.
3. SchoolHub validates the deadline and late policy, stores the submission and returns a **receipt** (`submission_id`, `received_at`, `late: bool`).
4. The app shows "Submitted" only after the receipt arrives. Until then the item shows "Sending" and survives app restarts (queued on device). A retry with the same key never creates a second submission.
5. The teacher sees it in the submissions inbox; returning feedback emits `school.submission.returned` and the student gets a push.

## 9. Parent-teacher messaging

- Conversations and messages are stored in SchoolHub.
- The Parent app sends through the App API and gateway; the teacher reads and replies in the portal.
- New messages emit `school.message.created` (with conversation ID and recipient connection IDs only, never the text). The gateway delivers a push ("New message from Grade 7 B Mathematics teacher") and, if the parent app is open, a realtime update over the App API WebSocket.
- Lock-screen notifications never include message text by default.
- Read receipts are recorded per participant.

## 10. Notifications

SchoolHub never sends push notifications itself; it has no device tokens. The flow is always: SchoolHub event, then gateway, then notification service.

| Event | Student | Parent | Default channel |
| --- | --- | --- | --- |
| `school.material.published` | Yes | If guardian-visible | Push |
| `school.assignment.published` | Yes | Yes (digest) | Push |
| `school.assignment.due_soon` (24 h) | Yes | Optional | Push |
| `school.submission.returned` | Yes | Yes (digest) | Push |
| `school.attendance.absent` | No | Yes | Push, SMS if school enables |
| `school.timetable.published` | Yes | Yes | Push |
| `school.result.published`, `school.report_card.published` | Yes | Yes | Push |
| `school.announcement.published` | By audience | By audience | Push; SMS if urgent and enabled |
| `school.message.created` | No | Yes | Push |
| `school.invoice.issued`, `school.invoice.due_soon` | No | Yes | Push |
| `connect.connection.activated` / `suspended` / `revoked` | Yes | Yes | Push and in-app |

Parents choose per child and per category in the Parent app; quiet hours apply except to items the school marks urgent. SMS sent on a school's behalf is charged to that school's SMS allowance.

## 11. Fees and payments through the Parent app

1. Parent opens Fees, picks an invoice, taps Pay.
2. App API calls `POST .../payment-intents`; SchoolHub creates the intent with the school's own payment adapter and returns a checkout URL or USSD instructions.
3. The provider calls SchoolHub's callback; SchoolHub verifies signature, amount, currency and reference, records the payment and receipt, and emits `school.payment.confirmed`.
4. The app shows "Paid" only after that event or a status query confirms it.

School fee money goes to the school's merchant account. MySeed subscriptions are a separate checkout in the Education System. The two ledgers never mix.

## 12. MySeed learning progress shared with a school (P1)

Off by default. When a student (and, for students under 18, a guardian) turns on sharing for a specific school, the Education System pushes a weekly summary per subject (lessons completed, quiz average, time) to SchoolHub through `POST /connect/v1/connections/{id}/learning-summaries`. Teachers see it as "MySeed practice", visually separate from school marks. Turning sharing off stops future summaries and deletes stored ones.

## 13. Event envelope

All webhook events share this envelope (schema in `packages/contracts/src/events`):

```json
{
  "id": "evt_01J9...",
  "type": "school.material.published",
  "schema_version": 1,
  "occurred_at": "2026-10-13T08:15:02Z",
  "tenant_ref": "tnt_...",
  "subject": { "type": "material", "id": "mat_..." },
  "audience": { "connection_ids": ["con_...", "con_..."] },
  "data": { "subject_name": "Mathematics", "title_en": "Fractions worksheet", "title_am": "..." }
}
```

- `data` carries only what is needed to render a notification. Anything sensitive (marks, message text, attendance details) is fetched through the Connect API by the authorized consumer.
- Consumers are idempotent on `id`.
- Audiences larger than 1,000 connections are split into several deliveries.

## 14. Self-hosted connectivity

| Mode | When | How |
| --- | --- | --- |
| **Direct** (P0) | The self-hosted SchoolHub has a public HTTPS address | Same as hosted: gateway calls the Connect API; SchoolHub posts webhooks to the gateway |
| **Relay** (P1) | The school allows outbound traffic only | SchoolHub runs a connector process that keeps an outbound WebSocket to the MySeed relay; Connect API requests and responses travel over it; file access always uses proxy delivery |
| **Disconnected** | The school opts out of MySeed Connect | No data leaves the school; students and parents do not see the school in the apps |

What crosses the boundary when Connect is enabled is exactly what the Connect API returns for active connections, plus the event envelopes in section 13. Nothing else: no backups, no telemetry containing student data, no bulk exports. This list is shown to the school owner on the enable screen.

## 15. Versioning and testing the contract

- `packages/contracts` is the single source: Zod schemas generate the OpenAPI document and the SDK types.
- The Education System pins a contract version; CI in both repositories runs the shared contract test suite against a SchoolHub test instance.
- Deprecations are announced in the contract changelog with a removal date at least 6 months out.
