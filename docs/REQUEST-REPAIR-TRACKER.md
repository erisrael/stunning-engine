# Requested repairs — verification tracker

Checked 2026-11-07. A checked item means the evidence below exists; unchecked items are unfinished or unverified.

## Implemented and checked
- [x] Live CMS search, per-page size and pagination use the remote table's signed Livewire snapshot.
- [x] Discover and show supported remote filters for each CMS table, including grade, subscription presence/status, invoice purpose, history action and feedback type/status.
- [x] Fix pagination counts when Filament wraps numbers in HTML elements.
- [x] Strict cached status/grade matching; missing fields no longer pass a selected filter.
- [x] Date parser: day/month/year, ISO, named months and relative dates; Addis Ababa boundaries; inclusive end date; actual Monday-based week.
- [x] Expose cached status, grade and payment method controls; reset cached page on filter changes; export displayed live filtered rows.
- [x] Kiosk screen and pairing use system theme tokens; separate manifest identity and real branding icon endpoint.
- [x] Type checking and focused date/filter/pagination regression assertions passed.

Read-only live evidence: 5,139 students; 25-row pages returned ranges 1–25 and 26–50; deliberately unmatched search returned zero; Grade 5 plus Active returned 25. Metadata inspected successfully for all seven registered CMS categories. No customer records were changed.

## Still required
- [ ] Global live date/payment filters (currently explicitly labeled as displayed-page filters); all-record cached filtering rather than limited loaded slices.
- [ ] Full finance/slip image and PDF validation; date/payment/other finance filters.
- [ ] Contact directory rebuilding and live growth/insights validation.
- [ ] Archive version viewing/deletion/filtering/export validation.
- [ ] Per-user credential persistence and server-side access enforcement audit.
- [ ] Kiosk installation on physical devices, multiple sites, configurable rotation, face capture, heartbeat alerts; preserve printed badge fallback.
- [ ] Attendance date/search/fetch/display row controls.
- [ ] Admin navigation loop reproduction, cohesive nonduplicate sidebar groups and configurable role sidebars.
- [ ] Customer support/custom roles, departments and configurable question recipients with searchable users.
- [ ] Department finance request entry points, budget management and complete equipment/inventory lifecycle.
- [ ] Leave type archive/hide behavior.
- [ ] Developer sprint/project/roadmap-specific planning; lead-only repository connection/collaborators; document/release/quality approvals.
- [ ] Developer reports by period/person/project, configurable discussions/whiteboards and one-to-one requests.
- [ ] Movable assistant/microphone; role-scoped chat/navigation, JSON fallback, routines page routing, Amharic and icon-only audit.
- [ ] Full browser regression, commit/push and verified production deployment of the complete requested scope.

## Kiosk setup
Open `/attendance?tab=setup` as HR/admin, create a kiosk for the entrance and obtain its pairing PIN or setup link. Open `/kiosk` on the target tablet/laptop, pair it, and use Install or the browser's Add to Home Screen option. Test camera permission, QR check-in, loss of connectivity and the printed badge fallback before using it for attendance. Physical-device installation remains unverified.
