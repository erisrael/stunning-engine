# MySeed Academy: Feature Inventory

Every feature in the platform, grouped by the 22 phases of `docs/architecture/stage_map_and_implementation_plan.md`, with where it lives in the code. Status reflects what is implemented and verified in this repository.

Legend: **Web** = `apps/web` (public site, port 3000) · **Admin** = `apps/admin` (console, port 3001) · **API** = `services/api` (port 8080) · **UI** = `packages/ui`

---

## Phase 0: Discovery and boundaries

| Feature | Where |
| --- | --- |
| Website and support mini-app boundary: the site never creates tickets; support goes to the FAQ, the assistant, WhatsApp, or Telegram | Web `support/`, `components/chat-widget.tsx`; copy states it explicitly |
| Architecture decision records ADR-001 to ADR-005 | `docs/adr/` |

## Phase 1: Monorepo and Express core API

| Feature | Where |
| --- | --- |
| npm workspaces: `apps/web`, `apps/admin`, `services/api`, `packages/ui`, `packages/types`, `packages/database`, `packages/config`, `tests` | root `package.json` |
| Express API with Helmet, CORS allowlist, request IDs (`X-Request-ID`), structured JSON logs with masked IPs | API `app.ts`, `middlewares/` |
| Graceful shutdown (SIGTERM/SIGINT) | API `index.ts` |
| Local PostgreSQL and Redis via Docker Compose | `docker-compose.yml` |
| **Automatic in-memory fallback**: if PostgreSQL is unreachable, every endpoint keeps working from a seeded, Prisma-compatible memory store | API `lib/db.ts`, `lib/memoryClient.ts` |

## Phase 2: Design system and accessibility

| Feature | Where |
| --- | --- |
| First-party component library modelled on Watermelon UI, themed with MySeed tokens (light and dark) | UI `src/` |
| Components: accordion, alerts, avatar and avatar group, badge, breadcrumb, button, button group, calendar, card, checkbox, collapsible, combobox, command palette, data table (search, sort, select, paginate), date picker, dialog, dropdown menu, form field (label, hint, error, aria wiring), honeypot, input, input mask, input OTP, label, pagination, popover, progress, radio group and radio cards, select, separator, sheet, skeleton, slider, Sonner toasts, spinner, switch, table, tabs with animated indicator, textarea with counter, toggle group, tooltip, kbd, empty state | UI `components/ui/` |
| Animated components: reveal, stagger, number ticker, marquee, word rotate, spotlight card, scroll progress, progress ring, gauge, animated list, carousel, choice chips, copy button, share button, theme toggle, stepper, timeline, read-more disclosure | UI `components/motion/` |
| Widgets: Ethiopia dot map with city pins, event scheduler (month grid and agenda), browser and phone frames, sparkline, bar chart, column chart | UI `components/motion/widgets.tsx` |
| Blocks: announcement bar, section and header, feature cards, bento grid, stats, blog card, team card, testimonial card, job row, contact card, CTA banner, error block, logo tile, integration card, KPI widget, site footer, auth layout, file dropzone, notification list, donation tier selector | UI `components/blocks/` |
| Brand mark and logo | UI `components/brand/logo.tsx` |
| Living catalog of every component, grouped as Components, Animated components, and Blocks | Admin `/design-system` |
| WCAG 2.2 AA: skip links, landmarks, visible focus, accessible names, reduced motion, 4.5:1 contrast in both themes | everywhere; verified by axe tests |
| Mobile-first layouts from 320px to ultra-wide | verified by responsive tests |
| RTL layout for Arabic (`dir="rtl"`, logical properties, mirrored icons) | Web `[locale]/layout.tsx` |
| No emoji anywhere in the interface | repo-wide |

## Phase 3: Database and translation engine

| Feature | Where |
| --- | --- |
| Prisma schema: languages, translations, categories, posts, team, FAQs, events, partners, job openings, testimonials, newsletter, inquiries, campaigns, transactions, users, media, audit log, search log, assistant log, integrations, feature flags, analytics events | `packages/database/prisma/schema.prisma` |
| Shared bilingual seed content used by the DB seed, the memory store, and the website's offline fallback | `packages/types/src/seed-data.ts` |
| `TranslationService` with pluggable providers (Google Cloud Translation, passthrough) | API `services/translation.service.ts`, `providers/translation.provider.ts` |
| Fallback chain: requested locale, cached machine translation, English | API `lib/localize.ts` |
| Editor overrides are never overwritten by machine output | API `TranslationService.syncEntityTranslations` |

## Phase 4: Authentication, RBAC, admin shell

| Feature | Where |
| --- | --- |
| PBKDF2 password hashing, HMAC-signed session tokens, HTTP-only cookie, constant-time checks | API `services/auth.service.ts`, `controllers/auth.controller.ts` |
| Roles: Super Admin (`system:*`), System Admin, Content Manager, Donation Manager, Developer (no donor data, no secrets) | API `ROLE_PERMISSIONS` |
| Wildcard permission matching (`system:*`, `content:*`) | API `AuthService.hasPermission`, Admin `lib/session.tsx` |
| Audit log for every successful admin change | API `middlewares/auditLog.middleware.ts`, Admin `/audit-log` |
| Admin shell: collapsible sidebar filtered by permission, Ctrl K page jumper, user menu, theme switch, mobile sheet | Admin `components/shell.tsx` |
| Route guard to `/login` and in-page permission gates | Admin `middleware.ts`, `RequirePermission` |
| Users and roles management (create, change role, deactivate; self-lockout and privilege-escalation guards) | Admin `/users`, API `/api/admin/users` |

## Phase 5: Bilingual CMS and media library

| Feature | Where |
| --- | --- |
| Generic CMS for articles, categories, FAQs, team, events, partners, careers, testimonials, campaigns | API `lib/resources.ts`, `routes/resource.routes.ts`; Admin `/content/[resource]` |
| English and Amharic required on every content type (validated server-side) | API `buildData` |
| Side-by-side bilingual editor with slug suggestions | Admin `components/resource-manager.tsx` |
| Background Tier 2 translation on save (Google Cloud Translation or Claude) | API `dispatchTranslations`, `providers/translation.provider.ts` |
| Translation review: per-language coverage, machine vs reviewed badges, manual overrides, re-translate | Admin `/translations`, editor Translations tab |
| Media library: drag and drop, 10 MB limit, MIME allowlist plus magic-byte checks, SVG sanitization, required English and Amharic alt text, edit, delete | API `services/media.service.ts`; Admin `/media` |

## Phase 6: Public website foundation

| Feature | Where |
| --- | --- |
| `/[locale]` routing for all 9 languages with location-aware detection: remembered choice, then English in Ethiopia, then browser language, then country language, then English | Web `middleware.ts` |
| Language suggestion banner on deep links, written in the suggested language, never forces a redirect | Web `components/language-suggestion.tsx` |
| Animated English / Amharic segmented toggle in the header and mobile menu, plus a menu for all nine languages | Web `components/site-header.tsx` |
| `lang` and `dir` switching per locale | Web `[locale]/layout.tsx` |
| Complete interface in all nine languages: English and Amharic written natively, Tier 2 machine translated with reviewed overrides | Web `lib/i18n/`, `lib/i18n/machine/` |
| `npm run i18n:translate` regenerates missing Tier 2 interface strings with Claude | Web `scripts/i18n-translate.ts` |
| Homepage with 16 sections: announcement, hero, partner marquee, impact stats, value features, program tabs, lesson bento, school solutions, language showcase, impact map, testimonials, news, events calendar, live campaign, FAQ, newsletter and closing CTA | Web `[locale]/page.tsx` |
| Server rendering with incremental revalidation and an offline content fallback if the API is down | Web `lib/api.ts` |

## Phase 7: Content hubs

| Feature | Where |
| --- | --- |
| About: mission, vision, story, values, milestones timeline, leadership | Web `/about` |
| Team directory (leadership and staff) | Web `/about/team` |
| Partners by type | Web `/about/partners` |
| Programs overview and four grade-band pages (subjects, outcomes, lesson approach) | Web `/learning`, `/learning/[grade]` |
| School solutions: what is included, process, who pays, school FAQs | Web `/schools` |
| Request-a-demo form (role, region combobox, phone mask, student count, preferred date, grade chips) | Web `/schools/demo` |
| Resources hub; articles with category filters and pagination; article pages with reading progress, share, related articles | Web `/resources`, `/resources/articles`, `/resources/articles/[slug]` |
| Events calendar with agenda, add-to-calendar (.ics) downloads | Web `/resources/events` |
| FAQ explorer with search and category filters, deep links | Web `/resources/faq` |
| Careers list and job pages | Web `/careers`, `/careers/[slug]` |
| Privacy, terms, accessibility statements | Web `/privacy`, `/terms`, `/accessibility` |
| Localized 404 and error pages with correct HTTP status | Web `[locale]/not-found.tsx`, `error.tsx` |

## Phase 8: Multilingual search

| Feature | Where |
| --- | --- |
| Weighted search across articles, FAQs, events, team, and pages (title over summary over body) in the visitor's language plus both Tier 1 languages | API `services/search.service.ts` |
| Synonym expansion (for example math to mathematics, fees to tuition) | API `expandQuery` |
| Ctrl K / slash search dialog with keyboard navigation | Web `components/search-dialog.tsx` |
| Full results page | Web `/search` |
| Search insights: top queries, zero-result content gaps | Admin `/search-insights` |

## Phase 9: Technical SEO

| Feature | Where |
| --- | --- |
| Per-page titles, descriptions, canonical URLs, Open Graph and Twitter cards | Web `lib/seo.ts` |
| hreflang alternates for all 9 locales plus x-default | Web `alternates()` |
| Schema.org: EducationalOrganization, WebSite with SearchAction, FAQPage, NewsArticle, Event, JobPosting, BreadcrumbList | Web `lib/seo.ts`, pages |
| Dynamic sitemap (every page, article, job, and program in every locale), robots.txt, web manifest, favicon | Web `app/sitemap.ts`, `robots.ts`, `manifest.ts`, `icon.svg` |
| Generated Open Graph image per locale | Web `[locale]/opengraph-image.tsx` |

## Phase 10: Hybrid assistant and support

| Feature | Where |
| --- | --- |
| Verified FAQ matching with confidence scoring in English, Amharic, and Tier 2 | API `services/chatbot.service.ts` |
| Optional AI answers grounded only in the knowledge base (Claude; enabled by `ANTHROPIC_API_KEY`) | API `providers/ai.provider.ts` |
| Low-confidence handoff to WhatsApp and Telegram with the question prefilled; never invents fees | API, Web `chat-widget.tsx` |
| Unanswered-question queue; promote to a bilingual FAQ or dismiss | Admin `/assistant` |
| Support center with live search, channel cards, hours, assistant prompts | Web `/support` |

## Phase 11: Engagement workflows

| Feature | Where |
| --- | --- |
| Contact, school demo, and partnership forms with client and server validation | Web `components/inquiry-form.tsx`, API `controllers/inquiry.controller.ts` |
| Anti-abuse: honeypot, per-IP rate limits, input sanitization | API |
| Acknowledgement email with reference number | API `InquiryService` |
| Triage: status tabs with counts, type filter, detail sheet, reply by email, delete | Admin `/inquiries` |

## Phase 12: Donations

| Feature | Where |
| --- | --- |
| Pluggable payment providers: Chapa (and Telebirr through Chapa), Stripe Checkout, mock | API `providers/payment.provider.ts` |
| Three-step donation flow: campaign, amount (tiers or custom, one-time or monthly, provider), details (anonymous option) | Web `components/donate-flow.tsx` |
| Return page that verifies the payment and shows the receipt details | Web `/donate/success` |
| Idempotent webhooks with signature checks; campaign totals updated atomically; receipt email | API `services/donation.service.ts` |
| Campaign management and live progress | Admin `/content/campaigns`, Web `/donate`, homepage |
| Donation ledger and totals (hidden from the Developer role at both UI and API) | Admin `/donations` |

## Phase 13: Newsletter and email

| Feature | Where |
| --- | --- |
| Account-free subscription with language preference and welcome email | Web `newsletter-form.tsx`, API `services/newsletter.service.ts` |
| HMAC-signed one-click unsubscribe links (GET link and RFC 8058 POST) and a confirmation page | API, Web `/newsletter/unsubscribed` |
| Broadcast composer with audience by language, preview, confirmation; subscriber list and stats | Admin `/newsletter` |
| Pluggable email provider (Resend, logged mock) | API `providers/email.provider.ts` |

## Phase 14: Integration center

| Feature | Where |
| --- | --- |
| AES-256-GCM encrypted secret vault; secrets never returned to the browser | API `services/vault.service.ts` |
| Catalog of 14 integrations (Chapa, Stripe, Resend, Claude, Google Translation, S3 storage, WhatsApp, Telegram, Vercel, deploy hooks, PageSpeed, IndexNow, search console verification, alert channels) with the fields each provider's API requires, format validation, setup guides, and webhook URLs | `packages/types/src/integrations.ts`, Admin `/integrations` |
| Live tests per provider, runnable with unsaved values: credential checks, Chapa and Stripe test checkouts, test emails, Claude test prompts, sample translations, signed S3 requests, bot checks | API `services/integration.tests.ts` |
| Runtime configuration from the vault with environment fallback, so saved credentials apply without a restart; malformed environment keys are ignored and flagged | API `services/integration.service.ts`, `providers/registry.ts` |
| Credential rotation, enable and disable per integration | Admin `/integrations` |
| Feature flags (assistant, auto-translation, donations, demo bookings, newsletter, announcement bar) enforced by the API and the website | API `services/featureFlag.service.ts`, Admin `/integrations` |

## Platform operations (added after the original plan)

| Feature | Where |
| --- | --- |
| Profile editor: name, job title, phone, bio, photo, console language, sign-in email (needs current password), password change with strength meter that signs out other sessions | Admin `/profile`, API `PATCH /api/auth/profile`, `POST /api/auth/password` |
| Database-backed roles: create custom roles, edit any role's permissions in a matrix, reset built-in roles, delete unused custom roles; no privilege escalation, Super Admin locked, Developer barred from donor data and secrets; changes apply within seconds | Admin `/users` (Roles tab), API `services/role.service.ts`, `packages/types/src/rbac.ts` |
| SEO Manager role and seeded seo@ account | `BUILT_IN_ROLES` |
| SEO: site audit crawler with scores and issues, metadata overrides per page and language, redirects managed in the website middleware, keyword analysis, PageSpeed Insights, IndexNow, verification tags | Admin `/seo`, API `services/seo.service.ts`, Web `lib/seo.ts`, `middleware.ts` |
| Page builder: versioned homepage layouts, drag and drop, archive and restore sections, preview in an iframe at four device widths and nine languages, automated render tests in English and Amharic, apply to main site, restore any earlier version | Admin `/pages`, API `services/page.service.ts`, Web `[locale]/page.tsx`, `api/preview` |
| Rich text editor (Tiptap) for articles, FAQ answers, and event descriptions; strict server-side HTML allowlist; preview tab and draft previews on the website | Admin `components/rich-text-editor.tsx`, API `lib/sanitize.ts`, UI `RichText` |
| Finance: totals by gateway and currency, daily donations, success rate, live Chapa balances, Stripe balance, fees, net and payouts, verification of stuck payments | Admin `/finance`, API `services/finance.service.ts` |
| API usage: every outbound call logged with latency, tokens, units, and estimated cost; AI monthly budget enforcement; key rotation overview; billed Claude usage from the Usage and Cost Admin API | Admin `/usage`, API `lib/usage.ts`, `services/usage.service.ts` |
| Uptime monitoring with incidents, response times, and alerts; maintenance mode; deployment history and redeploys | Admin `/operations`, API `services/monitor.service.ts`, `services/alert.service.ts` |
| Theme switcher in the top bar of the website and the admin console | UI `ThemeMenu` |

## Phase 15: Developer platform

| Feature | Where |
| --- | --- |
| OpenAPI 3.1 document generated from the endpoint and CMS resource registries | API `services/openapi.service.ts`, `GET /api/developer/openapi.json` |
| Interactive API reference: sections, filtering, parameters, cURL and JavaScript snippets, "Try it", spec download | Admin `/developer` |
| System health: database mode and latency, memory gauge, event-loop lag, host, configured providers, record counts | Admin `/developer/health` |

## Phase 16: Privacy analytics and observability

| Feature | Where |
| --- | --- |
| Cookie-free page views and Core Web Vitals beacons; Do Not Track and Global Privacy Control respected | Web `components/analytics.tsx` |
| Analytics dashboard: daily views, top pages, languages, devices, referrers, Web Vitals p75 against targets | API `services/analytics.service.ts`, Admin `/analytics` |
| `/healthz` liveness and `/readyz` readiness (reports database mode) | API `routes/health.routes.ts` |

## Phase 17: Security hardening

| Feature | Where |
| --- | --- |
| Content Security Policy, HSTS, frame denial, nosniff, referrer and permissions policies | Web `next.config.mjs`, API `securityHeaders` |
| Rate limits: general API, login, and form/chat endpoints | API `middlewares/rateLimiter.ts` |
| No account enumeration on login; no hard-coded credential bypass | API `auth.controller.ts` |
| Output escaping in emails, JSON-LD escaping, markup stripped from stored content | API `lib/sanitize.ts`, Web `json-ld.tsx` |

## Phase 18: Performance

| Feature | Where |
| --- | --- |
| Static generation for every locale with incremental revalidation | Web pages (`revalidate`) |
| Self-hosted, subset fonts (Inter, Inter Tight, Noto Sans Ethiopic, Noto Sans Arabic) | Web and Admin layouts |
| Tree-shaken icon and motion imports; no stock images (generated covers and SVG illustrations) | Next config, `article-visual.tsx` |

## Phase 19: Quality assurance

| Feature | Where |
| --- | --- |
| API unit suites: vault, auth and RBAC, rate limiter, translation fallback, accessibility rules, database bootstrap, platform logic | `services/api/tests` (`npm test`) |
| Playwright E2E: public pages, locale switching, 404 status, search, SEO, contact, newsletter, assistant, donation, admin publish-to-site, Developer-role isolation, every console page | `tests/e2e` (`npm run test:e2e`) |
| axe-core WCAG 2.2 AA scans in light and dark mode for English, Amharic, and Arabic pages | `tests/e2e/a11y.spec.ts` |
| Responsive matrix at 320, 390, 768, 1280, 1920 px | `tests/e2e/responsive.spec.ts` |

## Phase 20: Deployment

| Feature | Where |
| --- | --- |
| Monorepo Dockerfiles (standalone Next.js output, non-root users, API health check) | `apps/*/Dockerfile`, `services/api/Dockerfile` |
| Production compose with migration and seed job, required-secret checks, persistent uploads | `docker-compose.prod.yml` |
| CI: install, Prisma generate, typecheck, unit tests, builds, E2E and accessibility | `.github/workflows/ci.yml` |
| Runbooks: zero-downtime deployment, disaster recovery, production readiness | `docs/runbooks/` |

## Phase 21: Continuous improvement loops

| Feature | Where |
| --- | --- |
| Zero-result search triage | Admin `/search-insights` |
| Unanswered assistant questions to FAQ | Admin `/assistant` |
| Translation quality review and overrides | Admin `/translations` |
| Web Vitals monitoring | Admin `/analytics` |
