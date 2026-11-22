# Operations

## Local dependencies

`compose.yaml` starts PostgreSQL 17 and S3-compatible storage (MinIO) for the sandbox.

```sh
docker compose -f ops/compose.yaml up -d
cp .env.example .env        # then fill SUBMISSION_TOKEN_SECRET and ACCOUNT_DIGEST_KEY
npm run db:migrate
```

The storage image tag is pinned. Check it still exists before first use, or swap in another S3-compatible server; the API only needs private buckets and scoped upload URLs.

Deployment, monitoring, backup and incident runbooks are written in Phase 6 (see [docs/roadmap.md](../docs/roadmap.md)).
