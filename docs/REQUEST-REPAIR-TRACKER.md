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

- Fresh authentication on 2026-11-08 returned HTTP 200 / application/pdf for four sampled invoices (two pending review and two paid), including the invoice that previously returned 403. No separate image attachments were exposed in these samples. Missing or denied upstream attachments remain explicit errors; no real payment was approved during testing.
- GitHub invitations and feedback resolution are implemented, but no real collaborator invitation or customer feedback modification was sent as a test. Their live success requires the configured account's upstream permissions.
- Physical tablet/phone installation, real face matching/camera behavior and site connectivity must be checked on the intended hardware. Browser coverage does not replace those checks.
- Maintenance recommendations are based on recorded inventory data, not a physical equipment inspection. No unverified third-party “free API key” was added; assistant fallback works locally.

## Follow-up verification, 2026-11-08

- [x] Separate uploaded PDF slips from image attachments; preserve signed URL query separators, relative links and lazy-loaded images.
- [x] Include custom roles in assistant admin controls and persist options for role keys containing digits.
- [x] Separate sidebar labels, counters and dropdown controls; compact counters preserve the full accessible count.
- [x] Apply role and personal visibility to nested links, department sections and filtered destinations; retain hidden rules beyond 60 selections and refresh already-open sessions on focus/every minute.
- [x] Expand Admin sidebar configuration to admin subpages, department views, settings and custom departments; support custom-role labels.
- [x] Remove duplicate Admin category/page navigation and Board/List/Sheet switches; preserve functional tabs and carry filters between sidebar work views.
- [x] Show the direct Noor CMS link for users with granted CMS access, including per-user overrides.
- [x] Live CMS, connection checks, full scrapes, directory rebuilds and analytics refreshes use tracked background jobs with short browser status requests, progress, cancellation and private per-user results.
- [x] Slow source responses get a bounded 60-second budget and a retry; authenticated sessions/table snapshots are reused. Live full-result filter scans retain completed pages after failure and resume on Retry query.
- [x] Database workers claim jobs once; interrupted jobs become retryable errors; completed job data expires after 24 hours. Existing cache survives failed scrapes.
- [x] Focused server verification: 74 checks passed across eight files. Production build passed with existing backup tracing warnings.
- [x] Read-only Noor verification: 5,290 students; 25-row pages returned ranges 1–25 and 26–50; unmatched search returned zero. Authentication took 1.9 seconds; first page 4.7 seconds and reused-session second page 2.5 seconds.
- [x] Sidebar browser verification: 36 checks passed, including admin visibility in an open session, counter/dropdown spacing, collapsed controls and phone group toggles. Repair screens: 23 checks passed.
- [x] Production database backup created before publishing: myseed-20261108-1613.json.gz, 24,856 rows.
- [x] Final browser verification: 69 checks passed (navigation 36, repair screens 23, CMS background flow 10). The CMS browser fixture delays its first response by 22 seconds, checks responsive controls, row counts and paging, retries HTTP 503, publishes a full cache and resumes a date-filter scan after page two fails.

## Follow-up requested 2026-11-09

- [x] Restore attendance sections for admins/leads and add Attendance to the admin sidebar.
- [x] Restore working page tabs in Admin, Settings, Email, Studio, Owners, HR and Finance; Settings includes Teams.
- [ ] Verify and deploy the attendance/tab restoration before subsequent changes.
- [ ] Verify Brevo/Resend configuration and Data Manager import display.
- [ ] Require import previews and team-lead approval; deny regular-member imports unless Admin explicitly enables them.
- [ ] Add appropriate Finance requests/equipment import templates and workflows.
- [ ] Verify configurable automatic backups and point-in-time restore behavior.
- [ ] Add verified Gmail account linking, configurable Google sign-in/password recovery and admin-controlled editable profile fields.
