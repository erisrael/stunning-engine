# ADR-001: Modular Monolith Architecture in Express & TypeScript

## Status
Accepted (Supersedes Go modular monolith design)

## Context
The MySeed Academy platform requires rapid feature iteration, full-stack end-to-end type safety, unified tooling across all packages, and seamless integration with ecosystem SDKs (e.g. payment processors, translation engines, email providers). Additionally, standardizing on a single runtime (Node.js) maximizes maintainability and allows any frontend or backend developer to work across the entire codebase with zero cognitive friction.

## Decision
We adopt a **Unified TypeScript Modular Monolith**:
1. **Core API:** Built using **Express.js with TypeScript** in `services/api`.
2. **Domain Isolation:** Organized cleanly by routes, controllers, services, and pluggable provider abstractions (`internal/providers/`).
3. **End-to-End Type Safety:** Direct consumption of shared models, validation schemas (Zod), and types from `@myseed/types`.
4. **Provider Abstractions:** External services (Payment, Email, Storage, AI, Translation, Search) communicate through strongly typed interfaces.

## Consequences
- Single language across `apps/web`, `apps/admin`, `packages/ui`, and `services/api`.
- Immediate local execution using existing Node.js environment.
- Elimination of code-generation bridge tools between Go and TypeScript.
