# Production Operations Runbook
## Standard Operating Procedures, Incident Response & Maintenance Playbooks

**System:** MySeed Academy Production Platform  
**Document Identifier:** MYSEED-OPS-RUNBOOK-008  
**Version:** 2.4.0  
**Date:** 2026-11-16  
**On-Call Schedule:** Primary (SRE Lead), Secondary (Lead Backend Engineer)  
**Emergency Bridge:** Telegram Operations Command Channel (`@MySeed_Ops_Bot`)  

---

## 1. System Overview & Component Architecture

MySeed Academy production consists of containerized services orchestrated via Docker Compose:

```
                                PRODUCTION SERVICE TOPOLOGY
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                                EDGE / REVERSE PROXY                                   │
 │                           Cloudflare / NGINX / Caddy                                   │
 └─────────────────┬──────────────────────┬───────────────────────────────┬───────────────┘
                   │                      │                               │
                   ▼                      ▼                               ▼
       ┌──────────────────────┐┌──────────────────────┐     ┌───────────────────────────┐
       │      apps/web        ││     apps/admin       │     │       services/api        │
       │    Next.js 14 SSR    ││    Next.js 14 CMS    │     │   Express 4 Modular API   │
       │    Port: 3000        ││    Port: 3001        │     │   Port: 8080              │
       └──────────────────────┘└──────────────────────┘     └─────────────┬─────────────┘
                                                                          │
                                                  ┌───────────────────────┴───────────────┐
                                                  ▼                                       ▼
                                     ┌─────────────────────────┐             ┌─────────────────────────┐
                                     │      PostgreSQL 16      │             │        Redis 7.2        │
                                     │   Primary Database      │             │  Cache & Rate Limiting  │
                                     │   Port: 5432            │             │  Port: 6379             │
                                     └─────────────────────────┘             └─────────────────────────┘
```

---

## 2. Health Checks & Diagnostic Commands

### 2.1 Service Health Probes
```bash
# 1. Check API Liveness & Process Health
curl -I https://api.myseed.com.et/healthz
# Expected: HTTP/1.1 200 OK

# 2. Check API Readiness & Database Mode
curl -s https://api.myseed.com.et/readyz | jq .
# Expected Output (Healthy):
# { "status": "ok", "database": "postgres", "uptimeSec": 45821, "memoryRssMb": 88 }

# Degraded Output (Warning: In-Memory Active):
# { "status": "degraded", "database": "in-memory", "warning": "PostgreSQL connection dropped" }
```

### 2.2 Host Diagnostics & Log Inspection
```bash
# View real-time container resource usage (CPU, RAM, Network I/O)
docker stats --no-stream

# Stream API logs filtered by specific Request ID
docker compose -f docker-compose.prod.yml logs -f api | grep "req-8f2b34a1"

# Check database connection pool count
docker compose -f docker-compose.prod.yml exec postgres psql -U myseed -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'myseed_prod';"
```

---

## 3. Standard Operating Procedures (SOPs)

### SOP-01: Zero-Downtime Rolling Deployment
*Trigger: Production software release or critical bug fix.*

1. **Verify Environment Variables:** Ensure all production keys are loaded in `.env`:
   ```bash
   grep -E 'POSTGRES_PASSWORD|ENCRYPTION_KEY|JWT_SECRET|CHAPA_SECRET_KEY' .env
   ```
2. **Execute Database Migration:**
   ```bash
   docker compose -f docker-compose.prod.yml run --rm api npm run db:push
   ```
3. **Rebuild and Rolling Update:**
   ```bash
   docker compose -f docker-compose.prod.yml up -d --no-deps --build api
   sleep 10
   docker compose -f docker-compose.prod.yml up -d --no-deps --build web admin
   ```
4. **Purge CDN Cache:**
   ```bash
   curl -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
     -H "Authorization: Bearer ${CF_TOKEN}" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'
   ```

---

### SOP-02: In-Memory Database Fallback Recovery & Resynchronization
*Trigger: PostgreSQL service crashes or is restarted, causing API to enter `database: "in-memory"` mode.*

```text
flowchart TD
    Detect[Alert: API entered In-Memory Fallback] --> CheckPG{Is PostgreSQL Container Running?}
    CheckPG -->|No| RestartPG[docker compose start postgres]
    CheckPG -->|Yes| InspectLogs[Inspect PostgreSQL Logs for Disk / Crash]
    RestartPG --> WaitReady[Wait for Postgres Port 5432 to Accept Connections]
    InspectLogs --> FixCause[Remediate Root Cause e.g. Disk Full / Deadlock]
    FixCause --> WaitReady
    WaitReady --> TestConn[Test Connection: psql -U myseed myseed_prod]
    TestConn --> RollingRestart[Trigger Graceful API Restart to Re-bind Prisma Pool]
    RollingRestart --> Verify[Verify /readyz reports database: postgres]
```

1. **Investigate Database Outage:**
   ```bash
   docker compose -f docker-compose.prod.yml logs --tail=100 postgres
   ```
2. **Restart PostgreSQL Container:**
   ```bash
   docker compose -f docker-compose.prod.yml restart postgres
   ```
3. **Trigger Seamless API Re-bind:**
   Once PostgreSQL is healthy and accepting queries, signal the API process to re-establish the primary Prisma connection pool:
   ```bash
   docker compose -f docker-compose.prod.yml kill -s SIGHUP api
   # Or perform rolling restart:
   docker compose -f docker-compose.prod.yml restart api
   ```
4. **Validate Status:** Confirm `curl -s https://api.myseed.com.et/readyz` returns `"database": "postgres"`.

---

### SOP-03: Secret Rotation Protocol
*Trigger: Scheduled 90-day rotation or suspected credential compromise.*

#### Rotating the Master Encryption Vault Key (`ENCRYPTION_KEY`)
1. Generate a new cryptographically secure 32-byte key:
   ```bash
   openssl rand -hex 32
   ```
2. Run the offline re-encryption script against the PostgreSQL database:
   ```bash
   docker compose -f docker-compose.prod.yml exec api npm run vault:re-encrypt -- --old-key="$OLD_KEY" --new-key="$NEW_KEY"
   ```
3. Update `.env` with the new key and perform a rolling restart of the API.

#### Rotating Chapa / Telebirr Payment API Keys
1. Generate a new Secret Key inside the Chapa Merchant Dashboard.
2. Open the Admin Console at `https://admin.myseed.com.et/integrations`.
3. Select **Chapa**, enter the new Secret Key, and tap **Run Live Test**.
4. Once the test payment succeeds, tap **Save Changes**. The vault immediately updates without an API restart.

---

### SOP-04: Emergency Maintenance Mode Activation
*Trigger: Unplanned critical outage, schema rebuild, or security incident.*

1. **Activate Maintenance Banner via API Flag:**
   ```bash
   docker compose -f docker-compose.prod.yml exec api npm run flag:set -- maintenance_mode=true
   ```
2. **Alternative: Edge-Level NGINX / Cloudflare Override:**
   Deploy static maintenance page `public/maintenance.html` returning HTTP 503 Service Unavailable:
   ```bash
   # Edge route redirect to maintenance HTML
   curl -X PATCH "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/settings/security_level" \
     -H "Authorization: Bearer ${CF_TOKEN}" \
     -d '{"value":"under_attack"}'
   ```

---

### SOP-05: Chapa / Telebirr Payment Webhook Reconciliation
*Trigger: Student reports successful Telebirr deduction but course remains locked.*

1. **Query Transaction Status via Chapa Verification API:**
   ```bash
   curl -X GET "https://api.chapa.co/v1/transaction/verify/MYSEED-TX-89412" \
     -H "Authorization: Bearer ${CHAPA_SECRET_KEY}"
   ```
2. **Locate Webhook Ingestion Log:**
   ```bash
   docker compose -f docker-compose.prod.yml logs api | grep "webhook:chapa" | grep "MYSEED-TX-89412"
   ```
3. **Force Manual Reconciliation via Admin Console:**
   - Navigate to `https://admin.myseed.com.et/finance`.
   - Search by Reference ID (`MYSEED-TX-89412`).
   - Click **Verify & Reconcile**. The system queries Chapa, verifies the signature, unlocks student access, and emits a receipt email.

---

### SOP-06: Database Backup & Point-In-Time Restoration
*Frequency: Daily automated backup at 02:00 EAT; retained for 30 days.*

```bash
# 1. Execute On-Demand Manual Backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U myseed -F c -b -v -f /backups/myseed_backup_${TIMESTAMP}.dump myseed_prod

# 2. Restore from Backup Dump (Emergency DR)
docker compose -f docker-compose.prod.yml stop api
docker compose -f docker-compose.prod.yml exec -T postgres dropdb -U myseed --if-exists myseed_prod
docker compose -f docker-compose.prod.yml exec -T postgres createdb -U myseed myseed_prod
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U myseed -d myseed_prod -v /backups/myseed_backup_${TIMESTAMP}.dump
docker compose -f docker-compose.prod.yml start api
```

---

## 4. Incident Response & Escalation Matrix

### 4.1 Severity Definitions

| Severity | Impact | Initial Response SLA | Status Update Frequency |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Core public web down, payment gateway down, or video playback broken for all users | $\le 15\text{ minutes}$ | Every 20 minutes |
| **SEV-2 (Major)** | In-memory fallback active, translation engine failing, or admin console inaccessible | $\le 45\text{ minutes}$ | Every 60 minutes |
| **SEV-3 (Moderate)** | Non-blocking UI glitch, reporting delay, or minor localized performance degradation | $\le 4\text{ hours}$ | Daily |
| **SEV-4 (Low)** | Minor copy error, feature request, or cosmetic styling defect | $\le 2\text{ business days}$| Next sprint planning |

### 4.2 Contact & Escalation Chain (Addis Ababa, EAT Timezone)

```
                       ON-CALL ESCALATION HIERARCHY
 ┌────────────────────────────────────────────────────────────────────────┐
 │ PRIMARY ON-CALL: SRE & DevOps Engineer                                 │
 │ Mobile: <phone>       | Telegram: @MySeed_SRE_Lead                 │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ Unresponsive after 15 min
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ SECONDARY ON-CALL: Lead Backend Engineer                               │
 │ Mobile: <phone>       | Telegram: @MySeed_Backend_Lead              │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ Unresolved SEV-1 after 30 min
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ INCIDENT COMMANDER: Head of Engineering / CTO                          │
 │ Mobile: <phone>       | Telegram: @MySeed_CTO                       │
 └────────────────────────────────────────────────────────────────────────┘
```

---
*End of Runbook — MySeed Academy Production Engineering.*
