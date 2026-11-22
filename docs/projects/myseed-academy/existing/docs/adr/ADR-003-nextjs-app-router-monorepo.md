# ADR-003: Monorepo Architecture with Next.js 14+ App Router

## Status
Accepted

## Context
The platform has two distinct web applications:
1. `apps/web`: Public, SEO-critical, multilingual educational portal.
2. `apps/admin`: Secure, role-gated administrative operations console.

Both share the design system (`packages/ui`), TypeScript types, and configuration.

## Decision
1. Organize the repository as a monorepo utilizing npm/pnpm workspaces and Turborepo.
2. Build both frontends using **Next.js 14+ with App Router**:
   - `apps/web`: Server Components (RSC) for maximum Core Web Vitals, SSR metadata generation, and dynamic `[locale]` localized routing.
   - `apps/admin`: Client-first administrative workbench with optimistic UI updates and protected layouts.
3. Share components via `packages/ui` and generated API types via `packages/types`.

## Consequences
- Shared component reusability and unified design language.
- Independent deployment configurations for web and admin applications.
- Accelerated build times via Turborepo artifact caching.
