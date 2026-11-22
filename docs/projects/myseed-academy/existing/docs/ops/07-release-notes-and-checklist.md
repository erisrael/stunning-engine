# Release Notes & Production Deployment Checklist
## Release Version: v2.4.0 — "Ethiopian STEM Breakthrough"

**Product:** MySeed Academy Multi-Platform Learning Suite  
**Document Identifier:** MYSEED-REL-2026-v2.4.0  
**Target Release Date:** 2026-11-16  
**Release Coordinator:** Release Engineering & Operations  
**Git Tag / Commit:** `v2.4.0-prod-release`  

---

## 1. Executive Summary & Highlights

The **v2.4.0** release represents a foundational milestone for MySeed Academy. This release operationalizes the complete secondary STEM learning curriculum (Grades 5 through 12) co-developed with Teacher Dani, introducing our **Smart Learning Loop** (in-video checkpoints and offline sync), frictionless **399 ETB Student Sponsorships** via Telebirr and Chapa, and our next-generation **Bilingual Admin Console & Page Builder**.

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                        v2.4.0 CORE HIGHLIGHTS                          │
  │                                                                        │
  │  • Full Grade 5–12 STEM Curriculum (Physics, Math, Chemistry, Bio)     │
  │  • Smart Learning Loop: In-video checkpoints + offline batch sync      │
  │  • Chapa & Telebirr 399 ETB / mo Student Sponsorship Checkout          │
  │  • 42% Reduction in JavaScript Client Bundle Size                      │
  │  • Automated In-Memory Database Fallback for High Availability         │
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Detailed Changelog

### 2.1 New Features Added
- **Interactive In-Video Checkpoints (`apps/web`, `services/api`):** Video lessons automatically pause at key pedagogical moments, challenging students with interactive conceptual questions before continuing.
- **Offline Sync Protocol (`services/api`):** Batch synchronization endpoint (`POST /api/v1/learning/sync`) accepting queued student attempts with full idempotency and automatic conflict resolution.
- **Sponsorship & Donation Flow (`apps/web`, `services/api`):** Support for 399 ETB/month student sponsorships with automated Chapa and Stripe payment gateways, instant webhook processing, and bilingual tax-compliant email receipts.
- **Visual Page Builder v2 (`apps/admin`):** Version-controlled drag-and-drop homepage layout builder with multi-viewport iframe preview (320px, 390px, 768px, 1280px, 1920px) and automated render tests in English and Amharic.
- **Encrypted Integrations Vault (`apps/admin`, `services/api`):** AES-256-GCM encrypted storage for 14 third-party integration credentials (Chapa, Stripe, Resend, Claude, Google Translate, S3, Telegram).
- **Public API Documentation & Developer Center (`apps/admin`):** OpenAPI 3.1 specification explorer with interactive query runner at `/developer`.

### 2.2 Performance & Architectural Optimizations
- **Ethiopic Font Subsetting:** Optimized `Noto Sans Ethiopic` font delivery, reducing webfont payload by $65\%$ without sacrificing Fidel coverage.
- **Bundle Trimming:** Refactored icon sets and Framer Motion imports across `packages/ui`, slashing client first-load JavaScript from 310KB to 178KB gzipped.
- **In-Memory Store Parity:** Enhanced `lib/memoryClient.ts` to support multi-field filtering and relational includes, ensuring seamless operation if PostgreSQL drops out.

### 2.3 Security Hardening & Bug Fixes
- **FIX-AUTH-042:** Replaced legacy MD5/SHA1 routines with PBKDF2 (HMAC-SHA512, 100,000 iterations) across all authentication pipelines.
- **FIX-WEBHOOK-019:** Implemented idempotency token caching for Chapa webhooks, eliminating rare race conditions on concurrent Telebirr notifications.
- **SEC-XSS-008:** Enhanced Tiptap rich-text publishing with strict server-side DOMPurify allowlists, stripping script injections and malformed SVG payloads.

### 2.4 Breaking Changes & Migrations
- **Role Migration:** All legacy enum-based roles have been transitioned to database-backed roles (`Role` table). Projects upgrading from pre-October 2026 databases must run `packages/database/prisma/manual/2026-10-roles-as-data.sql` prior to running Prisma migrations.

---

## 3. Pre-Release Verification Checklist (Pre-Flight Gate)

All checks must achieve explicit sign-off by their respective leads before production deployment:

```markdown
### Quality & Test Engineering Sign-Off
- [x] API Unit Test Suite: 100% passing (npm test)
- [x] End-to-End Test Suite: 100% passing across Playwright matrix (npm run test:e2e)
- [x] Accessibility Audit: Zero critical or serious axe-core violations (WCAG 2.2 AA)
- [x] Responsive Matrix Check: Layouts verified at 320px, 390px, 768px, 1280px, 1920px
- [x] Physical Device Bench: Verified on Tecno Pop 5 (1GB RAM) and itel A58
- [x] Offline Synchronization: Verified complete offline attempt sync under Toxiproxy 3G simulation

### Infrastructure & Security Sign-Off
- [x] Secrets Audit: ENCRYPTION_KEY, JWT_SECRET, and POSTGRES_PASSWORD meet entropy requirements (>32 chars)
- [x] Database Backup: Snapshot taken of production PostgreSQL instance (pg_dump verified)
- [x] Database Migration: Prisma schema migration dry-run executed on staging replica
- [x] In-Memory Fallback: Simulated Postgres failure verified on staging without HTTP 500 errors
- [x] SSL/TLS Certificates: Wildcard certificates on myseed.com.et and api.myseed.com.et valid for >60 days
```

---

## 4. Production Deployment Execution Checklist

```markdown
### Phase A: Pre-Deployment Preparation (T-60 Minutes)
- [ ] 1. Notify Core Operations, Content, and Support teams via Telegram / Slack channels.
- [ ] 2. Freeze all admin content publishing and page builder modifications.
- [ ] 3. Execute final pre-deployment database snapshot:
       docker compose -f docker-compose.prod.yml exec postgres pg_dump -U myseed myseed_prod > backup_pre_v240.sql
- [ ] 4. Confirm staging environment health checks report OK at /healthz and /readyz.

### Phase B: Deployment Execution (T-0 to T+15 Minutes)
- [ ] 5. Pull new production Docker container images:
       docker compose -f docker-compose.prod.yml pull
- [ ] 6. Apply database schema migrations:
       docker compose -f docker-compose.prod.yml run --rm api npm run db:push
- [ ] 7. Perform rolling zero-downtime service restart:
       docker compose -f docker-compose.prod.yml up -d --no-deps --build api web admin
- [ ] 8. Verify container logs for clean bootstrap and database connection acquisition:
       docker compose -f docker-compose.prod.yml logs --tail=100 api

### Phase C: Post-Deployment Smoke Verification (T+15 to T+30 Minutes)
- [ ] 9. Verify API Liveness & Readiness:
       curl -fsS https://api.myseed.com.et/healthz
       curl -fsS https://api.myseed.com.et/readyz | grep '"database":"postgres"'
- [ ] 10. Smoke Test Public Web Portal:
       Verify https://myseed.com.et loads in English and Amharic with zero console errors.
- [ ] 11. Smoke Test Live Donation Flow:
       Perform 10 ETB test transaction via Chapa / Telebirr test checkout.
- [ ] 12. Smoke Test Admin Authentication:
       Sign in with Super Admin and Developer credentials; verify RBAC permission gating.
- [ ] 13. Unfreeze admin publishing; notify stakeholders of successful deployment.
```

---

## 5. Rollback Protocol & Fast Reversion Triggers

### 5.1 Immediate Rollback Triggers
A rollback must be initiated immediately if any of the following occur within 30 minutes of deployment:
1. API HTTP 5xx error rate exceeds $0.5\%$ of total traffic over a 5-minute window.
2. In-memory database fallback is triggered inadvertently due to database connection pool failure.
3. Telebirr/Chapa payment webhook failure rate exceeds $2.0\%$.

### 5.2 Rollback Execution Steps
```bash
# 1. Revert container image tags to prior stable release (v2.3.9)
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.v2.3.9.yml up -d

# 2. If database schema was corrupted, restore pre-deployment snapshot
docker compose -f docker-compose.prod.yml stop api
cat backup_pre_v240.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U myseed myseed_prod
docker compose -f docker-compose.prod.yml start api

# 3. Purge edge CDN cache to flush stale bundles
curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" -H "Authorization: Bearer ${CF_TOKEN}" -d '{"purge_everything":true}'
```

---

## 6. Stakeholder & User Communications

### 6.1 Telegram Community Announcement (Teacher Dani Channel)
> **የተከበራችሁ የማይሲድ ቤተሰቦች እና ተማሪዎች!**  
> አዲሱ MySeed Academy v2.4.0 የትምህርት መተግበሪያ አሁን በይፋ ተለቋል!  
> • ከ5ኛ እስከ 12ኛ ክፍል ሙሉ የፊዚክስ፣ የሒሳብ እና የሳይንስ ትምህርቶች  
> • በቪዲዮ መሀል የሚጠየቁ በይነተገናኝ ጥያቄዎች (In-Video Questions) እና ፈጣን ፍንጮች  
> • ያለ ኢንተርኔት (Offline) ትምህርቶችን በቀላሉ አውርዶ ማጥናት የሚያስችል ቴክኖሎጂ  
> መተግበሪያውን አሁን ከ Google Play Store እና App Store ላይ አድሱት!  
> *ትንሽ ትምህርት የተማሪውን የወደፊት ሕይወት ይለውጣል!*

---
*End of Release Notes & Checklist — MySeed Academy Engineering.*
