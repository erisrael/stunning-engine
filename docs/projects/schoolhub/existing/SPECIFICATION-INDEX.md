# MySeedSchoolHub specification

Version 1.0, 13 October 2026. Status: approved for build planning.

MySeedSchoolHub is a multi-tenant school management SaaS for Ethiopian schools (private, public, school groups), offered MySeed-hosted or self-hosted. It is the official system of record for school operations. It connects to the **MySeed Education System** (the learning business platform that replaces the Noor CMS) so that students see their school materials, assignments, timetable, attendance and results inside the **MySeed Student** app, and guardians follow and manage their children inside the **MySeed Parent** app.

These documents consolidate the product discussion (scope, Ethiopia research, tiers, Figma review, Education System administration) into a buildable specification, and fix the integration decisions that were left open.

## Documents

| # | Document | What it answers |
| --- | --- | --- |
| 01 | [Ecosystem and system map](01-ecosystem-and-system-map.md) | Which systems exist, who owns which data, and the full navigation map of every surface |
| 02 | [SchoolHub functional specification](02-schoolhub-functional-spec.md) | Every school module, role, workflow and Ethiopian academic default |
| 03 | [Integration with the MySeed Education System](03-integration-spec.md) | Identity, school linking, Connect API, events, how students reliably reach school materials |
| 04 | [Mobile apps and parental controls](04-mobile-apps-and-parental-controls.md) | School features in the Student and Parent apps, and how parents control their children's accounts |
| 05 | [Tech stack and architecture](05-tech-stack-and-architecture.md) | Stack, repository layout, backend modules, tenancy, data model, deployment |
| 06 | [Security, SaaS packaging and delivery](06-security-saas-and-delivery.md) | Security and privacy controls, module catalog and entitlements, milestones, open decisions |
| 07 | [Build status and gaps](07-build-status-and-gaps.md) | What the code implements today, what is missing, and where code and specification disagree |
| 08 | [Additions from the Product Specification v1.0](08-product-spec-additions.md) | Proposed scope from the October 2026 PDF that documents 01 to 06 do not yet cover |

UI work follows [no-emoji-watermelon-ui.md](UI-RULES.md) without exception.

## Decisions fixed by this specification

1. **Five products, two web back offices, one integration contract.** SchoolHub (school web portal and platform console), MySeed Education System (learning admin and app backend), MySeed Student app, MySeed Parent app. MySeedSpace and the MySeed website integrate through documented APIs only.
2. **SchoolHub is authoritative for everything a school produces**: enrollment, classes, attendance, timetable, assignments, materials, marks, report cards, school fees, parent-teacher messages. The Education System is authoritative for MySeed identity, learning content, subscriptions and MySeed payments.
3. **The mobile apps talk only to the MySeed Education System API.** School data reaches the apps through a **School Gateway** in the Education System that calls the SchoolHub **Connect API** server to server. The apps never hold SchoolHub credentials and never need to know whether a school is hosted or self-hosted.
4. **School data is not copied into MySeed.** The gateway reads through, with a short cache. MySeed stores only the link mapping (MySeed user to `connection_id`) and minimal notification metadata. This keeps self-hosted schools in control of their records.
5. **A school link always requires school approval.** Approval happens either in advance (a school-issued link code delivered to a verified contact) or on request (registrar review). A phone number or name match alone never grants access.
6. **Parent control has two layers.** School-side access (what a guardian may see at school) is granted by the school in SchoolHub. MySeed-side controls (subscriptions, purchases, study limits, devices, linking consent) are set by the parent in the Parent app and enforced by the Education System.
7. **Parent-teacher messaging is stored in SchoolHub**, because teachers are school users and the messages are school records. The Parent app reaches them through the gateway.
8. **Entitlements, not plan names, gate features.** Bundles, a build-your-own package, add-ons and negotiated contracts all resolve to the same effective-entitlement set, enforced in the backend.
9. **Stack:** Next.js + TypeScript (web), NestJS on Express (API and workers), PostgreSQL with Prisma, Redis + BullMQ, S3-compatible storage, React Native (Expo) for both apps, Docker Compose for hosted and self-hosted deployment. Modular monolith first.
10. **This repository holds SchoolHub** (portal, console, API, worker, contracts, SDK). The Education System and the two apps live in their own repositories and consume `@myseed/schoolhub-contracts` and `@myseed/schoolhub-sdk` from here. See open decision D1 in document 06.
11. **AI uses the school's own key.** Every school that turns on the assistant (`module.ai_assistant`) adds its own provider key; MySeed includes no AI allowance. The platform console uses the platform's own key. Keys are stored encrypted and never shown again after saving.
12. **Online exam webcam snapshots are opt-in.** They are off by default; a school turns them on per exam with guardian consent on record. Integrity flags go to a teacher and never fail a student automatically.
13. **Teachers see survey averages and anonymized comments**, and only once a survey has the school's minimum number of responses.
14. **Domains follow the deployment.** A self-hosted school uses its own domain. A hosted school gets a subdomain of the SchoolHub domain; a custom domain on hosting needs the `feature.custom_domain` entitlement.
15. **Branding is configurable by entitlement.** By default a school's theme (including one generated from its logo) applies everywhere and a small MySeed mark stays in the footer and on documents. The `feature.white_label` entitlement removes MySeed branding.
16. **Unpaid fees block an exam admission card only when the school turns that rule on**, with a registrar override and a logged reason.
