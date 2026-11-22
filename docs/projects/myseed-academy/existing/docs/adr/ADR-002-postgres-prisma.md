# ADR-002: PostgreSQL 16 with Prisma ORM

## Status
Accepted (Supersedes sqlc and goose design)

## Context
The platform requires rich relational modeling across multilingual translations, content hierarchies, donations, inquiries, and audit logs. Using Prisma ORM in the TypeScript ecosystem provides declarative schema modeling, auto-generated type-safe queries, migration automation, and zero SQL boilerplate.

## Decision
1. **Database:** PostgreSQL 16 with UUID primary keys and JSONB fields.
2. **Data Layer:** Centralized in `@myseed/database` (`packages/database`) using **Prisma ORM**.
3. **Migrations:** Managed through declarative `prisma migrate dev` and `prisma db push`.
4. **Client Sharing:** A singleton PrismaClient instance is exported from `@myseed/database` and directly consumed by `@myseed/api`.

## Consequences
- 100% type safety between PostgreSQL database tables and TypeScript code.
- Visual inspection via `npx prisma studio`.
- Seamless compatibility with both local and cloud-managed PostgreSQL (Supabase, Neon, AWS RDS).
