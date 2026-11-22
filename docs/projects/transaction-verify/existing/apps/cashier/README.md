# Cashier

Installable cashier PWA (Phase 4): find or create a bill, scan the receipt QR with the camera, show the result, and resume a pending check by bill number. Items captured offline are marked "Not sent" and are never shown as paid.

Rules: [UI guidelines](../../docs/ui-guidelines.md), [PWA plan](../../docs/pwa.md).

Status: built as the Cashier page of the web app at `/app/cashier` (`apps/web/src/pages/cashier.tsx`, API in `apps/api/src/console/cashier.ts`), with terminal mode for shared devices, the Not sent queue and the per-organization install. One install serves the console and the cashier. See [Employees, branches and the cashier](../../docs/branches-and-cashier.md).
