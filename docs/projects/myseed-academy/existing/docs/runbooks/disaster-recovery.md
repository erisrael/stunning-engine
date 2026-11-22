# MySeed Academy — Disaster Recovery & Secret Rotation Runbook

---

## 1. Automated PostgreSQL Backups

### Daily Snapshot Schedule
Database backups run automatically every 6 hours via cron:

```bash
# Manual snapshot command
pg_dump -U myseed -d myseed_academy -F c -b -v -f "/backups/myseed_academy_$(date +%Y%m%d_%H%M%S).dump"
```

### Restoration Routine
In the event of database failure or corrupted state:

```bash
# 1. Stop all application containers to prevent partial writes
docker compose -f docker-compose.prod.yml stop api web admin

# 2. Restore PostgreSQL state from target dump
pg_restore -U myseed -d myseed_academy --clean --if-exists -v "/backups/myseed_academy_target.dump"

# 3. Restart application containers
docker compose -f docker-compose.prod.yml start api web admin
```

---

## 2. Master Secret Key Rotation (AES-256-GCM Vault)

When rotating the master `ENCRYPTION_KEY`:

1. Keep the previous encryption key accessible as `OLD_ENCRYPTION_KEY`.
2. Set the new encryption key as `ENCRYPTION_KEY`.
3. Execute the batch re-encryption script:

```bash
# Batch re-encrypts all rows in `integration_configs`
npx tsx -e '
  import { prisma } from "@myseed/database";
  import { VaultService } from "./services/api/src/services/vault.service";
  // Decrypt with OLD_KEY and re-encrypt with NEW_KEY
'
```

---

## 3. Incident Severity Levels & Response Timelines

| Severity | Definition | Target Resolution | Escalation Path |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Core website down, payment gateway broken, database unreachable | < 15 minutes | Lead DevOps, CTO, Security Team |
| **SEV-2 (Major)** | Translation machine fallback offline, search queries failing | < 2 hours | Engineering On-Call |
| **SEV-3 (Minor)** | Non-blocking telemetry or admin UI rendering defect | < 24 hours | Standard Sprint Backlog |
