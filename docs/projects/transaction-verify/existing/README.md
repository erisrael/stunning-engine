# Transaction Verify

**Payment verification infrastructure for Ethiopia.**

Transaction Verify is a payment verification platform designed to help businesses confirm transactions made through Ethiopian banks, mobile wallets, and payment gateways.

It provides a standardized way to submit payment information, process supporting evidence, verify transactions through supported integrations, and communicate verification outcomes to business applications.

The goal is simple: **make payment verification reliable, traceable, secure, and easy to integrate.**

---

## Overview

Ethiopian businesses accept payments through multiple banks, digital wallets, and payment gateways. Verifying these transactions can involve manual receipt reviews, transaction reference checks, provider-specific integrations, and operational follow-ups.

Transaction Verify aims to simplify this process through a unified verification infrastructure.

The platform is designed to support:

- **Unified payment verification** — A consistent interface across supported payment providers.
- **Transaction evidence processing** — Receipt submission, OCR-assisted extraction, and evidence validation.
- **Developer-first integrations** — REST APIs, SDKs, and webhook-based workflows.
- **Verification lifecycle tracking** — Traceable requests, processing history, and outcomes.
- **Business dashboards** — Visibility into verification activity, performance, and operational issues.
- **Multi-organization architecture** — Independent organizations with appropriately isolated data and access.
- **Automated decision workflows** — Structured verification results that applications can use to determine subsequent actions.
- **Provider extensibility** — A foundation for integrating additional banks, wallets, and gateways.

Provider support and verification capabilities depend on implementation, availability, and certification status.

## Deployment Models

Transaction Verify is designed for two independently operated deployment environments.

### Myseed Verify — Internal Deployment

**Myseed Verify** is the internal deployment for Myseed Academy.

Its purpose is to support payment verification within Myseed Academy's educational ecosystem, including payment-related workflows involving students, subscriptions, and educational services.

### Transaction Verify — Commercial Deployment

The independently operated commercial deployment serves:

- Businesses and organizations using paid verification services.
- Privately invited free partners.
- Developers integrating verification into their products.
- Organizations requiring centralized verification workflows.

Commercial operations, customer access, billing, and deployment boundaries are defined separately from the Myseed Academy environment.

## How It Works

The intended core integration workflow follows five stages:

**1. Create a verification request**

The integrating application initiates a verification request using the Transaction Verify API.

**2. Submit transaction information**

The application provides the relevant transaction details and, when required, supporting payment evidence.

**3. Process and verify**

The platform processes submitted evidence and applies the available verification mechanisms for the relevant provider.

**4. Retrieve the result**

The application retrieves verification status through the API or receives supported webhook notifications.

**5. Apply the business decision**

The integrating application uses the verification outcome and its own business rules to determine whether to fulfill an order, activate a service, request further review, or take another action.

**Important:** Receipt submission and OCR extraction alone do not prove that a payment has been completed. Final acceptance must follow the applicable verification and decision rules.

## Platform Architecture

The project is organized around several major architectural responsibilities.

| Component             | Responsibility                                                    |
| --------------------- | ----------------------------------------------------------------- |
| Verification API      | Receives and manages verification requests                        |
| Evidence Processing   | Processes submitted receipts and extracts usable information      |
| Provider Integrations | Connects verification workflows to supported payment providers    |
| Verification Engine   | Coordinates checks and determines verification outcomes           |
| Webhook Delivery      | Communicates supported events to integrating applications         |
| Business Platform     | Provides organization-level management and operational visibility |
| Database              | Stores verification data, configuration, and relevant history     |
| SDKs                  | Simplify adoption across supported programming environments       |

This table describes the intended platform structure rather than a claim that every component is implemented.

See System and Repository Architecture for the detailed component boundaries, code ownership, security model, and deployment design.

## Repository Documentation

The repository includes specifications, contracts, implementation references, and delivery plans.

| Documentation                      | Description                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| System and Repository Architecture | Runtime components, repository ownership, processing, security, database gaps, and deployment boundaries                           |
| Product and UI Specification       | User journeys, permissions, dashboard requirements, screen inventory, and interface standards                                      |
| Integrations and SDKs              | API design, authentication, SDK development, release strategy, webhook handling, and integration recipes                           |
| Draft OpenAPI Contract             | Initial API contract for verification requests, evidence submission, status retrieval, and acceptance                              |
| Payments and Provider Coverage     | Supported and proposed payment providers, external payments, optional checkout, commercial billing, and certification requirements |
| Roadmap and Demo Gates             | Implementation priorities, milestones, release conditions, testing scenarios, and deliverables                                     |
| Database Model                     | PostgreSQL migration, database diagram, and verification script                                                                    |
| Tesseract OCR Adapter              | Local OCR implementation, command-line execution, and worker integration                                                           |

## Current Implementation Status

Transaction Verify is under active development. The repository combines implemented foundation components with specifications for the broader platform.

| Area                                                        | Current status                                   |
| ----------------------------------------------------------- | ------------------------------------------------ |
| PostgreSQL migrations 001 to 009 and verification script    | Implemented, tested on PostgreSQL 17             |
| Verification API (seven payment operations)                 | Implemented in the sandbox                       |
| Organization settings and accepted channels API             | Implemented in the sandbox                       |
| Catalog of 43 Ethiopian banks, wallets and gateways         | Listed; none certified yet                       |
| Workers: extract, QR, PDF text, OCR, provider lookup        | Implemented in the sandbox                       |
| Outbox and signed webhook delivery with retries             | Implemented in the sandbox                       |
| SDKs: @myseed-verify/server, -web, @myseed-verify/academy | Implemented, not yet published                   |
| Hosted payment page (light PWA, English and Amharic)        | Implemented; Amharic text is a draft for review  |
| Ethiopian calendar dates, Myseed and Kalon themes           | Implemented                                      |
| Synthetic sandbox provider                                  | Implemented                                      |
| Control panel (local system, VPS, Render, Supabase)         | Implemented                                      |
| Deploy to transactionverify.myseed.com.et (Myseed VPS)      | Built; first deploy pending                      |
| Staff console with two-step sign-in and review queue        | Implemented (Phase 3); English only so far       |
| Evidence retention job                                      | Implemented                                      |
| Refunds and reversals, statement matching, review push      | Implemented (Phase 3)                            |
| Kalon web app: landing, sign-in, sign-up, console           | Implemented (React, Tailwind, shadcn-style)      |
| Platform admin: organizations, packages, banks, invoices    | Implemented                                      |
| Dedicated installs with licenses (own server or database)   | Implemented; image publishing from CI            |
| Real bank, wallet and gateway connectors                    | Not started (Phase 3 certification)              |
| Cashier app, mobile SDK                                     | Specified (Phase 4)                              |
| Commercial deployment and billing                           | Specified (Phases 5 and 6)                       |

**Note:** Everything above runs against the synthetic sandbox provider. No real provider is connected, and nothing is production-ready until the release gates in docs/roadmap.md are met.

## Getting Started

### Run it on this computer

Requires Node.js 24 and Python 3.10+. No Docker needed.

```sh
npm ci && npm run build
npm run panel          # control panel at http://verify.localhost:8767, then follow the Overview checklist
```

Or without the panel: `npm run setup`, `npm run db:start` (leave running), `npm run db:migrate`, `npm run sandbox:seed`, `npm run dev:api`, `npm run dev:worker`. See [examples/README.md](examples/README.md). `npm run check` runs the no-emoji scan, the build, unit tests and end-to-end tests against a real PostgreSQL 17.

### 1. Explore the Architecture

Start with docs/architecture.md to understand the system boundaries, backend components, processing flow, and deployment design.

### 2. Review the API Contract

Inspect contracts/openapi.v1.json to understand the initial developer integration flow.

The draft covers the core journey of creating a verification request, submitting evidence, checking verification status, and receiving acceptance information.

### 3. Explore the Database

Follow database/README.md to review the PostgreSQL schema, apply the available migration, and use the database verification script.

### 4. Run the OCR Adapter

Follow packages/evidence/README.md for the Tesseract OCR adapter setup, local command-line execution, and worker integration instructions.

### 5. Review the Delivery Roadmap

See docs/roadmap.md for implementation sequence, test scenarios, demo requirements, and release gates.

## Developer Integration

Transaction Verify is intended to support integrations through REST APIs and SDKs, with webhook delivery for supported asynchronous workflows.

The initial API contract focuses on:

1. Creating a verification request.
2. Submitting payment evidence.
3. Retrieving verification status.
4. Receiving verification acceptance information.

Developers should use the OpenAPI contract as the reference for currently drafted endpoints and schemas.

Authentication, webhook behavior, SDK packaging, release procedures, and integration recipes are described in docs/integrations-sdk.md.

## Security and Reliability

Payment verification involves sensitive financial and operational information.

Key design priorities include:

- Secure authentication and authorization.
- Organization-level data isolation.
- Protection of API credentials and sensitive configuration.
- Traceable verification activity and audit history.
- Controlled handling of payment evidence.
- Verification integrity and duplicate-processing protection.
- Reliable processing and webhook delivery.
- Separation between internal and commercial deployments.
- Explicit handling of unverified or inconclusive transactions.

These represent architectural requirements and design objectives. Individual security guarantees must be validated against the corresponding implementations and release criteria.

## Payment Provider Coverage

The platform is designed for the Ethiopian payment ecosystem, including bank transfers, mobile wallets, and payment gateways.

Individual providers may require different verification mechanisms, integration permissions, and certification procedures.

The repository distinguishes external payment verification from optional checkout capabilities and commercial subscription billing.

For provider-specific scope, limitations, and certification requirements, see docs/payments-providers.md.

## Product Experience

Transaction Verify aims to provide a clean and professional interface for developers, businesses, and operational teams.

The product specification covers:

- Authentication and organization access.
- Role-based dashboards and permissions.
- Verification requests and transaction history.
- Evidence inspection and operational review.
- Integration and API configuration.
- Notifications, status feedback, and error handling.
- Organization management.
- Commercial subscription and partner-related workflows.

The interface follows an emoji-free design direction, with emphasis on readability, consistency, usability, and clear operational feedback.

See docs/product-ui.md for the complete UI/UX requirements.

## Development Roadmap

Development follows the milestones and acceptance criteria defined in docs/roadmap.md.

Major workstreams include the verification foundation, evidence processing, provider connectivity, developer integrations, business interfaces, security validation, and deployment readiness.

Each release should be evaluated against its documented implementation, testing, and demonstration requirements.

## Project Identity

**Transaction Verify** is the current working name of the verification platform.

**Myseed Verify** identifies the internal deployment operated for Myseed Academy.

The commercial deployment operates independently and is intended to serve external organizations and approved partners.

The two environments have distinct operational and deployment boundaries.

---

**Transaction Verify**

*Building reliable payment verification infrastructure for Ethiopia.*

**Project status:** In development

**Documentation:** Architecture · API Contract · SDKs · Roadmap

This version is suitable as a repository landing page and avoids claiming that planned APIs, dashboards, or payment-provider integrations are already live. It also preserves all eight of your existing documentation links.
