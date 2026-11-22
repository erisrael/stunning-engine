# MySeed Academy — Production Readiness Checklist

**System Boundary Standard:** Complete institutional website & digital platform. Customer support desk ticket assignment and agent live chat strictly isolated to the separate mini-app.

---

## 1. Security & RBAC Isolation
- [x] **AES-256-GCM Vault:** All external integration keys (Chapa, Stripe, Resend, Google Translate) encrypted at rest with hardware-accelerated cipher.
- [x] **Zero Plaintext Key Leakage:** API returns only masked previews (`••••••••1e49`). Plaintext is never returned over HTTP.
- [x] **Developer Role Boundary:** `DEVELOPER` role strictly denied access to donation transaction records, donor PII, and integration secrets.
- [x] **Rate Limiting:** Sliding window active on public gateway (`180 req/min`), logins (`15 req/15min`), and checkout/chat (`20 req/min`).
- [x] **Production Headers:** CSP, HSTS (`max-age=31536000`), X-Frame-Options (`DENY`), X-Content-Type-Options (`nosniff`).

---

## 2. Multilingual Localization (9 Languages)
- [x] **Tier 1 Explicit Authoring:** English (`en`) and Amharic (`am`) authored explicitly with full fidelity.
- [x] **Tier 2 Automated Fallback:** Spanish (`es`), French (`fr`), Arabic (`ar`), Chinese (`zh`), Hindi (`hi`), Portuguese (`pt`), Russian (`ru`) translated automatically with admin override support.
- [x] **Bi-directional Layouts:** Automatic RTL CSS orientation for Arabic (`ar`) with mirrored flex grids.
- [x] **Technical SEO Alternates:** `sitemap.xml` emits `xhtml:link rel="alternate"` across all 9 language variants with `x-default`.

---

## 3. WCAG 2.2 AA Accessibility
- [x] **Contrast Compliance:** Minimum 4.5:1 ratio for normal body copy, 3:1 for bold headings.
- [x] **Bilingual Alt Text:** Mandatory English and Amharic alt text on every uploaded media asset before publishing.
- [x] **Keyboard Navigation:** Focus rings (`focus-visible:ring-2 focus-visible:ring-emerald-500`) on all interactive buttons and modals.
- [x] **ARIA Semantics:** Dialog roles, live regions for chat triage, and explicit aria-expanded states.

---

## 4. Payment & Giving Architecture
- [x] **Decoupled Gateway Layer:** Seamless runtime switching between Chapa (Ethiopia ETB) and Stripe (USD/international).
- [x] **Idempotent Webhooks:** Transaction status updates wrapped in atomic transactions with HMAC signature verification.
- [x] **Account-Free Donations:** Anonymous supporter options with zero mandatory account creation friction.

---

## 5. Performance & Telemetry
- [x] **Sub-Second TTFB:** Redis caching layer and Next.js dynamic segment prefetching.
- [x] **Core Web Vitals:** Real User Monitoring (RUM) beacon reporting LCP, CLS, FID/INP, and FCP to `/api/analytics/event`.
- [x] **Zero-Cookie Analytics:** 100% GDPR-compliant aggregate traffic and zero-result search gap tracking without logging personal IP addresses.
