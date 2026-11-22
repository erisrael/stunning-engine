# Staff console: operator guide

The console is where Myseed staff (and later each commercial organization) handle what the system cannot decide alone: payments waiting for review, receiving accounts, webhooks that stopped, reconciliation and staff access. It runs on the same address as the API, at **https://transactionverify.myseed.com.et/console/**, and can be installed as an app on a phone or computer.

## First admin

1. In the control panel, **Hostinger VPS, Organization and first admin**, create the Myseed organization. The server key and webhook secret appear once. Put them in the Myseed API settings.
2. Open the first admin's setup link (it works once, for 72 hours). Choose a password of at least 12 characters.
3. Set up two-step sign-in. Scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or Aegis) and enter the code. Save the ten recovery codes somewhere safe, away from the computer. Each works once.
4. **Staff, Invite someone** creates a link for each colleague. Invite a second admin early: receiving account changes need two admins.

On a local sandbox, the control panel's **Sandbox, Staff console** card creates an admin for the sandbox organization. On the command line: `npm run console:admin -- --org <id> --email ... --name ...` and `npm run org:create -- --name ...`.

## Roles

| Role | Can |
|---|---|
| Admin | Everything below, plus staff, receiving accounts (with a second admin), settings, channels and the audit log |
| Reviewer | Decide payments in the review queue and open receipts |
| Operator | See payments and send stopped webhooks again |
| Viewer | Read the dashboard, payments, accounts, deliveries and reconciliation |

Receipts are evidence. Only people with Open the receipt files payers sent can open them, and every view is recorded in the audit log.

### Roles of your own and permissions

Each built-in role above is a fixed set of permissions. **Roles and permissions** (Administration) shows every permission against every role as a table of tick boxes, grouped by area (Payments, Cashier, Money in, People, Organization, Developers, Security, Data). Search it, show one area, show only your own roles, or show only the permissions where roles differ.

- **New role:** give it a name, start from any role's permissions, then tick or untick in the table and save. Copy makes a new role from an existing one.
- You can only give permissions you have yourself, and you cannot change your own role.
- A role still held by people cannot be deleted until they move; the delete dialog moves them to the role you choose.
- Changes apply at the person's next click. Every change is in the audit log.

**People** lists everyone with their role, branches, status and last sign-in. Search, filter by role, status or branch, and group by any of them. Tick people to change their role, or turn them off or on, together. Someone who was invited but never signed in can be removed; anyone with history can only be turned off, so their records stay.

## Review queue

A payment lands here when the provider confirmed the transfer but could not confirm something the decision needs. Usually that is which of your accounts received it (`recipient_unconfirmed`), or when it was paid while the request has a start date (`payment_time_unconfirmed`). A bank in pilot sends every payment here (`provider_pilot`): its own page was read and what it showed is on the payment, but a person decides until the bank is certified.

The screen puts **the payment request** next to **what the provider says**, with the payer's receipt below. To decide:

- **Confirm** only with account evidence. Attach a statement page or a screenshot from the account's own app that shows the money arriving. Choose the account it reached, and the payment time if asked. The decision, the evidence and your reason are stored together. The system then runs the same acceptance check as an automatic one. A confirmed review can still fail, for example on a wrong amount or a transfer that already paid another bill. Either way, the payer and the app get one result and one webhook.
- **Ask for corrected evidence** when the payer should send something else. They see "Staff asked for corrected payment details".
- **Reject** when the money did not arrive. The payer is told to contact support.

Two reviewers cannot decide the same payment. The second one is told it is already decided.

### Overdue cases and escalation

A case escalates when it is still waiting for a decision and either:

- its **due time** has passed (set when it is assigned), or
- it has no due time and has waited longer than the **waiting time** (24 hours unless an admin changes it).

An escalated case is marked in the queue ("Escalated: past due" or "Escalated: waited too long") and shows under **Overdue**. Its assignee and the admins who can see its branch get one notice in the notification center, with no names or amounts. The escalation is in the payment's activity. Giving the case a new due time lets it escalate again.

Admins change the waiting time, or turn it off so only due times escalate, under **Review queue, Escalation**. Escalation notices count as alerts in each person's notification choices.

## Receiving accounts

Payments are only accepted into approved accounts. An admin proposes a new account, or proposes disabling one, and a different admin approves it. Only the masked number (for example `ending 6789`) and a keyed digest are stored, never the full number. The first accounts of a new organization are added when it is created, because it has only one admin then. Each payment request remembers the accounts that were approved when it was created, so an account approved later never receives money for an older request.

- **Edit** changes the label at once. A new number or bank is proposed and needs a second admin; once approved, the old account is turned off and the new one takes its place, so payments already matched keep the number they reached.
- A turned-off account can be proposed to be turned on again (second admin).
- **Payments from other banks.** A payer may send from their own bank to your account at another bank (for example from CBE to your Awash account). The receipt shows your account, and it is matched against every account you have, at any bank or wallet.
- **Money sent somewhere else.** When the bank's own record shows a receiving account that is none of yours, at any bank or wallet, the payment is rejected (not sent to review) and the payment page says where it went (the last four digits and the name the bank shows).
- **Chapa.** If you take payments through Chapa, add a Chapa receiving account and save your live secret key in the Chapa card. Payers then give the Chapa transaction reference and it is confirmed with Chapa directly, whatever bank or wallet they paid from.

### How it was checked

Every payment page has a **How it was checked** card: each check in the order it ran, with what was found. Reading the evidence, the bank or wallet accepted by the organization, the request still open, the transfer found at the provider, the receipt matching the provider's record, paid to your account, not used before, currency, payment time and amount. A rejected or waiting payment shows the step that stopped it and why; later steps are marked not checked.

## Deliveries

**Webhooks that stopped** lists events your app did not accept after every retry. Fix the app, then press **Send again**. The event keeps its ID, so an app that dedupes by event ID applies it once. **Failed activations** lists actions your app reported as failed, such as a subscription that could not be activated.

## Reconciliation

Accepted money by day and purpose, in Addis Ababa time, with refunds and reversals. Compare it with the bank statement, and download it as CSV. Amounts are exact; they never pass through decimal rounding.

## Refunds and reversals

When money goes back, an admin records it on the payment's page: which part of the payment, refund (you sent it back) or reversal (the bank pulled it back), the amount, the bank's reference and why. The total can never exceed what was paid, even if two people record at the same moment. The bank reference makes it safe to press twice: the same reference with the same amount is recorded once. The app receives a signed `payment.adjusted` webhook, so it can end the subscription period or note the refund, and the payment's status shows every adjustment with what is left.

## Checking a bank statement

On **Reconciliation, Check a bank statement**, choose the account and the statement exported from online banking as CSV. The console needs a header row with a reference column (Reference, Transaction ID or FT number) and a Credit or Amount column; Date and Description are used when present. Each credit line is matched to an accepted payment by reference and exact amount:

- **Lines that match**: the statement and the verified payment agree.
- **Same transfer, different amount**: investigate first.
- **Credits with no accepted payment**: money that arrived without a verified payment, for example a payer who has not submitted evidence yet.
- **Accepted but not on the statement**: the provider confirmed it, but this statement does not show it (another account or another day).

The statement is read in memory and discarded. Only the counts are written to the audit log.

## Paying MySeed

Invoices are under **Package and billing**. Open one to see its lines: the package, verifications above the allowance, add-ons, discounts, tax and credits. An admin chooses **Pay** to open MySeed's payment page for the exact amount, pays from any accepted bank or wallet, and submits the receipt there. The invoice turns paid within a minute of the payment being accepted. **Print** gives a paper copy.

## Waiting for approval

A new organization starts as pending. Its admins give the business details MySeed checks on the home page: legal name, trade license number, TIN and what the business sells. The same card shows each check as MySeed records it. Live keys and payments start after approval. Once approved, the details are fixed; changes go through MySeed support.

## Home page

Each person chooses their own home page cards under **Customize** on the home page: numbers at a glance, my review work, accepted per day, by purpose, most common rejections, by receiving account, and by branch. They can hide, add and reorder cards. The choice is saved to their account, so it follows them to other devices, and nobody else's home page changes. The numbers follow the person's branches: someone limited to one branch sees that branch's numbers only.

## Branches and the cashier

Setting up branches, binding employees to them, and taking payments at the counter are in [Employees, branches and the cashier](branches-and-cashier.md).

## Notifications

Reviewers and admins can press **Turn on notifications** in the sidebar. When payments enter the review queue, their phone or computer shows "3 payments wait for review". The notice never contains payment details: the push is empty, and the console fetches the count itself with the person's own session. The deployment makes its own push keys on first use. A disabled colleague stops receiving notices.

## Messages to payers and staff

Admins open **Admin, Messages**.

- **Payer messages.** When a payment request names the payer's email or phone (the API's `payer` field, or the cashier bill), the payer receives one message when the payment is accepted, rejected, or sent to review. Email is on by default; SMS is off until an admin turns it on. Set the sender name and a reply-to address here.
- **Templates.** Each message has an email and, for payer messages, an SMS text. Edit a text, see the preview with sample values, and save. Only the variables listed under the editor can be used, for example `{{amount}}` or `{{reference}}`; an unknown variable is refused with the list of allowed ones. **Use the default** removes your version.
- **Sent messages.** The last messages with their state: waiting, sent, or not delivered after six tries over about eight hours. Addresses and numbers are shown partly hidden.

Each person chooses under **Profile, Notifications** which notices also come by email: mentions, assignments and alerts. Device notices stay as before.

Messages leave only when the deployment has an email server (`EMAIL_SMTP_URL`, `EMAIL_FROM`) or an SMS provider (`SMS_PROVIDER`). Without them, messages wait and the page says so. Sent message texts are removed after 30 days.

## Exports for finance

**Reconciliation, Exports** makes a CSV file:

- **Payments export:** one row per payment with its state, amounts, bank and reference.
- **Accountant export:** one row per amount that moved in the period, dated in Addis Ababa time. Refunds are negative rows, so the column adds up to the money kept. Only live payments are included.

The file opens in a spreadsheet. A link to it works for 7 days and is sent to the person who asked for it. **Schedules** make the same file every day, week (Monday) or month (the 1st) at 06:00 Addis Ababa time and email the link to the chosen people. Stop a schedule at any time. Values that a spreadsheet would treat as a formula are written as text.

## Developers

Admins create server keys here. **Test keys** reach only the sandbox bank and never count toward the package. **Live keys** need the organization to be approved.

Each webhook address chooses the events it receives: **Test only**, **Live only**, or **Test and live**. Admins can also issue a new signing secret, or turn the address off.

**Send a test payment** makes a sandbox payment request for the amount you choose and pays it. Within a minute, every webhook that receives test events gets a signed `payment.accepted`. The Activity section lists the API calls and webhook attempts of the last 30 days.

New developers can follow the [quickstart](quickstart.md).

## Settings and channels

Admins set the payer link lifetime, default deadline, provider retries, receipt retention, the calendar used for dates, and billing. An empty field uses the deployment default; the defaults are the answers in the [decision log](decisions.md). Under **Banks and wallets you accept**, tick the channels payers should use. Once any is ticked, receipts from other channels are refused, unless that option is turned off.

## Data

**Data** (Administration) shows what the organization keeps and gives its admins these tools. Every action is in the audit log.

- **Receipt files.** Receipts stay in the main storage for 90 days (7 to 3,650, set here), then move whole, with their SHA-256 checksum, to a sealed archive kept apart from the main storage. They still open from the payment page. At the end of the retention period they are deleted from the archive too. The details read from them (reference, amount, date, account) stay with the payment.
- **Clean up.** Ended sessions, used invitation links, unused upload slots, old API call logs, read notices, sent message texts, expired exports, and revoked or expired server keys. Each shows how many rows it would remove before you remove them.
- **Test data.** See what would go, table by table, then type the phrase to remove every test payment with its receipts, checks, events and deliveries. Live payments are never touched.
- **Backups.** Make a backup of every row of your organization, download it (gzip JSON) or delete it. Sign-in sessions are never in a backup. A restore of one organization is done by MySeed on request.

Revoked or expired server keys, and turned-off webhook addresses (with their delivery history), can also be deleted on the Developers page.

## Retention

Receipt files, evidence bundles and reviewer evidence are deleted once they are older than the retention period (5 years by default). Payment, acceptance, reconciliation and audit records stay. Only finished payments are touched; anything still in progress waits. A deleted receipt shows "deleted at the end of its retention period".

## Appearance

The console uses a work-management layout:

- **Sidebar:** the workspace (logo or initial), **Search** (Ctrl+K) and sections. Collapse it to icons with the button next to the workspace name.
- **Top bar:** breadcrumbs, notifications, light or dark, and sign out.
- **Payments:** a list grouped by status, with groups you can collapse, or a board with one column per status. The console remembers your choice.
- **Payment page:** details on the left, activity on the right.

Press Ctrl+K (Cmd+K on a Mac) anywhere to jump to a page, run an action, or find a payment by reference.

**Appearance** (your name at the bottom of the sidebar) has two parts:

- **Your appearance:** follow the device or always use light or dark, choose comfortable or compact density, show the sidebar with labels or icons only, and pick an accent color. These are saved to your account and follow you to other devices; nothing is stored in the browser.
- **Organization branding** (admins): upload the logo as PNG or JPEG, up to 2 MB. The console suggests colors from it; pick one or choose any color and save. Everyone sees the logo and brand color unless they chose their own accent. A color that would make buttons or text hard to read in light or dark mode is refused, with the failing pair named. **Use the product theme** returns to Myseed green (or Kalon violet).

Status colors never change, so Accepted, Needs review and Rejected look the same for everyone.

## Security

- Sign-in needs the password and a two-step code, a passkey, or single sign-on through the organization's identity provider (see Single sign-on). Five wrong passwords lock the account for 15 minutes, and sign-in is rate-limited per address and per email. A code is never accepted twice.
- Sessions are HttpOnly, SameSite=Strict cookies limited to `/console`. They end after 12 hours, or after 60 minutes without use. Disabling someone or resetting their sign-in ends their sessions at once.
- The console API accepts only requests from the console page itself (a required header and an Origin check), so other sites cannot act for a signed-in browser.
- The console stores nothing about payments on the device. Its service worker caches only its own code.
- Admins can reset a colleague's password (a one-hour link) or two-step sign-in, but not their own role or access.

## Automation rules

On Growth, Enterprise and partnership, admins add rules under **Settings, Automation**. A rule says: when a payment needs review, is accepted or is rejected, and it matches an amount range, a branch or a bank (each optional), then assign the review case to a reviewer or admin, or notify one person or everyone with a role.

- Rules never accept or reject a payment. The bank's confirmation and the normal checks decide; rules only route the work.
- A rule acts once per check, and only on checks made after the rule was added. Rules run in their list order; the first one that assigns a case wins, and a case someone already assigned by hand stays with them.
- A role notice reaches only the people with that role who can see the payment's branch.
- Each run is in the audit log as the rule's name; the list shows how often each rule ran. Pause a rule to stop it without losing it.
- Up to 50 rules per organization. Rules check new payments about once a minute.

## Single sign-on

On the Enterprise package (and partnership), admins connect the organization's own identity provider under **Settings, Security, Single sign-on**. Any OpenID Connect provider works: Microsoft Entra ID, Google Workspace, Okta, Keycloak and others. SAML is not supported yet.

1. In your provider, create a web application. Register the **Redirect address** shown on the card (it ends in `/console/sso/callback`).
2. On the card, enter the provider's **Issuer**, the **Client ID** and **Client secret** it gave you, and your **Email domains** (for example `academy.et`). Public mail services such as gmail.com cannot be used, and a domain belongs to one organization only.
3. Choose **Turn on**. The provider's settings are checked first, so a mistyped issuer is caught before anyone relies on it.
4. Test it in a private window: **Sign in with single sign-on**, enter your work email, sign in at your provider.
5. If you want, turn on **Only admins may sign in with a password**. Everyone else then signs in through the provider. Admins keep their password, so a wrong setting never locks the organization out.

What it does and does not do:

- Only people you already invited can sign in. The provider's word is checked against an account in your organization with the same email; nobody is created by sign-in, and an email outside your domains is refused.
- The provider handles the second factor, so a single sign-on session is complete without our two-step code.
- Each attempt is bound to the browser that started it and used once. The token's signature, issuer, audience, expiry and a one-time value are checked; tokens signed with a shared secret or not signed are refused.
- The client secret is stored encrypted and never shown again. Changes are in the audit log.
- Disabling a person in People and roles stops them at once, whatever the provider says. Removing them only at the provider stops new sign-ins; sessions already open end at their normal time.

## Not in this version

- The console texts are English only so far. Amharic follows the Myseed staff review of the message catalog.
- Statement formats differ by bank. The reader handles the common column names; send a sample export from each Myseed account so it can be checked against the real layout.
