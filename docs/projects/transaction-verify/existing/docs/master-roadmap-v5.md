# **MySeed Verify master roadmap v5**

The complete SaaS, built in phases you can keep improving, with a PWA that adapts to every device

Prepared 11 November 2026\. This is the single source of phase numbers. The earlier documents (roadmap v3, receipt reading specification) supply detail; where they conflict with this one, this one wins. Starting-point statuses come from your Kalon Plan v2 and your five design documents (architecture, integrations and SDKs, payments and providers, product and UI, roadmap) and stay unverified until the gap audit in Phase 0\.

## **The system in one page**

MySeed Verify is one platform that verifies incoming payments for every organization on it. MySeed academy is organization number one, every customer is another organization, and all of them use the same code, console and rules. MySeed uses it and sells it as the same product.

### **What counts as a transaction**

A transaction is any incoming payment that someone must confirm before acting on it. Each organization defines its own **purposes**: subscription fee, installment, donation, campaign contribution, restaurant bill, order, invoice. A purpose sets the amount rule (fixed or open), the approved receiving accounts, what happens on acceptance, and which receipt or acknowledgment is issued. Outgoing payments, stored balances and payouts are outside this scope and need separate provider and regulatory review.

### **The layers**

| Layer | Holds | Used by |
| :---- | :---- | :---- |
| 1\. Platform control plane | Organizations, packages, entitlements, billing, method registry, feature flags, support access, platform audit | MySeed operators |
| 2\. Organization workspaces | Branches, people, roles, receiving accounts, purposes, policies, branding, keys, webhooks | Each customer, MySeed academy included |
| 3\. Transaction engine | Payment requests, evidence, claims, observations, acceptance, allocations, adjustments, reconciliation | Shared by all organizations |
| 4\. Method and connector layer | Banks, wallets, gateways, templates, approved links, certification | Provider administrators; every organization picks from it |
| 5\. Reader layer | Link, live scan, image search, OCR, cross-checks | The engine and all client surfaces |
| 6\. Client surfaces | Payer page, cashier PWA, staff and admin consoles, developer portal, SDKs, API | People and customer systems |
| 7\. Operations | Monitoring, backups, restore, status page, runbooks | MySeed operations |

### **Three ways to run the same system**

Shared platform (default, lowest cost), dedicated database (stronger isolation, per-organization backup and restore), or a dedicated install on the customer's own server under a signed licence. The code, console, packages and methods are identical; only where the data lives changes.

### **What changes from your five design documents**

| Topic | Your documents say | Unified system |
| :---- | :---- | :---- |
| Deployments | Separate deployments for Myseed, the commercial service and sandbox, each with its own database, storage and keys | One platform with tenants. MySeed academy is an organization. Sandbox is an environment mode per organization. A dedicated database or install is a tier that any organization, MySeed included, can be moved to |
| Consoles | Myseed console, commercial console, partner administration and platform operations as separate surfaces | One organization console driven by role and package, and one platform console for MySeed operators |
| Billing | A separate billing service with its own records | A module of the control plane; subscription invoices stay in their own ledger, apart from customers' verified payments |
| Free partners | A private grant with limits | A package type with waiver, expiry and limits, enforced by the same entitlement service |
| Providers | A coverage register kept as a research list | A method registry managed in the console, with templates and per-organization enablement |
| Roadmap | Six stages | Phases 0 to 12 below. Stages 1 and 2 are built; stage 3 closes in phases 2 and 3; stages 4 to 6 spread across phases 4 to 11 |

**Decision to confirm.** Your architecture document kept MySeed's data apart from commercial customers by using separate deployments. One platform puts them on the same system. Isolation tests from Phase 1 protect each organization, and MySeed can be moved to its own dedicated database in Phase 12 if you want its data fully separate. I recommend one platform.

### **What is missing today to make it a SaaS**

Your engine already covers claims, allocations, observations, job leases, rate windows, acceptance events and signed webhooks. The gaps are everything around it.

| Area | Already in your documents | Missing | Phase |
| :---- | :---- | :---- | :---- |
| Organizations | Organization and branch scoping, approved receiving accounts, partner grants | Registry, lifecycle states, applications and approval, ownership transfer, an organization directory with actions | 1, 6 |
| Admin control | Platform operations screen (queue age, provider availability, audit history), partner administration | Packages and entitlements enforced in API and workers, overrides, feature flags, suspension controls, support access grants, platform roles, usage and health per organization | 6 |
| Packages and billing | Open pricing decisions; a list of billing records to add | Versioned packages, metering, subscriptions, dunning, credits, separate ledgers | 6, 7 |
| Identity | Staff sign-in through an identity provider; roles for administrator, operator, reviewer, platform operator, developer | Platform and organization roles kept separate, invitations, branch scopes, sessions and devices, single sign-on per organization | 1, 12 |
| Methods | Coverage register fields and four coverage states | A registry managed in the console, templates and approved links as data, per-organization enablement, certification harness | 2 |
| Purposes | Subscription, donation, POS and commercial examples | A purpose catalogue per organization with amount rules, fulfillment actions and templates | 2, 5 |
| Receipt reading | QR, link and PDF text first, then OCR | Method-first flow, live scan, image search, claim cross-checks, vision second reader | 3 |
| PWA | Submission, cashier and console screens | Adaptive layouts, three-layer customization, device profiles, install and offline | 4 |
| Developer platform | HTTP surface, SDK plan, webhooks | Portal, versioning policy, per-organization sandbox, replay tools | 8 |
| Data lifecycle | Retention and deletion named as release gates | Per-organization retention, export, deletion proof, offboarding | 10 |
| Engine gaps listed in the architecture document | Upload reservations, receiving-account approvals, per-check observations, public status projection, delivery history, adjustments | Built into phases 1 to 3 and 7 as the matching features arrive | 1 to 3, 7 |

## **1\. How this is built so it can grow**

Six rules apply to every phase. They are what let you add the fiftieth bank or the tenth package without a rewrite.

1. **Configuration over code.** Banks, wallets, receipt templates, packages, limits, feature flags, message texts and themes are data in the control plane, versioned and auditable. Adding one is an entry plus tests, not a release.  
2. **Tenant first.** Every row, file, job, log line and cache key carries the organization. MySeed academy is organization number one on a normal package. No code path says if MySeed.  
3. **Entitlement first.** Every API call and worker job asks the entitlement service. Hiding a button is never enforcement.  
4. **Contract first.** The OpenAPI contract, reason catalog and event schemas are written before the code that uses them, and generate the SDK types and test fixtures.  
5. **Every phase ships something usable** and ends with a gate: a demo that anyone can run and tests that prove it.  
6. **Everything is versioned:** plans, templates, connectors, API, message catalogs, migrations. Old versions keep working until their retirement date.

## **2\. The complete SaaS mechanism map**

This is the full list of mechanisms the product needs. Use it as the checklist when you improve the plan: anything not on this table is not yet planned.

| \# | Mechanism | What it covers | Starting point | Phase |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Tenancy and registry | Tenant identity, routing, isolation, row-level security | Built (shared database, scoped queries) | 1 |
| 2 | Organizations and branches | Profile, branches, lifecycle states, ownership transfer | Partial | 1 |
| 3 | Identity and access | Users, invitations, roles, branch scopes, two-step sign-in, sessions, devices, single sign-on | Built (basic) | 1, 12 |
| 4 | Packages and entitlements | Versioned plans, limits enforced in API and workers, overrides, feature flags | Partial | 6 |
| 5 | Metering | Usage ledger, allowances, overage, usage alerts | Partial | 6 |
| 6 | Billing | Subscriptions, invoices, payment, dunning, credits, tax settings | Partial | 7 |
| 7 | Method registry and connectors | Banks, wallets, gateways, templates, certification, coverage status | Partial (43 listed, all researching) | 2 |
| 8 | Verification engine | Requests, matching, acceptance, adjustments, refunds | Built | keep |
| 9 | Receipt reading | Link, live scan, image, OCR, claim, cross-checks | Partial | 3 |
| 10 | Review and cases | Queue, assignment, comments, due times, escalation | Partial | 5 |
| 11 | Developer platform | API versions, keys, webhooks portal, SDKs, sandbox, docs | Engine built, portal missing | 8 |
| 12 | Notifications | Push, email, SMS, in-app inbox, preferences | Partial (staff push) | 5, 9 |
| 13 | Reports and reconciliation | Dashboards, exports, statement matching, scheduled reports | Partial | 9 |
| 14 | Audit and compliance | Append-only audit, access reviews, policies, evidence of controls | Audit built | 10 |
| 15 | Platform admin console | Organizations, packages, methods, invoices, licenses, health | Built (pages) | 6 |
| 16 | Organization console | Payments, review, accounts, deliveries, settings | Built (thin) | 5 |
| 17 | PWA surfaces | Payer, cashier, staff, organization admin, platform admin, developer | Partial (hosted page) | 4 |
| 18 | Branding and white label | Logo, colors, names, domains, templates | Partial | 4, 12 |
| 19 | Localization | Amharic, English, Ethiopian calendar, number formats | Partial | 4 |
| 20 | Support and trust | Tickets, time-limited support access, status page, notices | Missing | 6, 11 |
| 21 | Onboarding and business verification | Sign-up, review, setup wizard, go-live checklist | Partial | 6, 11 |
| 22 | Data lifecycle | Retention, export, deletion, offboarding | Partial (retention job) | 10 |
| 23 | Observability and operations | Monitoring, alerts, backups, restore drills, capacity | Partial | 10 |
| 24 | Deployment tiers | Shared, dedicated database, dedicated install | Dedicated install built | 12 |
| 25 | Partners and channels | Free partners, referral, reseller, marketplace | Partial (free partners) | 12 |
| 26 | Public site and documentation | Landing, pricing, docs, changelog | Partial | 11 |
| 27 | Transaction purposes and workflows | Per-organization purposes (subscription, installment, donation, bill, order, invoice): amount rules, receiving accounts, fulfillment actions, receipt and acknowledgment templates | Partial (payment requests carry a purpose) | 2, 5 |

## **3\. Many banks and wallets without rebuilding**

You are right that the number of channels is large and keeps growing. The design treats each channel as a registry entry, never as code in the core.

### **3.1 A method is data**

Each method in the registry has: name and logos, type (bank, wallet, gateway), country, currency, **capabilities** (accepts link, has QR, has receipt image template, has authorized lookup, has statement import), **template** (fields, date format, reference pattern, QR type, OCR zones, amount rules), **approved links** (scheme, host, port, path), **connector** (version and credentials reference), **fixtures**, **status** (researching, testing, supported, unavailable), and **owner** and last verified date.

### **3.2 Four ways a channel can be integrated**

| Tier | Method | Result |
| :---- | :---- | :---- |
| A | Authorized lookup API or merchant channel | Fully automatic decision |
| B | Official receipt link or QR with authorized lookup | Fully automatic decision |
| C | Receipt reading with the organization's own statement or account feed matched later | Automatic after the feed confirms; review until then |
| D | Evidence kept, staff review only | Manual; no coverage claim |

A channel starts at D on day one, so it can be offered immediately and honestly, and moves up as authorization and fixtures arrive.

### **3.3 Adding a channel (the repeatable checklist)**

1. Create the registry entry (status researching). 2\. Request written authorization and credentials. 3\. Collect 30 real samples per receipt version and record what each code contains. 4\. Write the template and approved links. 5\. Build fixtures for success, wrong recipient, wrong amount, duplicate, pending, timeout, source change. 6\. Run the certification harness. 7\. Review and set status supported; the public coverage page updates itself. 8\. Monitor accuracy and receipt-format changes.

### **3.4 Waves**

| Wave | Channels | When |
| :---- | :---- | :---- |
| 1 | MySeed academy accounts: CBE, telebirr, Awash, Dashen, Bank of Abyssinia, Coopbank | Phases 2 and 3 |
| 2 | CBE Birr, M-PESA, Kacha, YaYa and the next most requested | Phases 6 to 8, by customer demand |
| 3 | Gateways such as Chapa for hosted checkout | Phase 8 |
| 4 | Remaining registered banks and issuers, catalogued by issuer and channel | Phase 12 |

Waves 2 to 4 are ordered by customer requests and by what providers authorize, not by a fixed date.

## **4\. The PWA: adaptive, customizable, not a plain app**

There are six surfaces on one shared design system and one shared scanner and reader library.

| Surface | Who | Character |
| :---- | :---- | :---- |
| Payer | Customers, students, donors | Light, opens from a link, one task, installable if the person wants |
| Cashier | Waiters, shop staff | Installable, fast, one-handed, terminal mode |
| Staff | Reviewers, finance | Dense, keyboard friendly, push alerts |
| Organization admin | Owners, admins | Setup, people, branding, billing |
| Developer | Integrators | Keys, webhooks, logs, sandbox and live always labeled |
| Platform admin | MySeed operators | Control plane with a visible platform label |

### **4.1 Adapting to the device**

The app detects the device class and its capabilities, and chooses the layout and behavior. It never makes a phone use a shrunk desktop layout.

| Device class | Navigation | Layout |
| :---- | :---- | :---- |
| Phone, portrait | Bottom tab bar, large primary action in the thumb zone | Cards instead of tables, bottom sheets for filters and detail |
| Phone, landscape | Bottom bar becomes a side rail | Camera view gets the full height; controls at the edges |
| Tablet | Navigation rail | Two panes: list and detail side by side |
| Desktop | Collapsible sidebar, command palette, keyboard shortcuts | Tables, side-by-side evidence and provider facts |
| Large counter screen or kiosk | Minimal, locked to one flow | Very large amount and result, high contrast |
| Foldable or resizable window | Follows the available width live | Layouts respond to container size, not only to device type |

Techniques: container queries so components adapt to their space; safe-area insets for notches; display-mode awareness (browser tab, installed window, full screen); a custom title area on installed desktop windows where the platform allows it.

**Capability detection and graceful steps.** The app asks what the device can do and picks the best path: built-in barcode detector or the JavaScript decoder; hardware zoom and torch where offered; vibration, screen wake lock, share target, push and badging where supported. Each missing capability has a stated alternative. Known limits (for example, iPhone has no built-in detector and weaker zoom control, and push only after install) are handled by design, not by error messages.

**Performance classes.** Low memory, slow network or data-saver mode switches the app to lighter animation, smaller images, a lower scan resolution and fewer background tasks. A budget applies: first load of the payer page small enough to be usable on a mid-range Android phone on a slow mobile connection (targets in 4.5).

**Input adaptation.** Touch, keyboard, camera and hardware barcode wands that behave like a keyboard are all supported on the cashier surface.

### **4.2 Customization in three layers**

| Layer | Who sets it | What can be changed |
| :---- | :---- | :---- |
| Platform (fixed) | MySeed | Status colors and words, accessibility floors, reason catalog, security behavior |
| Organization | Owner or admin | Logo, brand color through the contrast gate, display name, welcome text, default language and calendar, payer page layout, receipt and email templates, which home widgets each role sees, custom domain later |
| Person | Each user | Light, dark or follow the device; density (compact, comfortable, spacious); text size; high contrast; reduced motion; language and calendar; left- or right-handed layout; sound and vibration on scan; default method shortcuts; home screen widgets and their order; saved views |
| Device | Admin or the device itself | Device profile: personal phone, shared cashier terminal, kiosk; assigned branch; auto-lock time; shared-device sign-in by short code; scan preferences |

The theme engine derives the whole palette from the logo color, then checks contrast and refuses unreadable results. Status colors stay fixed so success and failure always look the same in every organization.

### **4.3 Install, offline and updates**

* **Per-organization manifest and icons** generated from the logo (including maskable icons), with name, theme color and start page from the organization.  
* **Shortcuts** from the home screen icon: Scan receipt, New bill, Review queue.  
* **Share target** so a receipt image or link shared from another app opens in the right screen.  
* **Offline:** the shell and message catalogs load without a network; a captured code is held as Not sent, encrypted, for up to 24 hours; nothing is ever shown as paid offline.  
* **Updates:** a notice that a new version is ready; never reload during a submission.  
* **Push:** categories (review needed, assignment, delivery failed, invoice) with per-person preferences; payloads carry counts, never names or amounts.

### **4.4 Feel**

Feedback is words first, then color and line icons (no emoji). Scan success gives a short vibration and an optional sound; failure gives a distinct pattern and an explicit instruction. Motion explains change (a result sliding in, a sheet opening) and is off under reduced motion. Skeleton screens instead of spinners. Large amounts in tabular figures. Ethiopic text uses a proper font with adequate line height; dates can show the Ethiopian calendar.

### **4.5 Quality gates for the PWA**

| Gate | Target to start with |
| :---- | :---- |
| Device test matrix | Low-end Android, mid-range Android, iPhone SE class, current iPhone, tablet, desktop Chrome, Edge, Safari and Firefox, one foldable or resizable window |
| First load, payer page | Interactive in about 3 seconds on a mid-range phone over a slow connection |
| Responsiveness | Interactions respond in 200 ms or less on mid-range phones |
| Accessibility | WCAG 2.2 AA; full keyboard path; screen reader checked on the scan and result screens |
| Scan | 95 percent read rate on the sealed photo set; camera denial never loses typed data |
| Install | Installable on Android and iPhone; manifest, icons, offline page and update flow pass checks |
| Languages | English and Amharic reviewed; no fallback text visible |

## **5\. The phases**

Each phase lists what is built, the exit gate (all must be true), the demo and the guides delivered. The line Improve here marks where you should add detail first.

### **Phase 0: Reset and foundations**

| Build | Detail |
| :---- | :---- |
| Gap audit | Mark every row of the mechanism map as Built, Partial or Missing by testing the live system |
| Naming | MySeed Verify everywhere: product, themes, package scope, SDK names, docs |
| Decision log | Record decisions as short entries with owner and date |
| Config and flags | One place for feature flags and settings, with audit |
| Design system seed | Tokens, components, device classes and customization layers from section 4 |

Exit gate: audit complete and ranked; names changed; decision log started. Demo: audit walkthrough. Guides: roadmap owner guide, contribution rules. Improve here: scoring of the gaps.

### **Phase 1: Tenant core**

| Build | Detail |
| :---- | :---- |
| Registry | Immutable tenant id, lifecycle states, routing metadata |
| MySeed as organization 1 | Normal package, users and keys; remove any special cases |
| Isolation | Row-level security, cross-tenant tests for API, exports, files, queues, logs |
| Access | Organization and platform roles kept separate, branch scopes, invitations, two-step sign-in, session and device list |
| Audit | Append-only audit with reason codes |
| API keys | Scoped, rotatable, labeled sandbox or live |
| Unification | Move MySeed academy and any commercial organizations onto the one platform; sandbox becomes an environment mode per organization with synthetic providers and isolated data; a dedicated database or install stays available as a tier |

Exit gate: a negative isolation test suite passes on every release; suspending an organization stops keys, sessions and sign-in. Demo: two organizations side by side. Guides: access and roles guide. Improve here: role matrix.

### **Phase 2: Method registry and connector framework**

| Build | Detail |
| :---- | :---- |
| Registry | Section 3.1 as tables and admin screens, with versions |
| Template format | Data format for fields, dates, patterns, zones, QR types, approved links |
| Connector contract | Capabilities, quotas, circuit breakers, failure modes, credential references |
| Certification harness | Fixture runner with the standard failure cases |
| Sandbox provider | Synthetic responses for every outcome |
| Wave 1 methods | Registered at tier D, moving up as authorization arrives |
| Per-organization methods | Enable or disable per organization and package; receiving accounts per method |

Exit gate: a fake bank is added by data only and certified by the harness; coverage page reads from the registry. Demo: add a new method in an afternoon. Guides: method onboarding runbook, template guide. Improve here: capability list.

### **Phase 3: Receipt intelligence**

As specified in the receipt reading specification, section 13: method chosen first; link route; live scan; image route; template OCR; vision second reader as claim only; cross-checks; decision rules; zero wrong accepts.

Exit gate: targets in section 9.2 of that specification met on the sealed set for the Wave 1 methods that have samples. Demo: link, scan and photo of the same payment give one acceptance. Guides: reader developer guide, format register pages. Improve here: new templates and fixtures.

### **Phase 4: PWA design system and surfaces**

| Build | Detail |
| :---- | :---- |
| Adaptive shell | Device classes, navigation patterns, container queries, safe areas |
| Customization engine | Platform, organization, person and device layers (4.2); theme from logo with contrast gate |
| Payer surface | Method choice, three routes, results with the full reason catalog |
| Cashier surface | Method picker, live scan, terminal mode, device profiles, shared-device sign-in |
| Install and offline | Per-organization manifest and icons, shortcuts, share target, Not sent queue, update flow |
| Push and badges | Categories and preferences |
| Localization | Amharic and English, Ethiopian calendar, number formats |
| Quality | Device matrix and gates in 4.5 |

Exit gate: all gates in 4.5; two organizations show different branding on the same device; cashier terminal mode locks to one flow. Demo: the same app on a phone, a tablet and a desktop window, each in its own layout. Guides: PWA design guide, cashier quick guide, theming guide. Improve here: widget library and presets.

### **Phase 5: Console, review and cases**

Saved views, assignment, comments and mentions, due times and escalation, notification center, bulk actions, keyboard navigation, dashboard widgets, payment detail timeline with claim panel, organization setup wizard, branches and receiving accounts.

Exit gate: two reviewers clear a queue for a day without duplicate work; exports obey role permissions. Demo: review day. Guides: staff and reviewer guides. Improve here: automation rules for routing cases.

### **Phase 6: Platform admin and packages**

| Build | Detail |
| :---- | :---- |
| Entitlement service | One call used by API and workers; limits, features, methods, branches, users, retention, support level |
| Packages | Versioned and immutable once assigned; rules to grandfather or migrate at renewal |
| Overrides and flags | Per-organization overrides with expiry; feature flags by organization, package and percentage |
| Metering | Usage ledger, allowances, alerts at 80 and 100 percent |
| Organization review | Application, business verification checklist, risk notes, approve or reject with reason |
| Support tools | Time-limited support access visible to the customer, break-glass with approval, notices |
| Platform roles | Owner, operations, provider admin, finance, security auditor, support |
| Health | Queue age, provider availability, delivery failures, per-organization usage |
| Organization directory | Search and filter every organization; detail page with package, enabled methods, users, usage, health, notes and timeline; actions to approve, suspend, reinstate, change package, grant support access, reset the owner, export and offboard, each with a reason and an audit entry |

Exit gate: an organization over its limit is blocked or flagged by both API and workers; a package change leaves existing subscriptions alone unless its rule says so; support access appears in the customer's audit view. Demo: approve, package, limit and suspend a test organization. Guides: platform admin guide, entitlement catalogue, support access policy. Improve here: package templates and overrides.

### **Phase 7: Billing and monetization**

Subscriptions with trial, active, past due, grace, suspended; monthly invoices from the usage ledger; base fee, allowance, overage and add-ons; discounts, credits and partner waivers; invoice paid through MySeed Verify itself; dunning messages; tax and numbering settings after finance review; separate ledgers for subscription invoices, provider fees, refunds and credits; customer billing page.

Exit gate: running a month twice produces one invoice; a failed payment moves through grace to suspension and back after settlement; finance can reconcile invoices to payments. Demo: a customer lifecycle from trial to paid invoice. Guides: billing rules, finance runbook. Improve here: pricing experiments by package version.

### **Phase 8: Developer platform**

Stable versioned API with changelog and deprecation rules; developer portal with keys, webhook endpoints, delivery attempts, replay, API logs; SDKs for server, web and mobile published under one package scope; sandbox with synthetic channels; quickstarts and examples that run in tests; embeddable scan and payment components; batch intake with fair scheduling.

Exit gate: a fresh developer installs an SDK and receives a signed webhook in the sandbox in under an hour with only the docs. Demo: that session, timed. Guides: API reference, webhook guide, SDK quickstarts. Improve here: more SDK languages.

### **Phase 9: Notifications, reports and reconciliation**

Email and SMS templates per organization with preview; in-app inbox; per-person preferences; dashboards with trends; scheduled and on-demand exports; bank statement import and matching; refund and reversal reports; accountant exports.

Exit gate: statement matching confirms or flags every payment in a test month; reports match the ledger to the cent. Demo: month-end close. Guides: finance guide, report catalogue. Improve here: report builder.

### **Phase 10: Data lifecycle, security and operations**

Retention policies per organization, export, deletion and offboarding workflow; encryption review and key rotation; privacy and data handling note including external model use; penetration test and fixes; monitoring and alerts for queue age, delivery backlog, error rate and provider availability; backups, restore drills, incident exercise; capacity plan and a move off a shared server when load demands it; status page.

Exit gate: restore drill timed and signed off; a deleted organization's data is removed and proven; load and security reviews signed. Demo: restore into a clean environment. Guides: runbooks, incident guide, offboarding guide. Improve here: service level targets by package.

### **Phase 11: Public launch**

Public site with pricing generated from packages; sign-up to first verified payment wizard with go-live checklist; documentation site and changelog; support desk and response targets; public coverage page; launch communications; customer success playbook.

Exit gate: three outside organizations onboard without help. Demo: sign-up to invoice. Guides: customer onboarding, support playbook. Improve here: onboarding conversion measures.

### **Phase 12: Scale and tiers**

Dedicated database per organization with provisioning, migration, backup and restore; dedicated deployments with signed licenses and upgrades; single sign-on (OIDC and SAML); custom domains and white label; reseller and partner programs; rule engine for automation; more connector waves; usage-based pricing options.

Exit gate for dedicated database: provisioned, migrated, backed up, restored and upgraded without affecting any other organization.

## **6\. How to keep improving this plan**

| Rule | How |
| :---- | :---- |
| One owner per phase | Name a person; they keep the exit gate honest |
| Items have a priority | Must, should or could; only musts block a gate |
| Changes go through the decision log | A short entry: what changed, why, who decided |
| Review every 4 weeks | Re-rank phases using customer requests, provider authorizations and the incident list |
| Scope moves, gates do not | A feature may move to a later phase; a gate is never weakened without a recorded decision |
| Measure | Per phase: lead time, escaped defects, wrong accepts (always zero), review rate, scan success, support tickets |

## **7\. Risks**

| Risk | Level | Response |
| :---- | :---- | :---- |
| Provider authorization is slow or refused | High | Start requests in Phase 0; tier D keeps every channel honest and usable |
| Receipt formats change | High | Template versions, fixtures, change alerts, last verified date |
| Scope: 27 mechanisms is large | High | Phases are ordered by what makes MySeed live first; defer by moving items, not by lowering gates |
| Single shared server | Medium | Capacity plan in Phase 10; move earlier if load or incidents demand it |
| PWA variety across devices | Medium | Device matrix, capability detection, fallbacks designed in |
| Cross-tenant exposure | High | Isolation tests on every release from Phase 1 |
| Pricing not decided | Medium | Needed before Phase 7; package versions allow changes later |

## **8\. First actions**

1. Run the gap audit against the live system and mark the mechanism map.  
2. Confirm the name change and package scope.  
3. Name a phase owner for each of phases 0 to 3\.  
4. Send authorization requests to the Wave 1 providers and start the sample collection.  
5. Decide the team and who owns each phase.  
6. Pick the device test matrix and buy or borrow the phones.

Two things I can build next if you want them: a clickable design prototype of the adaptive PWA (phone, tablet and desktop layouts with the customization panel), and a platform admin console prototype showing packages, entitlements and organization lifecycle.
