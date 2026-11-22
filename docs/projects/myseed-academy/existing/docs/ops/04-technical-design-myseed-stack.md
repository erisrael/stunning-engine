# Technical Design Document (TDD)
## System Architecture and Engineering Design: The MySeed Stack

**Project:** MySeed Academy Core Platform  
**Document Identifier:** MYSEED-TDD-STACK-004  
**Version:** 2.4.0  
**Status:** Approved / Architecture Baseline  
**Date:** 2026-11-16  
**Target Systems:** `apps/web`, `apps/admin`, `services/api`, `packages/*`  
**Primary Author:** Principal Systems Architect  

---

## 1. System Overview & Architectural Paradigm

The MySeed Academy platform is engineered as a **TypeScript-Unified Modular Monolith** housed within a Turborepo monorepo. This architectural pattern balances developer velocity, end-to-end type safety, atomic deployments, and low operational overhead, while avoiding the distributed system complexity of microservices.

```
                                  MYSEED REPOSITORY TOPOLOGY
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                                       TURBOREPO                                        │
 │                                                                                        │
 │  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────────────┐ │
 │  │      apps/web        │  │     apps/admin       │  │        services/api          │ │
 │  │    Next.js 14 SSR    │  │    Next.js 14 CMS    │  │    Express 4 + TypeScript    │ │
 │  │    Port: 3000        │  │    Port: 3001        │  │    Port: 8080                │ │
 │  └──────────┬───────────┘  └──────────┬───────────┘  └──────────────┬───────────────┘ │
 │             │                         │                             │                 │
 │             └────────────┬────────────┴─────────────────────────────┘                 │
 │                          ▼                                                            │
 │  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
 │  │                                   PACKAGES                                       │  │
 │  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  ┌─────────────┐ │  │
 │  │  │   packages/ui    │  │ packages/database│  │ packages/types │  │  pkgs/config│ │  │
 │  │  │  Watermelon UI   │  │  Prisma + Memory │  │ Domain Schemas │  │  TS / ESLint│ │  │
 │  │  └──────────────────┘  └──────────────────┘  └────────────────┘  └─────────────┘ │  │
 │  └──────────────────────────────────────────────────────────────────────────────────┘  │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Monorepo Package & Service Architecture

### 2.1 Workspace Inventory

| Path | Name | Responsibilities & Tech Stack |
| :--- | :--- | :--- |
| `apps/web` | `@myseed/web` | Public educational and marketing portal. Next.js 14 (App Router), server-side rendering (SSR), Incremental Static Regeneration (ISR), React 18, Tailwind CSS, 9-locale routing. |
| `apps/admin` | `@myseed/admin` | Administrative console and CMS. Next.js 14, Tiptap rich-text editor, page layout builder, i18n review center, secrets vault, finance analytics. |
| `services/api` | `@myseed/api` | Core backend REST API. Express.js, TypeScript, Zod request validation, Helmet security, rate limiters, modular service layer. |
| `packages/ui` | `@myseed/ui` | Shared component library based on Watermelon UI tokens. Zero-emoji design, WCAG 2.2 AA compliant, Framer Motion animations. |
| `packages/database` | `@myseed/database` | Data access layer. Prisma ORM, PostgreSQL schema, seed fixtures, and automated in-memory client. |
| `packages/types` | `@myseed/types` | Canonical domain types, Zod schemas, RBAC definitions, integration specifications, and internationalization registries. |
| `packages/config` | `@myseed/config` | Shared TypeScript (`tsconfig.json`), ESLint, and Prettier configurations. |

---

## 3. Data Architecture & Relational Schema

### 3.1 Entity-Relationship Model (Prisma Core)

```text
erDiagram
    User ||--o{ Profile : has
    User ||--o{ Session : maintains
    User ||--o{ AuditLog : generates
    User ||--o{ StudentProgress : tracks
    Course ||--o{ Lesson : contains
    Lesson ||--o{ Checkpoint : includes
    Lesson ||--o{ StudentProgress : records
    StudentProgress ||--o{ QuizAttempt : logs
    Campaign ||--o{ Donation : receives
    Donation ||--|| Transaction : verifies
    IntegrationVault ||--o{ IntegrationAudit : logs

    User {
        string id PK
        string email UK
        string passwordHash
        string role
        boolean isActive
        datetime createdAt
    }

    Course {
        string id PK
        string slug UK
        string gradeBand
        string subject
        boolean isPublished
    }

    Lesson {
        string id PK
        string courseId FK
        string titleEn
        string titleAm
        string hlsUrl
        int durationSec
        int sequenceOrder
    }

    StudentProgress {
        string id PK
        string studentId FK
        string lessonId FK
        float masteryScore
        boolean completed
        int lastPositionSec
    }

    Donation {
        string id PK
        string campaignId FK
        decimal amount
        string currency
        string status
        string donorEmail
    }

    Transaction {
        string id PK
        string donationId FK
        string referenceId UK
        string gateway
        string status
        json payload
    }
```

### 3.2 Automated In-Memory Database Fallback Engine
A standout architectural design pattern within `services/api` is the **Automated In-Memory Database Fallback**. When PostgreSQL is unavailable (e.g., during network partitions, local dev without Docker, or database maintenance), the API transparently proxies database queries to an in-memory repository without crashing:

```text
flowchart TD
    Boot[Application Boot / API Query] --> Probe{Probe PostgreSQL Connection}
    Probe -->|Success| Primary[Use PrismaClient with PostgreSQL 16]
    Probe -->|Connection Refused / Timeout| Fallback[Initialize MemoryClient Singleton]
    Fallback --> SeedMem[Hydrate In-Memory Store with Seed Data]
    Fallback --> LogWarn[Emit Warning Log: DB_IN_MEMORY_ACTIVE]
    Fallback --> Ready[Serve API Endpoints from RAM]
    Primary --> Serve[Serve API Endpoints from PostgreSQL]
    
    subgraph MemoryClient Mechanics
        SeedMem --> Store[Thread-Safe Map Collection]
        Store --> Proxy[Prisma-Compatible API Emulation Layer]
        Proxy --> Filter[Array findMany, findUnique, create, update, delete]
    end
```

**Implementation Guarantees:**
1. **API Parity:** `MemoryClient` implements the identical Prisma model interface methods (`findMany`, `findUnique`, `create`, `update`, `delete`, `upsert`).
2. **Health Transparency:** The `/readyz` endpoint reports `database: "in-memory"` with a status of `degraded` to notify monitoring systems without failing liveness checks.

---

## 4. API Layer Architecture & Request Pipeline

### 4.1 Layered Request Execution Lifecycle

```text
sequenceDiagram
    autonumber
    participant Client as Client (Web / Mobile / Admin)
    participant Sec as Security Middlewares (Helmet, CORS)
    participant Rate as Rate Limiter (Redis / Memory)
    participant Auth as Auth & RBAC Guard
    participant Zod as Zod Validation Middleware
    participant Ctrl as Express Controller
    participant Svc as Domain Service
    participant Repo as Data Layer (Prisma / Memory)

    Client->>Sec: Incoming HTTP Request
    Sec->>Sec: Attach Headers (CSP, HSTS, X-Request-ID)
    Sec->>Rate: Evaluate IP Rate Limit
    Rate-->>Sec: Limit OK (200 OK)
    Sec->>Auth: Extract HTTP-Only Cookie / Bearer Token
    Auth->>Auth: Verify HMAC & Query Permissions
    Auth->>Zod: Forward Request with Validated Context
    Zod->>Zod: Validate Request Body / Query against Schema
    Zod->>Ctrl: Dispatch to Controller Action
    Ctrl->>Svc: Invoke Domain Business Logic
    Svc->>Repo: Execute Query or Mutation
    Repo-->>Svc: Return Entity Records
    Svc-->>Ctrl: Return Result DTO
    Ctrl-->>Client: HTTP 200/201 JSON Envelope
```

### 4.2 Security Architecture & Cryptographic Vault

#### 4.2.1 Authentication & Password Hashing
- **Algorithm:** PBKDF2 (RFC 2898) utilizing HMAC-SHA512.
- **Parameters:** Iteration count: $100,000$, salt length: $32\text{ bytes}$ cryptographically random, derived key length: $64\text{ bytes}$.
- **Session Tokens:** HMAC-SHA256 signed JWT with 7-day expiration, stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- **Session Revocation:** On password modification, a timestamp `passwordChangedAt` is updated in the database; all tokens issued prior to this timestamp are immediately invalidated.

#### 4.2.2 AES-256-GCM Integration Secret Vault
All third-party credentials (Chapa secret keys, Stripe keys, Resend tokens, Claude API keys) stored in `IntegrationVault` are encrypted using authenticated AES-256-GCM:

$$\text{Ciphertext} = \mathbf{AES\text{-}256\text{-}GCM}(\text{Key} = \text{KDF}(\text{ENCRYPTION\_KEY}),\, \text{IV} = \text{12-byte random},\, \text{Plaintext})$$

The resulting payload stores `iv`, `authTag`, and `ciphertext` in base64 format. Plaintext keys are never returned across API responses to the browser console.

---

## 5. Multilingual Localization Architecture

The platform implements a **Dual-Tier Multilingual Architecture** (governed by ADR-005):

```
                       LOCALIZATION ENGINE TOPOLOGY
                      ┌────────────────────────────┐
                      │    Content Creation Form   │
                      │  Admin Console (/content)  │
                      └─────────────┬──────────────┘
                                    │ Requires Both
                      ┌─────────────▼──────────────┐
                      │       TIER 1 CONTENT       │
                      │   English (en) + Amharic   │
                      └─────────────┬──────────────┘
                                    │
                        Save Entity │ Auto-Dispatch
                                    ▼
                      ┌────────────────────────────┐
                      │    Translation Pipeline    │
                      │ services/translation.svc   │
                      └─────────────┬──────────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               ▼                                         ▼
   ┌───────────────────────┐                 ┌───────────────────────┐
   │ Google Cloud Translate│                 │ Anthropic Claude 3.5  │
   │      (Primary)        │                 │ (Contextual Fallback) │
   └───────────┬───────────┘                 └───────────┬───────────┘
               └────────────────────┬────────────────────┘
                                    │
                                    ▼
                      ┌────────────────────────────┐
                      │       TIER 2 CONTENT       │
                      │  ar, fr, es, zh, hi, pt, ru│
                      └─────────────┬──────────────┘
                                    │
                                    ▼
                      ┌────────────────────────────┐
                      │  Editor Review & Override  │
                      │   (Permanent Persistence)  │
                      └────────────────────────────┘
```

1. **Tier 1 (Core):** English (`en`) and Amharic (`am`) are mandatory. Authors cannot save or publish content without providing both versions.
2. **Tier 2 (International):** Machine-translated asynchronously on save using Google Cloud Translation or Claude.
3. **Editor Override Integrity:** Any manual revision made by an editor to a Tier 2 translation sets `isOverridden = true`, permanently protecting it from automated overwrites.

---

## 6. Media Pipeline & Video Streaming

1. **Storage Tier:** Object storage utilizing S3-compatible interfaces (Cloudflare R2 or AWS S3), configured with strict CORS rules and presigned upload URLs.
2. **Media Transcoding:** Raw MP4 video uploads are segmented into HLS packages containing an `.m3u8` master playlist and `.ts` chunk files at 360p, 480p, and 720p bitrates.
3. **Chunk Optimization:** HLS chunks are formatted in 4-second segments to allow rapid buffer fill on high-latency mobile networks.
4. **Validation Pipeline:** File uploads undergo strict MIME verification, magic-byte header inspection (preventing file extension spoofing), and SVG DOM sanitization to mitigate XSS attacks.

---

## 7. Operational Resilience & Zero-Downtime Deployment

### 7.1 Docker Container Packaging
Each component is packaged into a multi-stage Docker image optimizing caching and image size:
- `apps/web`: Standalone Next.js output mode, Alpine base image ($\approx 110\text{ MB}$).
- `apps/admin`: Standalone Next.js output mode ($\approx 115\text{ MB}$).
- `services/api`: Distroless / Alpine Node.js runtime with compiled JavaScript ($\approx 95\text{ MB}$).

### 7.2 Graceful Shutdown Procedure
Upon receiving `SIGTERM` or `SIGINT`:
1. The HTTP listener stops accepting new incoming connections.
2. An internal 15-second grace countdown initiates to permit active in-flight HTTP requests to complete.
3. Database connection pools (Prisma / PgBouncer) and Redis sockets are closed cleanly.
4. The process exits with code 0.

---
*End of Technical Design Document — MySeed Stack Architecture.*
