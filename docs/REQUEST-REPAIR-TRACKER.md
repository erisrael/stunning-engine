# Requested repairs and verification

Updated 2026-11-08. Implementation and verification are tracked separately. Setup instructions are in [KIOSK-SETUP.md](KIOSK-SETUP.md).

## Implemented

- [x] Live CMS direct access for all seven registered tables; native search/filter/pagination protocol and Filament-style row counts/page controls.
- [x] Native grade/subscription/purpose/history/feedback filters discovered from source tables. Complete-result live date/payment/column filtering with progress/cancel; complete cached filtering and adjustable row counts.
- [x] Strict date parsing, inclusive Addis Ababa boundaries and real payment/date aggregates; filtered exports.
- [x] Working CMS settings dialog, saved connection/role controls, automatic refresh scheduling with interval/lease/retry protection, and fresh authentication for sync.
- [x] Student/parent Load / Rebuild Data; live refresh for growth and real demographic/plan/status distributions.
- [x] Authenticated image/PDF receipt proxy with same-origin restrictions, explicit source errors, preview controls and local verification separated from upstream payment status.
- [x] Versioned snapshots, complete record inspection, filtering, export and deletion.
- [x] Per-user sealed credentials, tab access enforcement including deny-all, scoped aggregates and configurable feedback action permission; signed remote feedback action protocol.
- [x] Separate kiosk installation identity, service worker, icons, matching theme, device pairing and multiple sites; configured QR rotation/expiry. Face enrollment/capture, working-hour heartbeat alerts and printing fallback preserved.
- [x] Attendance date/search/status filtering and adjustable pagination.
- [x] Admin navigation loop fixed; cohesive expandable groups, no duplicate Email setup, dynamic role labels/sidebar configuration.
- [x] Persisted custom-role creation/assignment, existing Support/Sales/Operations departments, searchable and configurable question recipients with lead-only destinations.
- [x] Department finance request entry point, requester/Finance conversations, approval workflow and budget committed/available amounts.
- [x] Shared HR/inventory asset register, company/personal/leased ownership, assignments, stock movements, repair/replacement history/costs, exports and maintenance recommendations.
- [x] Existing leave type Hide / Archive / Restore retained and inspected.
- [x] Dedicated developer sprint/project/roadmap planners retained; shared persisted discussion boards and one-to-one request/confirmation workflow replace local demo storage.
- [x] Lead-only repository configuration and GitHub collaborator API; regular developers restricted to assigned/member repositories.
- [x] Developer document, quality-case and release proposal approval workflows; reports scoped by period/sprint/person/project/status with matching exports.
- [x] Chat-first movable assistant/microphone, role-scoped navigation, JSON bilingual fallback, inventory advice and Routines page routing.
- [x] Amharic text/attribute translation restoration; decorative assistant/CMS emoji replaced with icons/text.

## Verification

- Read-only live Noor evidence: 5,139 students; 25-row pages returned ranges 1–25 and 26–50; unmatched search returned zero; Grade 5 plus Active returned 25. Metadata inspected for all seven categories. Signed feedback mount inspected without submitting a real change.
- Full server suite: **48 files, 1,290 checks passed**. Server regressions cover filters/date boundaries, signed remote protocols, permissions, shared boards, private sessions, inventory, budget requests, custom roles/credentials, archive persistence, report scopes and lead approvals. Scheduled refresh checks verify disabled state, interval and failure spacing.
- Browser checks passed: navigation (26), QR check-in (29), developer flow/planners/tools (49), face capture/fallback (8), and repair screens (22). The repair suite covers actual CMS settings, cached filtering beyond 100 records, archive export, resource requests, Amharic restoration, draggable assistant and kiosk installation/mobile layout.
- Production build passed; existing dynamic-filesystem tracing warnings in backup code remain.
- [x] Final browser regression: **187 checks passed across seven suites**: navigation 26, QR 29, developer flow 49, face 8, repair screens 22, attendance 27, assistant/routines 26. Attendance includes the paired kiosk at phone width and authenticated Excel export.
- Deployment uses the existing main-branch VPS release process, with a database backup and health-check rollback. The final delivery records the verified live release.

## External acceptance limits

- A sampled pending-review invoice's download endpoint returned HTTP 403 under the supplied Noor account and exposed no slip image. The app now reports that access error; it cannot create an absent attachment or bypass Noor permissions. No real payment was approved during testing.
- GitHub invitations and feedback resolution are implemented, but no real collaborator invitation or customer feedback modification was sent as a test. Their live success requires the configured account's upstream permissions.
- Physical tablet/phone installation, real face matching/camera behavior and site connectivity must be checked on the intended hardware. Browser coverage does not replace those checks.
- Maintenance recommendations are based on recorded inventory data, not a physical equipment inspection. No unverified third-party “free API key” was added; assistant fallback works locally.
