# MySeed Academy: Operations Documentation Suite
## Master Index & Operational Architecture Catalog

Welcome to the **Operations Documentation (OPS doc)** suite for **MySeed Academy** (MySeed EdTech PLC, Addis Ababa, Ethiopia). This repository contains the authoritative technical, architectural, operational, and requirements documentation governing the MySeed educational software ecosystem.

---

## Document Inventory

| # | Document Title | File Path | Standard / Format | Scope & Description |
| :---: | :--- | :--- | :--- | :--- |
| **01** | **System Requirements Specification (SRS)** | [`01-srs-ieee830-iso29148.md`](./01-srs-ieee830-iso29148.md) | ISO/IEC/IEEE 29148:2018 & IEEE Std 830 | Master requirements framework covering the entire platform, interfaces, constraints, security, and verification matrix. |
| **02** | **SRS: MySeed Learning Feature** | [`02-srs-myseed-learning-feature.md`](./02-srs-myseed-learning-feature.md) | ISO 29148 Deep Dive | Feature specification for the **Smart Learning Loop**: in-video checkpoints, bilingual hints (Amharic & English), and offline sync. |
| **03** | **Product Brief** | [`03-product-brief.md`](./03-product-brief.md) | Product Management Brief | Executive strategy, problem statement, Ethiopian market personas, value pillars, KPIs, and go-to-market roadmap. |
| **04** | **Technical Design Document (TDD)** | [`04-technical-design-myseed-stack.md`](./04-technical-design-myseed-stack.md) | System Architecture Specification | Technical design of the MySeed Stack: Next.js 14, Express 4 + TypeScript modular monolith, Prisma, and automated in-memory fallback. |
| **05** | **Architecture Decision Record (ADR)** | [`05-architecture-decision-record.md`](./05-architecture-decision-record.md) | MADR Standard (ADR-006) | Architectural justification for the offline-first synchronization protocol and resilient media caching for Ethiopian mobile networks. |
| **06** | **Test Plan with MySeed's Devices** | [`06-test-plan-myseed-devices.md`](./06-test-plan-myseed-devices.md) | Hardware & Network QA Plan | Device certification matrix covering Ethiopian phones (Tecno, Infinix, itel, Samsung), Ethio Telecom 3G profiles, and WCAG 2.2 AA. |
| **07** | **Release Notes and Checklist** | [`07-release-notes-and-checklist.md`](./07-release-notes-and-checklist.md) | Release Engineering Gate | v2.4.0 "Ethiopian STEM Breakthrough" release notes, pre-flight checklist, rolling deployment steps, and rollback playbook. |
| **08** | **Production Runbook** | [`08-runbook.md`](./08-runbook.md) | Operational SRE Runbook | Standard operating procedures (SOPs), zero-downtime deploys, in-memory recovery, secret rotation, and on-call escalation matrix. |
| **09** | **Incident Postmortem** | [`09-postmortem.md`](./09-postmortem.md) | Blameless Incident Analysis | Postmortem for INC-2026-10-18: Telebirr payment webhook congestion, connection pool starvation, 5 Whys, and architectural fixes. |

---

## Pedagogical & Technical Foundations

- **Pedagogical Lead:** Teacher Dani (Co-Founder & Chief Educator)
- **Primary Market:** Ethiopian Students (Grades 5–12) across Addis Ababa, Oromia, Amhara, Sidama, and all regional states.
- **Language Tiers:**
  - *Tier 1 (Core):* English (`en`) and Amharic (`am`) required across all content.
  - *Tier 2 (Expansion):* Arabic (`ar`, RTL), French (`fr`), Spanish (`es`), Mandarin (`zh`), Hindi (`hi`), Portuguese (`pt`), Russian (`ru`).
- **Core Technology Stack:**
  - Frontend: Next.js 14 App Router (`apps/web`, `apps/admin`) with Watermelon UI tokens.
  - Backend: Express.js & TypeScript (`services/api`).
  - Database: PostgreSQL 16 with Prisma ORM and automated in-memory fallback client.
  - Payments: Chapa (Telebirr, CBE Birr) & Stripe.

---
*MySeed EdTech PLC — Built for Ethiopian Students. Powered by Education and Technology.*
