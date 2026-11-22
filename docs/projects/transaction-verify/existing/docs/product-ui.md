# Product and UI specification

## Screens and users

| Surface | Primary screens | Primary user |
|---|---|---|
| Customer submission | Payment summary, upload/scan/link form, progress and result, receipt or acknowledgment | Subscriber, donor, payer |
| Cashier | Find or create bill, scan receipt QR, payment result, authorized prior-use details | Cashier or branch operator |
| Myseed console | Payment history, review queue, receiving accounts, linked subscriptions and donations, failed actions | Academy finance and support staff |
| Commercial console | Organization and branches, payments, batches, receiving accounts, usage, billing | Organization administrators and operators |
| Partner administration | Private invite, approval reason, effective dates, usage limits, revoke access | Platform administrator |
| Developer console | Sandbox and live credentials, endpoints, provider coverage, API docs, webhook attempts | Integration developer |
| Platform operations | Queue age, provider availability, review volume, delivery failures, audit history | Platform operator |

The academy's website and app own the learner and donor experience. They can use the embedded submission flow or link to a scoped verification page. Their backends own membership, campaign, fee, and sponsorship records. Commercial integrations own equivalent business records.

## Visual direction

Use a neutral background, dark text, thin borders, one accent color for primary actions, and restrained success, caution, and error colors. Use words and simple line icons with labels for statuses and actions. Use no emoji anywhere in application navigation, notifications, empty states, status messages, or SDK defaults. Color and icons supplement readable text. Use a consistent type scale, visible focus indicators, accessible contrast, keyboard navigation, and touch targets suitable for cashier phones.

Show the amount, currency, purpose, expected recipient label, and integration's order or request reference above the form. Mask account identifiers. Support English and Amharic through message catalogs, with localized number and date formatting and Addis Ababa time for local staff. Store timestamps with timezone and keep the provider payment time distinct from the system acceptance time. Receipt and review details must remain readable on mobile and desktop.

### Submission layout

```text
Confirm your payment
Myseed Academy                       Request SUB-431
Monthly subscription                  ETB 1,000.00
Receiving account                     Academy collections

Upload receipt     Scan QR     Paste receipt link
[ Choose receipt ]

[ Verify payment ]
```

The screen retains context while switching input modes. On a small screen, prioritize one input control and the active status. A camera permission denial offers upload and paste immediately. A scheduled retry keeps the submitted evidence and provides a link to resume the same status.

### Cashier result

```text
Bill 1842                 ETB 1,250.00
Payment check             Already used

Provider                  Fixture Bank
Accepted previously       5 November 2026, 2:34 PM EAT
Current bill              Payment still due

[ View original payment ]   [ Scan another receipt ]
```

The original payment action appears only for staff who can access that record. A new scan starts a new attempt on the current bill. The cashier can leave a pending check and return to it by bill number.

### Staff review

```text
Review queue / Payment SUB-431
Reason                    Recipient unconfirmed

Submitted receipt         Provider evidence
ETB 1,000.00              ETB 1,000.00
Reference TX-317          Reference TX-317
Academy collections       Recipient details unavailable

[ Request correction ]   [ Attach account evidence ]   [ Record decision ]
```

The detail view presents evidence and checks side by side at wide widths and in reading order on mobile. The reviewer records a reason and the authoritative account evidence used to resolve the case. Actions that require additional evidence stay disabled with an explanation.

## Feedback and recovery

Every non-success state includes a specific reason and an action. A generic message is reserved for unexpected failures and includes a tracking reference. The same reason code powers the SDK, the hosted flow, and staff tooling.

| Status or reason | Example display | Primary action |
|---|---|---|
| Queued or processing | Checking payment with the provider. | Check status |
| Unreadable evidence | We could not read the transaction reference. | Upload a clearer receipt, scan the QR, or paste the official link |
| Unsupported format or link | This receipt format or link is unavailable for the selected provider. | Choose a supported method |
| Reference not found | The provider could not find this reference. | Check reference or follow the retry prompt for recent transfers |
| Recipient mismatch | The receiving account differs from the one required for this payment. | Review the transfer details or contact support |
| Amount mismatch | This bill expects ETB 1,000.00. The provider confirms ETB 800.00. | Correct the evidence or use the approved installment process |
| Receipt conflict | The uploaded amount differs from the amount returned by the provider. | Submit the original or request review |
| Already used | Already accepted on 5 November 2026 at 2:34 PM EAT. | Staff can open the previous payment if authorized |
| Pending retry | The provider is unavailable. Your receipt is saved for another check. | Track progress |
| Needs review | The provider could not confirm the receiving account. | Send the requested evidence or wait for staff review |
| Rate limit reached | Too many requests. Try again in 30 seconds. | Resume after the countdown without losing form input |
| Accepted and receipt issued | Payment confirmed. Your receipt is available. | View receipt |
| Accepted, fulfillment pending | Payment confirmed. Subscription activation is still processing. | Track activation |
| Request expired | This payment request has expired. | Ask the app to renew it or contact staff if already paid |

Public feedback for reused receipts omits other customers, branch details, and precise prior-use timestamps unless the viewer is authorized. Successful verification and downstream action errors remain distinct. Staff can review the evidence, see exact checks, record a reason, and request a correction without erasing earlier attempts.

## Role and layout rules

- Organization administrators manage staff, branches, integrations, and approved receiving accounts. Staff authorization is explicit per organization and branch.
- Operators submit and search their authorized branch records. Reviewers can handle exceptions with logged evidence and a reason. Platform operators handle provider health and private partner approvals.
- The dashboard opens with tasks requiring action, recent payments, and provider availability. Tables filter by status, date, branch, provider, purpose, and reference. Exports follow the same permissions and privacy rules as the source view.
- The review queue shows source, recipient, amount, date, receipt consistency, previous use, and the next permitted action. Missing facts remain visibly unconfirmed.
- The developer console distinguishes sandbox and live everywhere a key, endpoint, or payment is displayed. Secrets are revealed once and can be rotated. Free partner access is issued through a private admin workflow.
