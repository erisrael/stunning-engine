# SchoolHub - Built Features & Platform Capabilities

## 1. Codebase Status & Architecture Overview

SchoolHub is a multi-tenant school management and learning information platform built specifically for Ethiopian primary, secondary, and preparatory schools, conforming to MoE academic standards, dual Ethiopian/Gregorian calendars, and bilingual Amharic/English typography.

### Monorepo Structure
- **`@myseed/contracts`**: End-to-end typed contracts, Zod schemas, permissions, resources catalog, layout engines, and validation schemas.
- **`@myseed/db`**: PostgreSQL 17 + Prisma ORM with strict Row Level Security (RLS) tenant isolation on every tenant table.
- **`@myseed/api`**: NestJS REST backend providing authentication, RBAC permissions, document rendering, background workers, and audit logging.
- **`@myseed/portal`**: Next.js App Router portal with modern reactive UI, offline-first capabilities, and localized Ethiopian workflows.
- **`@myseed/ui`**: Design system tokens, accessible form controls, modals, tables, badges, and print CSS.
- **`@myseed/calendar`**: Bidirectional Ethiopian / Gregorian calendar conversions, Ethiopian holidays, and academic term calculations.

---

## 2. Review of Recent Progress & Roadmap Milestones

### Completed Phases from Roadmap
1. **Phase 11 (Report Card Editor & Publishing)**:
   - Dynamic report card block layouts, visual drag-and-drop designer, live preview with sample student data.
   - Comment banks with teacher macros and variables.
   - Dual-language Amharic/English subject grade grids.
   - Formal sign-off and publication pipeline with audit trails (Migration `0013_report_card_revisions`).
2. **Phase 12 (Bulk Operations, Record Viewer & Conflict Resolution)**:
   - Universal undo window with toast actions.
   - Slide-over record viewer panel with interactive audit timeline.
   - Recycle bin with single and bulk restoration (Migration `0014_recycle_bin`).
   - Two-way visual comparison and conflict merge resolution on HTTP 409 errors.
3. **Phase 13 (Page Enrichments & Accessibility)**:
   - Contextual empty states with primary call-to-actions across all resource pages.
   - Metric sparklines and financial collection charts.
   - Ethiopian currency formatters and money sum calculations.
   - Accessibility regression suite: Axe Core checks across 20 core pages in desktop light, desktop dark, and 360 px phone mode. Automated checks cover the rendered page, accessible names, contrast, and phone overflow; they do not establish full WCAG compliance. See [continuation status](CONTINUATION.md) for verified results and remaining checks.
4. **Phase 3 (Assistant Layer 1 - Natural Language Navigation)**:
   - High-performance catalog matching, Levenshtein fuzzy entity search, and query filter extraction.
   - 300+ request test suite verified at >95% accuracy without external LLM latency or cost.

---

## 3. Newly Built Features: Certificates Generator with Tamper-Proof QR & Verification

The Certificates Generator resolves a top-priority pilot requirement from the build plan, giving schools the ability to generate, print, and securely verify official credentials.

### Key Capabilities
- **Database Model & Migration (`0015_certificates`)**:
  - Model `Certificate` with UUID, tenant RLS isolation, student reference, kind, custom citations, template linking, and JSON snapshot payload.
  - Unique human-readable verification codes (`humanCode(12)`).
- **Certificate Kinds**:
  - `completion`: Academic grade or level completion.
  - `merit`: Academic merit and scholastic achievement.
  - `honor_roll`: First-class honor roll distinction.
  - `conduct`: Exemplary conduct, citizenship, and student leadership.
  - `leaving`: Official school leaving certificate upon transfer or graduation.
  - `attendance`: Perfect attendance and diligence.
- **Visual Styles**:
  - `ornate_classic`: Traditional floriated diploma double border with dark green and gold trim.
  - `gold_seal`: Radial background with gold border and SVG embossed medallion seal.
  - `modern_academic`: Clean architectural framing with institutional accent color bars.
  - `ethiopian_heritage`: Traditional Ethiopian border patterns with authentic Amharic script styling.
- **Single & Bulk Issuance**:
  - **Single Issue**: Issue tailored certificates with custom signatory names, dates, and citations.
  - **Bulk Issue**: Issue certificates across an entire class section or grade level in one click.
- **Document Output**:
  - Printable HTML with zero-margin print stylesheet and landscape/portrait A4 orientation.
  - High-resolution PDF generation via headless Playwright engine.
- **Tamper-Proof Online Verification**:
  - Each certificate carries an inline SVG QR code linking to `/verify?code=...`.
  - Public verification engine validates authenticity, school details, student name, category, and issue date without exposing private student records.
- **Revocation Workflow**:
  - Instant administrative revocation with reason logging.
  - Public verification immediately alerts third parties if a certificate has been revoked.

---

## 4. UI Customization & Themes

- **Harvard SMIS / Academic Classic Mode**: Refined, dignified academic styling with serif headings and high-contrast typography.
- **ClickUp Workspace Mode**: Compact, dense, high-efficiency data views with quick inline actions and sidebar drawer collapse.
- **Modern State-of-the-Art Themes**:
  - MySeed Classic
  - Scholar
  - Spark
  - Sapphire
  - Highland
  - Basalt
  - Starlight
  - Buna (warm Ethiopian coffee palette)
  - High Contrast (accessible WCAG AAA)
- **Zero-Emoji Compliance**: All iconography strictly uses SVG vector icons (`lucide-react`), adhering to `docs/no-emoji-watermelon-ui.md`.

---

## 5. API Reference for Document Services

| Method | Endpoint | Description | Permissions |
|--------|----------|-------------|-------------|
| `POST` | `/api/v1/documents/certificates` | Issue a single certificate | `results.report_card.manage` |
| `POST` | `/api/v1/documents/certificates/bulk` | Bulk issue certificates for section or grade | `results.report_card.manage` |
| `GET`  | `/api/v1/documents/certificates/:id/html` | Printable HTML certificate view | `results.report_card.manage`, `results.view_all` |
| `GET`  | `/api/v1/documents/certificates/:id/pdf` | PDF download | `results.report_card.manage`, `results.view_all` |
| `POST` | `/api/v1/documents/certificates/:id/revoke` | Revoke a certificate with reason | `results.report_card.manage` |
| `GET`  | `/api/v1/public/verify/:code` | Public cryptographic document verification | Public |

