# Verification and organization data audit — 2026-11-15

The credential-save failure was reproduced in an isolated PostgreSQL database. The same faulty audit call is shared by Chapa, YaYa and ArifPay. The user identified Chapa as the affected provider. The original production request ID was not retrieved; the local database was offline.

## What caused the credential error

Saving a provider key inserted the encrypted credential first, then tried to audit the provider's text ID (`chapa`, `yaya`, or `arifpay`) in `audit_events.subject_id`, a UUID column. PostgreSQL rejected the audit insert with `22P02: invalid input syntax for type uuid`. The HTTP request therefore returned 500 even though the credential had already been saved.

Save, remove and test actions now audit the organization UUID and retain `providerId` in the event details. Saving/removing credentials and writing their audit record are now one transaction.

## What verification results mean

| Display | Meaning |
| --- | --- |
| Paid | The bill has an acceptance record; this is separate from the latest receipt check. |
| Not accepted | This receipt check was rejected. This does not prove that no money moved. |
| Payment still processing | The provider returned pending; another check is scheduled. |
| Verification unavailable | Verification could not finish. This is not evidence of a failed transfer. |
| Needs review | A reviewer must investigate. Exhausted retries no longer promise another automatic retry. |
| Already used | The transfer already paid another request. |
| Expired / Cancelled | The bill is closed, even if an earlier receipt check remains recorded. |

Successful checks now expose the same details as unsuccessful ones: provider response, provider diagnostic, reference, amount, payment time, matched account, timestamps and check ID. Payment detail pages also show provider diagnostics. Unknown/staff rejection reasons no longer mark unproven validation steps as passed.

Connector hardening refuses success-shaped HTTP errors, mismatched references, missing transaction identity, zero amounts and malformed responses. YaYa no longer assumes success when status is missing, and preserves alphanumeric wallet identifiers. Chapa rejects test-mode records in the live connector and handles null/malformed JSON without throwing. Authentication/configuration errors retain their specific explanation instead of becoming an alleged failed transfer.

## Connections and route coverage

Receiving accounts now offers separate YaYa API key and secret fields, a provider-specific account-proposal button, and a read-only reference lookup for Chapa, ArifPay and YaYa. Tests show the provider result and whether the recipient matches an approved active account. They never charge money or accept a bill. An active account and a successful diagnostic do not bypass bill validation or pilot review.

Existing receipt connector tests cover CBE, telebirr, Bank of Abyssinia, Awash, Dashen, Zemen, CBE Birr, M-PESA Ethiopia, Siinqee, Abay, eBirr, Nib, Ahadu, Cooperative Bank, Wegagen and Bunna. Tests exercise approved hosts/paths, lookalike-host rejection, reference parsing, provider errors, rate limits, empty/unrelated responses and supported receipt layouts. Merchant tests additionally cover Chapa, ArifPay and YaYa request/authentication construction and response validation.

These are fixture and integration results, not live bank certification. Production connectivity, valid merchant credentials and actual paid transaction references were not supplied or used. Pilot providers remain in pilot. The existing platform method live-check/certification tools remain available for receipt-based providers.

Official references checked: [Chapa verification](https://developer.chapa.co/integrations/verify-payments), [Chapa response meanings](https://developer.chapa.co/integrations/responses), [YaYa API authentication](https://docs.yayawallet.com/hc/main/en/categories/integration-and-api), [YaYa SDK setup](https://docs.yayawallet.com/hc/main/articles/1713272101-sdk-integration), and [ArifPay SDK](https://github.com/Arifpay-net/phpsdk).

## Organization reset and import

Data now offers a table-only reset/import and an all-supported-payment-data option. Existing backup creation/download remains available. The operation requires data-management permission, a row preview in the UI, an exact confirmation phrase, and configured archive storage for a safety backup.

The safety snapshot is taken after acquiring write locks on selected tables. Replacement is transactional, tenant-scoped, and keeps database constraints enabled. Table-only operations refuse dependent rows instead of silently cascading. Imports validate organization identity, every selected row's tenant, schema migration versions and compressed/decompressed size limits. Invalid data rolls back. Money values retain exact precision.

Accounts, credentials, users, permissions, organization settings, billing, audit history and backup metadata are retained. This is payment-data maintenance, not an unrestricted organization deletion tool. Receipt objects are neither deleted nor imported. Restored queued work can resume. Imports currently require a backup from the same migration version and are limited to 16 MB compressed / 64 MB decompressed.

## Validation and deployment

- 49 provider connector tests passed.
- 25 API tests and 8 message-catalog tests passed.
- Persistence migration-list tests passed; its optional external-database test is skipped without DATABASE_URL_TEST. Disposable-database integration tests apply all migrations.
- Existing admin-tools, bank-link and cashier integration tests passed.
- New integration tests passed for provider credentials, independent account approval, read-only lookup, recipient matching, table dependency protection, tenant isolation, safety backups and reset/restore of an accepted payment.
- Browser fixtures passed at 320, 390 and 1280 pixels for credentials, account proposal, recipient warnings, reset confirmation and import controls.

Apply migration `036_verification_details.sql` before deploying the new API/worker, then deploy the rebuilt web app. Historical observations do not gain diagnostics retroactively. No production deployment, live payment test, existing-data reset or existing-data import was performed.

## Local migration follow-up

On user request, the configured local database (`127.0.0.1:5433/transaction_verify`) was migrated through 036. It previously used Windows-1252 and had only migrations 001–003. A backup was created, all 59 rows across 31 tables were copied as exact PostgreSQL JSON into a UTF-8 database, and migrations 004–036 were applied successfully. The original database remains available as `transaction_verify_win1252_before036`. Re-running migrations reported 0 applied and 36 current. This was a local migration, not a production deployment.
