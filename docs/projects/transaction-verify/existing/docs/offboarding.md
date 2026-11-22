# Offboarding an organization

For MySeed platform owners and operations: what happens when an organization leaves, step by step, and what it keeps. Billing details are in [billing.md](billing.md); the platform screens are in [platform-admin.md](platform-admin.md).

## Before offboarding

1. **Confirm in writing** that the organization wants to leave, or record the reason (for example unpaid invoices past suspension, or a breach of the terms).
2. **Give them their data.** Ask an organization admin to open **Administration, Data**:
   - **Make a backup**, then **Download**. This is every row of their organization as gzip JSON, without sign-in sessions.
   - Their exports (payments and accountant files) are under **Exports**.
   - Receipt files can be opened one by one from each payment. For a bulk handover of the receipt files, the platform team copies the organization's folder from the storage (`<organization id>/` in the receipts storage and in the archive, opened with the archive key).
3. **Settle billing.** Close open invoices, or write them off with a reason, in **Platform, Billing**.

## Offboarding

1. **Platform, Organizations, *organization*, Offboard.** Give the reason. The organization:
   - can no longer sign in
   - is not served by the worker
   - has its server keys stop working
2. The delete date is 30 days later. Until then a platform owner can **Reinstate** it, and nothing is lost.
3. After the delete date, the worker deletes the organization's data in batches:
   - receipt files in the main storage and in the archive
   - evidence bundles
   - payer details and personal data in its rows
   It then marks the organization **closed** and clears its contact email and phone.
4. The audit log keeps one `organization.data_deleted` record with the counts. That record is the proof of deletion: keep it and send it to the organization if they ask.

## What is kept after closing

- Invoices and payments to MySeed, as tax law requires. They hold the organization's legal name and TIN, not its payers.
- The audit log of the organization, without the deleted personal data.
- Backups made before closing hold the organization's rows until those backups are deleted:
  - nightly whole-database backups go after 14 days
  - console backups are deleted by hand
  For a deletion that must also reach backups, delete the organization's own backups on **Platform, Database** and wait out the nightly ones.

## Checklist

- [ ] Request or reason recorded
- [ ] Organization backup downloaded by them, or declined in writing
- [ ] Invoices settled or written off
- [ ] Offboarded with a reason; delete date noted
- [ ] After the delete date, the organization shows **closed** and the audit record exists
- [ ] Deletion record sent to the organization, if asked
