# MySeed Academy Official Website — Master Stage Map & Implementation Plan

**Product:** MySeed Academy Official Website  
**Specification Reference:** Master Product, Technical, Architecture, Design, SEO, Search, Admin, Integration & Development Specification  
**Architecture:** Unified TypeScript Modular Monolith (Express.js REST API + Next.js 14+ Frontends + PostgreSQL + Prisma ORM + Redis)  
**Interfaces:** Public Portal (`apps/web`) + Secure Admin Console (`apps/admin`) + Unified Express Core API (`services/api`)  
**Languages Tier 1 (Mandatory Explicit CMS Fields):** English (`en`) & Amharic (`am`)  
**Languages Tier 2 (Automated Translation from English + Manual Override):** Spanish (`es`), French (`fr`), Arabic (`ar` - RTL), Mandarin Chinese (`zh`), Hindi (`hi`), Portuguese (`pt`), Russian (`ru`)  
**Compliance Standards:** WCAG 2.2 AA Accessibility & Universal Responsive Design (Mobile-First 320px to 4K Ultra-Wide)  
**Design Foundation:** Watermelon UI Component Architecture with MySeed Brand Adaptation  

---

## 1. Executive Summary & Core Engineering Tenets

The MySeed Academy Official Website serves as the institutional digital anchor for the MySeed ecosystem. As established in the master specification, this platform is **content-driven, searchable, SEO-optimized, multilingual, configuration-driven, and modular**.

### Core Architecture Tenets
1. **Clear System Boundary:** No duplication of the customer support mini-app (no ticket dispatching, support agent queues, or customer care session managers). Support on the website redirects to WhatsApp, Telegram, or provides FAQ/Knowledge Base and AI chatbot triage.
2. **Dual-Tier Multilingual Engine:**
   * **Tier 1 (Bilingual Native Core):** English (`en`) and Amharic (`am`). In the CMS, every editable content entity (pages, posts, team, impact, FAQs, chatbot intents) has dedicated, mandatory fields for both English and Amharic.
   * **Tier 2 (7 Global Languages via Automated Translation):** Spanish (`es`), French (`fr`), Arabic (`ar`), Mandarin Chinese (`zh`), Hindi (`hi`), Portuguese (`pt`), Russian (`ru`). These are automatically translated from the English canonical source using a background translation pipeline, cached in the database, with an optional admin override capability and instant English fallback.
   * **Directionality Support:** Native bidirectional layout switching with full RTL (`dir="rtl"`) support for Arabic and LTR (`dir="ltr"`) for Latin and Ethiopic scripts.
3. **Universal Accessibility (WCAG 2.2 AA) & Mobile-First Responsiveness:**
   * Accessible for individuals with visual, hearing, motor, and cognitive disabilities (keyboard navigation, high contrast, screen-reader ARIA live regions, focus rings, reduced motion).
   * Fully responsive without breakpoint clipping across 320px smartphones, foldables, tablets, laptops, and ultra-wide desktops.
4. **Watermelon UI Architectural Adaptation:**
   * Leverages Watermelon UI’s battle-tested component UX and layout blocks, mapped into a first-party `packages/ui` wrapper library (`MySeed*` components).
   * Token injection ensures the final product is authentically **MySeed**, not a generic template clone.
5. **Modular Monolith First:** Built in **Express.js with TypeScript** and domain isolation. Prevents premature microservice overhead while enabling future service extraction.
6. **OpenAPI as the Source of Truth:** Code and API contracts are synchronized. The Developer Platform automatically generates interactive docs directly from OpenAPI definitions in CI/CD.
7. **Provider-Independent Abstractions:** Email (`EmailProvider`), Payments (`PaymentProvider`), Storage (`StorageProvider`), AI (`AIProvider`), Translation (`TranslationProvider`), and Search (`SearchProvider`) interact through clean internal TypeScript interfaces.
8. **Future-Proof RBAC:** Super Admin possesses wildcard permissions (`system:*`), preventing database migration lockouts when new modules emerge. Dedicated Developer role with zero access to sensitive payment credentials or donor PII.

---

## 2. Multilingual & Localization Architecture

### 2.1 Language Matrix

| Tier | Language | Code | Script / Direction | CMS Requirement | Translation Source |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tier 1 (Native)** | English | `en` | Latin / LTR | Mandatory explicit field | Native authoring (Canonical) |
| **Tier 1 (Native)** | Amharic | `am` | Ethiopic (Ge'ez) / LTR | Mandatory explicit field | Native authoring (Canonical) |
| **Tier 2 (Global)** | Spanish | `es` | Latin / LTR | Auto-populated with override | Auto-translated from `en` |
| **Tier 2 (Global)** | French | `fr` | Latin / LTR | Auto-populated with override | Auto-translated from `en` |
| **Tier 2 (Global)** | Arabic | `ar` | Arabic / **RTL** | Auto-populated with override | Auto-translated from `en` |
| **Tier 2 (Global)** | Mandarin Chinese | `zh` | Simplified Han / LTR | Auto-populated with override | Auto-translated from `en` |
| **Tier 2 (Global)** | Hindi | `hi` | Devanagari / LTR | Auto-populated with override | Auto-translated from `en` |
| **Tier 2 (Global)** | Portuguese | `pt` | Latin / LTR | Auto-populated with override | Auto-translated from `en` |
| **Tier 2 (Global)** | Russian | `ru` | Cyrillic / LTR | Auto-populated with override | Auto-translated from `en` |

---

## 3. Master 22-Phase Stage Map

```text
flowchart TD
    subgraph Foundation ["Stage Group 1: Foundations (Phases 0 - 4)"]
        P0["Phase 0: Discovery & Boundary Audit"] --> P1["Phase 1: Monorepo & Express Core API Architecture"]
        P1 --> P2["Phase 2: Watermelon UI & Accessibility Design System"]
        P1 --> P3["Phase 3: Database, Prisma & Multilingual Translation Engine"]
        P2 & P3 --> P4["Phase 4: Auth, RBAC (system:*) & Admin Skeleton"]
    end

    subgraph ContentAndPublic ["Stage Group 2: Core Platform & Content (Phases 5 - 7)"]
        P4 --> P5["Phase 5: CMS Engine (Bilingual Fields) & Media Library"]
        P5 --> P6["Phase 6: Public Website Foundation (Dynamic 16-section Home)"]
        P6 --> P7["Phase 7: About, Learning & Resource Content Hubs"]
    end

    subgraph IntelligenceAndDiscovery ["Stage Group 3: Intelligence & Reach (Phases 8 - 10)"]
        P7 --> P8["Phase 8: Multilingual Search Engine & Synonyms"]
        P7 --> P9["Phase 9: Technical SEO & Schema.org Infrastructure"]
        P8 & P9 --> P10["Phase 10: Hybrid AI Chatbot, Knowledge Base & Support Redirects"]
    end

    subgraph OperationsAndMarketing ["Stage Group 4: Engagement & Operations (Phases 11 - 15)"]
        P10 --> P11["Phase 11: Engagement Workflows & Request Triage"]
        P11 --> P12["Phase 12: Donations, Campaigns & Payment Providers"]
        P11 --> P13["Phase 13: Account-Free Newsletter & Email Engine"]
        P12 & P13 --> P14["Phase 14: Integration Center & Encrypted Secret Vault"]
        P14 --> P15["Phase 15: Developer Platform, OpenAPI Automation & System Health"]
    end

    subgraph HardeningAndRelease ["Stage Group 5: Quality, Release & Evolution (Phases 16 - 21)"]
        P15 --> P16["Phase 16: Privacy Analytics & Observability Pipeline"]
        P16 --> P17["Phase 17: Security Hardening & Vulnerability Mitigation"]
        P17 --> P18["Phase 18: Performance Optimization & Core Web Vitals"]
        P18 --> P19["Phase 19: Full E2E QA, Accessibility & Mobile Matrix Testing"]
        P19 --> P20["Phase 20: Zero-Downtime Production Deployment"]
        P20 --> P21["Phase 21: Post-Launch Telemetry & Continuous Improvement"]
    end
```

---

## 4. Phase-by-Phase Implementation Specifications

### Phase 0 — Discovery & Existing-System Audit
* Establish development baseline and cement non-overlapping boundary between Academy Website and Support Mini-App.
* Formulate ADR-001 (Modular Monolith in Express & TypeScript), ADR-002 (PostgreSQL 16 + Prisma ORM), ADR-003 (Next.js Monorepo), ADR-004 (Watermelon UI Adapter Layer), ADR-005 (Dual-Tier Translation Architecture).

### Phase 1 — Monorepo Architecture & Express Core API
* Initialize npm workspaces: `apps/web`, `apps/admin`, `services/api`, `packages/ui`, `packages/types`, `packages/database`.
* Configure Express API with Helmet, CORS, Request ID, and structured JSON logging.
* Setup optional `docker-compose.yml` for local PostgreSQL and Redis.

### Phase 2 — Design System, Watermelon UI & Accessibility (WCAG 2.2 AA)
* Implement `packages/ui`: `MySeedNavbar`, `MySeedFooter`, `MySeedHero`, `MySeedSection`, `MySeedCard`, `MySeedButton`, `MySeedDialog`, `MySeedInput`, `MySeedSelect`, `MySeedChatPanel`.
* Enforce mobile-first responsiveness (320px to 4K), 4.5:1 contrast, ARIA landmarks, RTL (`dir="rtl"`) for Arabic.

### Phase 3 — Database, Prisma & Multilingual Translation Engine
* Prisma ORM schema (`packages/database/prisma/schema.prisma`) for PostgreSQL.
* Automated background translation service in TypeScript (`TranslationService`).
* Pluggable `TranslationProvider` implementations (`MockTranslationProvider`, `GoogleCloudTranslationProvider`).
* Fallback resolution chain: `Requested Locale` → `Machine Translation` → `English Canonical`.

### Phase 4 — Authentication, RBAC (`system:*`) & Admin Shell
* Administrative session management (secure cookies, password hashing with PBKDF2/bcrypt).
* Granular RBAC (`content:read`, `content:write`, `donation:read`, `system:*` wildcard).
* Admin console navigation shell in `apps/admin` with responsive sidebar and audit logging interceptor.

### Phase 5 — Bilingual CMS Engine & Media Library
* Mandatory English and Amharic input fields for all articles, pages, team members, and announcements.
* Background translation trigger populating Tier 2 languages (`es`, `fr`, `ar`, `zh`, `hi`, `pt`, `ru`).
* Admin translation preview and manual override tab.
* Media library with 10MB ceiling, MIME validation, and mandatory bilingual alt text.

### Phase 6 — Public Website Foundation (Dynamic 16-Section Home)
* Dynamic `[locale]` routing supporting all 9 languages in `apps/web`.
* Automatic HTML `dir="rtl"` switching for Arabic.
* Modular 16-section homepage featuring educational value proposition, impact statistics, curriculum grade overview, and call-to-actions.

### Phase 7 — About, Learning & Resource Content Hubs
* About Hub (`/about/*`): Mission, story, team directory, leadership, partner organizations.
* Learning & School Solutions (`/learning/*` and `/schools/*`): Grade 5–12 curriculum overviews, "Request a Demo" accessible form.
* Resources Hub (`/resources/*`): Filterable educational articles, announcements, events calendar, and institutional FAQ accordions.

### Phase 8 — Multilingual Internal Search Engine
* Search provider with PostgreSQL full-text search across all 9 languages.
* Title (A) > Summary (B) > Body (C) weighted ranking.
* Public `Cmd+K` modal search and admin search analytics.

### Phase 9 — Technical SEO & Schema.org Infrastructure
* Automated dynamic `<title>`, `<meta description>`, Open Graph, Twitter cards, and `hreflang` tags for all 9 locales.
* Schema.org JSON-LD tags (`EducationalOrganization`, `Article`, `FAQPage`).
* Dynamic sitemap `/sitemap.xml` and `/robots.txt`.

### Phase 10 — Hybrid AI Chatbot, Knowledge Base & Support Redirects
* Verified Q&A match returns instant answer; low-confidence queries gracefully trigger external WhatsApp/Telegram handoff cards.
* Mandatory bilingual Q&A CMS and unanswered questions triage queue.

### Phase 11 — Engagement Workflows & Request Triage
* Structured public intake forms: General inquiries, School demos, Partnership proposals.
* Anti-abuse protections: honeypots, IP rate-limiting, input sanitization.
* Admin triage dashboard with status workflows.

### Phase 12 — Donations, Campaigns & Payment Providers
* Pluggable `PaymentProvider` interface (Chapa, Telebirr, Stripe, PayPal, local mock).
* Secure donation flow: one-time or recurring, custom amounts, campaign selection, anonymous option.
* Webhook idempotency engine and automated receipt generation.

### Phase 13 — Account-Free Newsletter & Email Engine
* 100% account-free newsletter subscription with email and preferred locale.
* Cryptographically signed 1-click unsubscribe links in every email footer.
* Pluggable `EmailProvider` (Resend, Postmark, AWS SES, Nodemailer).

### Phase 14 — Integration Center & Encrypted Secret Vault
* AES-256-GCM encrypted credentials vault for external API keys.
* UI for testing connection health across email, payment, AI, translation, and messaging providers.
* Dynamic feature flag engine.

### Phase 15 — Developer Platform, OpenAPI Automation & System Health
* Automated OpenAPI 3.1 specification generation from route schemas.
* Interactive API documentation portal (Swagger / Scalar) in Admin console.
* Strict RBAC: Developer role has zero access to payment secrets or donor PII.

### Phase 16 — Privacy Analytics & Observability
* Privacy-friendly page view and referral analytics without invasive tracking cookies.
* Centralized structured logging, `/healthz` and `/readyz` endpoints.
* OpenTelemetry / Sentry error tracking integration.

### Phase 17 — Security Hardening
* Strict Content Security Policy (CSP), HSTS, and security headers.
* Rate limiting per IP and session across public endpoints.
* SVG sanitization, media upload validation, OWASP Top 10 checklist.

### Phase 18 — Performance & Core Web Vitals
* Responsive image optimization (WebP/AVIF), font subsetting (Inter, Noto Sans Ethiopic, Arabic).
* Target Core Web Vitals: LCP < 2.0s, INP < 100ms, CLS < 0.05.
* Database query optimization and Redis caching layer.

### Phase 19 — Full QA, Accessibility & Mobile Matrix Testing
* Automated Playwright + Axe-core testing verifying 0 WCAG 2.2 AA violations.
* Responsive viewport testing across 320px, 390px, 768px, 1280px, and 1920px.
* 6 critical E2E visitor and administrative test flows.

### Phase 20 — Production Deployment
* Deployment configuration for Next.js web & admin frontends and Express API.
* Managed PostgreSQL and Redis setup.
* Production smoke tests and zero-downtime deployment verification.

### Phase 21 — Post-Launch Telemetry & Continuous Improvement
* Operational runbook: zero-result search query triage, unanswered chatbot question refinement.
* Translation quality feedback loop.
* Google Search Console and Core Web Vitals monitoring.
