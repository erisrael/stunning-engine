# MySeed Academy — Zero-Downtime Deployment Runbook

This guide describes how to deploy updates to the MySeed Academy production infrastructure with zero disruption to active visitors and in-flight donation checkouts.

---

## 1. Pre-Deployment Database Migrations
Always perform backward-compatible schema changes first before updating application code:

```bash
# 1. Inspect pending migration SQL
npx prisma migrate diff --from-schema-datamodel --to-schema-datamodel

# 2. Deploy non-breaking migrations (add columns, add tables, add indices)
npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

> **Rule:** Never drop or rename active columns in the same release as code changes. Use the expand-contract pattern across two deployment cycles.

---

## 2. Containerized Rolling Update Workflow

### Using Docker Compose
```bash
# 1. Pull latest git revision
git pull origin main

# 2. Build updated container images in parallel
docker compose -f docker-compose.prod.yml build api web admin

# 3. Rolling update of API service
docker compose -f docker-compose.prod.yml up -d --no-deps --scale api=2 --no-recreate api
# Wait 10 seconds for health check verification
docker compose -f docker-compose.prod.yml up -d --no-deps api

# 4. Rolling update of Next.js frontend services
docker compose -f docker-compose.prod.yml up -d --no-deps web admin

# 5. Clean up dangling images
docker image prune -f
```

---

## 3. Post-Deployment Smoke Verification
Run automated health check probes against the live gateway:

```bash
# 1. Verify API liveness
curl -f https://api.myseedacademy.org/healthz

# 2. Verify Database & Redis readiness
curl -f https://api.myseedacademy.org/readyz

# 3. Verify OpenAPI documentation schema
curl -f https://api.myseedacademy.org/api/developer/openapi.json | head -n 10
```

---

## 4. Emergency Rollback Procedure
If unexpected errors occur during deployment:

```bash
# 1. Identify previous healthy commit
git log --oneline -n 5

# 2. Revert to previous stable tag
git checkout <PREVIOUS_HEALTHY_TAG>

# 3. Rebuild and redeploy containers
docker compose -f docker-compose.prod.yml up -d --build
```
