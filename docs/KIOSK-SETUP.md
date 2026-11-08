# Attendance kiosk setup

1. Sign in as HR or Admin and open **Attendance → Capture** (`/attendance?tab=capture`). Configure each site separately, including its attendance checks and working hours. Add each entrance device under Kiosks and select its site.
2. Configure the permitted capture methods and QR refresh interval. Printed QR badges/posters remain available as a fallback; this update does not remove them.
3. Generate the kiosk's pairing PIN or setup link. On the entrance tablet, phone or laptop, open `https://myseedops.tech/kiosk` and pair that device. Use a separate kiosk record for every device, including devices at the same site.
4. Choose **Install Kiosk App**. On Android/desktop Chrome or Edge, accept the browser's installation prompt. On iPhone/iPad, use Safari → Share → Add to Home Screen. This is a separately installed web app, with its own kiosk identity and start page; it is not an Android APK.
5. Allow camera access when using face capture. Enroll staff through the existing attendance face enrollment flow, with consent. QR display mode can be used without face enrollment.
6. Test an actual check-in and check-out, QR rotation, camera permissions, the correct site and timezone, and the printed fallback before leaving a device unattended. Keep the device powered and prevent its screen from sleeping during working hours.
7. Check the kiosk's heartbeat in Attendance. Existing working-hours silence alerts tell leads/HR to record attendance manually if a kiosk stops reporting. Review queued offline captures after reconnecting.

The app includes a service worker and an offline capture queue. A first installation, new sign-in, face-model download and some uncached screens require connectivity. Physical-device installation, real cameras and biometric matching require acceptance checks on the intended devices; desktop browser tests cannot certify those.

# Where to find the other additions

- **Legacy CMS** (`/legacy-cms`): CMS Tables & Pages → choose a table → Live or Cached. Native Noor filters are discovered from that table. Additional date/payment/column filters scan the complete live result before applying local pagination. The scan shows progress and can be cancelled. Cached filters and exports use all loaded records.
- **Legacy CMS → Settings**: shared connection, automatic refresh interval and role table visibility. Automatic refresh uses the shared account and runs on the server; per-user credentials are for direct access. Failed or incomplete reads preserve the previous cache.
- **Admin → Noor legacy CMS** (`/admin?tab=legacy-cms`): each user's credentials, allowed tabs, and permission to resolve feedback. Blank replacement passwords preserve the saved credential. An empty tab selection denies access.
- **Student → Parent Contact Directory**: use Load / Rebuild Data to read the source tables and rebuild the directory. Missing source relationships are not invented.
- **Finance & Approvals**: date/payment/status/search filters affect the totals and rows together. Receipt previews use the signed-in user's Noor credentials. Local receipt verification does not approve a payment in Noor.
- **Scraped Archives & Storage Management**: create a named snapshot version, inspect all records with search/date/category filters, export the filtered result, or delete a selected version.
- **Finance requests & equipment** (`/resources`): Requests, Equipment & stock, and Maintenance insights. Each department can submit device/subscription/budget/repair/other requests and discuss its request with Finance. Finance manages approvals and budgets; Finance/Admin manages inventory, assignments, stock movements, repair history and costs. Personal/company/leased ownership is supported. Maintenance advice uses recorded status, dates, repair frequency and costs.
- **Admin → Roles / Sidebar**: create custom roles, set capabilities and configure visible navigation. **Questions → routing configuration** controls recipient roles and lead-only destinations. Recipient selectors are searchable.
- **Dev → Plan / Tools**: dedicated sprint, project and roadmap views; lead-managed repository connections and GitHub invitations; draft/review/accept workflows for documents, quality cases and release proposals. Reports can select period, sprint, person, project and status. Shared discussion boards support project/feature scope, replies and lead-controlled visibility. One-to-one requests are visible to the requester and team leads.
- **Assistant**: chat first, personalized greeting, role-aware links, local bilingual JSON fallback, a “What can you do?” prompt, and a link to the Routines page. Drag the desktop grip/header to reposition the assistant/microphone dock; double-click the grip to reset. Inventory questions can return recorded maintenance recommendations.
- **HR → Leave types**: Hide / Archive preserves the type and existing records; Restore makes it available again.
