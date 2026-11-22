# Employees, branches and the cashier

For organization admins in the MySeed Verify console.

## Add an employee

1. Open **People and roles** and choose **Invite**.
2. Enter the person's name and work email, and choose a role:
   - **Admin**: everything, including people, keys and settings.
   - **Reviewer**: decides payments in the review queue and sees evidence.
   - **Operator**: takes payments at a counter (the Cashier page) and handles deliveries.
   - **Viewer**: reads only.
3. If your organization has branches, tick the branches this person works at. Leave all unticked for every branch.
4. Choose **Create invitation** and send the link to the person. It works once and lasts 72 hours. They set a password, and two-step sign-in if your organization requires it.

People count toward your package's people limit once your organization is approved.

## Branches and employees bound to a branch

1. Open **Branches and purposes**, then **Branches**, and add each branch with a name and, if you like, a short code (for example BOL) and an address.
2. Invite each employee with their branch ticked, as above. To change it later, choose the branch button on their row in **People and roles**.

A person limited to branches:

- sees only the payments, review cases and cashier bills of those branches;
- takes cashier bills for their branch without choosing it (with several branches, they choose one per bill);
- cannot open a bill of another branch, even by its number.

Their home page numbers count their branches only, and escalation notices about overdue review cases reach only admins who can see the case's branch.

A person with no branch ticked (usually admins and head-office reviewers) sees every branch. When your organization has branches, every cashier bill names one, so reports per branch add up.

Archiving a branch keeps its history. Someone limited only to archived branches cannot take bills until an admin gives them an open branch.

Payments created by your own system through the API name a branch with `branchId` in the payment request.

## Scanning a receipt without a bill

At the top of **Cashier**, the **Scan QR** button needs no bill number and no amount:

1. Choose **Scan QR**, then the bank or wallet the payer used. Only the ones your organization accepts are listed.
2. The camera opens at once. Point it at the QR on the payer's receipt; it checks as soon as the code is read.
3. The result fills the screen: **Paid** when the bank confirms the transfer and the money reached your account, whatever the amount (the screen shows the amount the bank confirmed). Money that went to another account is **Not paid**, and a transfer that already paid once is refused.
4. Choose **Scan next receipt** for the next payer; the camera opens again with the same bank.

With several receiving accounts, the account at the chosen bank is used when there is exactly one; otherwise the screen asks once which account was paid into. If the receipt QR holds only a transaction ID, it is checked as that ID at the chosen bank. No QR? Choose **Paste a link, type the ID or upload the receipt** under the button.

Each scan becomes a payment with a reference such as SCAN-4F2A9C01B7D3, listed under recent bills and on Payments, open for an hour. Use a bill instead when the amount must match.

## Reading the result

The result fills the screen with one of these, each in its own color:

| Result | What it means | What to do |
|---|---|---|
| **Paid** (green) | The bank confirmed the transfer, for the right amount, into your account | Hand over the order |
| **Already used** (purple) | The bank confirmed it, but this transfer already paid another bill | Do not hand over. Show details says when and for which bill (or "another branch") |
| **Not paid** (red) | The bank did not confirm it, the money went to another account, or the amount is wrong | Do not hand over. Ask for the right receipt |
| **Needs review** (amber) | A reviewer must decide | Do not hand over until a reviewer accepts it |
| **Bank not answering** (gray) | The bank did not answer yet; it is checked again on its own | Keep the payer here or note the bill |

For every result except Paid, **Show details** opens what the check found: the reason, the bank and its reference, the amount and time the bank confirmed, which account the money reached, when it was used before, how it was sent (QR, link, ID or file) and the check ID to give an admin. On a phone, the button at the bottom (**Scan next receipt** or **New bill**) is always in reach of your thumb.

## Taking a payment at the counter

1. Open **Cashier**. On a phone it is in the bottom tab bar.
2. Enter the bill number and amount, and the purpose if you use purposes. Choose **Create bill and check payment**. To continue an earlier bill, enter its number under **Find a bill**.
3. Ask the payer for their receipt and check it one of three ways:
   - **Scan QR**: point the camera at the QR on the receipt. It checks as soon as the code is read.
   - **Paste link**: the receipt link the payer shares from their app.
   - **Transaction ID**: choose the bank or wallet and type the ID printed on the receipt.
4. The result fills the screen: **Paid** (hand over the order), **Not paid** (with the reason, such as a different amount), or **Needs staff review** (do not hand over until a reviewer accepts it).

A receipt that already paid one bill cannot pay another. **What to ask the payer for** on the Cashier page lists, for each bank you accept, which of QR, link and ID works, and marks the ones checked automatically.

Before your organization is approved, and until the cashier is on for your package (Growth and Enterprise), bills are sandbox bills: only the sandbox bank answers them, with references such as SYN-1000.

## A shared counter device (cashier terminal)

On a tablet or computer that several cashiers share:

1. Sign in on it as an admin, open **Cashier**, and choose **Make this device a terminal**. Give it a name (for example Counter 1) and, if you like, a branch.
2. The device now shows the cashier only. Each cashier signs in with their own account and chooses **Switch cashier** when they hand over. It signs out by itself after 15 minutes without use.
3. Only cashiers (operators) and admins of your organization sign in there, and only those of its branch when it has one. Bills taken on it belong to its branch.
4. To unlock it, an admin signs in on it and chooses **Unlock device**. A lost device can be retired from **Cashier, Cashier terminals** on any other device; everyone on it is signed out.

The terminal keeps the device on the cashier. To stop people leaving the browser itself, also use the device's own kiosk or guided access mode.

## Offline

If the connection drops while a cashier checks a receipt, the check is kept on the screen as **Not sent**. It is not paid, and it is sent again when the connection is back. Keep the page open; closing it loses checks that were not sent, and the browser asks first. Bills can be created only online.

## Install and notifications

Install the app from the browser menu (Add to home screen, or Install). It installs under your organization's name, color and logo. On Android, a receipt link shared from another app (for example a chat) can be shared to the app; it opens in the cashier, ready to check.

Each person chooses notifications in **Profile, Notifications**: payments waiting for review, mentions, assignments, and alerts. Notices show counts only, never names or amounts.

## What each bank or wallet needs

| Bank or wallet | QR or link | Transaction ID typed by the cashier |
|---|---|---|
| CBE (PDF receipt) | QR or link to `apps.cbe.com.et:100/?id=...` | Only the full ID from the link: the FT reference (12 characters) followed by 8 digits. The FT reference alone is not enough |
| CBE (mobile banking receipt) | Link to `mbreciept.cbe.com.et/...` | No; the link is needed |
| telebirr | QR or link to `transactioninfo.ethiotelecom.et/receipt/...` | Yes: the 10-character receipt number |
| Bank of Abyssinia | QR or link to `cs.bankofabyssinia.com` | Only the full ID from the link: the FT reference followed by 5 digits |
| Awash | QR or link to `awashpay.awashbank.com:8225/-...` | Yes: the transaction ID (8 to 20 characters) |
| Dashen | QR or link to `receipt.dashensuperapp.com/receipt/...` | Yes: the transaction reference (10 to 24 characters) |
| Zemen | QR or link to `share.zemenbank.com/rt/...` | Yes: the reference (8 to 24 characters) |
| CBE Birr | QR or link to `cbepay1.cbe.com.et/aureceipt?TID=...&PH=...` | No; the address needs the receipt number and the payer's phone |
| M-PESA | QR or link to `m-pesabusiness.safaricom.et/api/receipt/...` | Yes: the transaction ID (10 to 12 characters) |

These definitions are drafts until a provider admin certifies each one with real receipts. Until a bank is certified and switched on, its payments go to staff review.


### Expected amount with a fee allowance

In Quick Scan, choose **Expected amount with fee allowance** and enter the expected ETB amount for this sale. Set **Allow below** and **Allow above**, then save the allowance once. These allowances are shared by the organization's cashiers and survive signing out; the default is zero in both directions (exact amount).

For example, expected ETB 1,000 with ETB 6 below and ETB 4 above accepts a bank-confirmed amount from ETB 994 through ETB 1,004, inclusive. Each check freezes that range. Later allowance changes do not change existing checks, and the recorded payment and allocation remain the actual bank-confirmed amount. The next sale requires a fresh expected amount. QR, link, reference and upload checks all use the selected mode. **Any amount** remains available.

Deploy migrations 043 and 044 with the API and web update. Migration 043 refreshes eligible system Telebirr drafts without replacing custom or certified templates; migration 044 adds saved allowances and enforces frozen ranges in database acceptance.

## Bank checks from shop phones and computers

Some banks' receipt pages answer only inside Ethiopia. When the server cannot reach a bank, it hands the receipt address to the organization's relays, which open the page over the shop's own internet and send it back tagged with its receipt number (migration 055). The server refuses a page tagged with a different number.

- **A phone:** the cashier app 1.1 or later. An admin taps **Use this phone** on the Cashier page. The app asks for the camera, notifications and running without battery restrictions, and then checks banks in the background, also with the screen off. It uses Wi-Fi or mobile data, and switches to mobile data when the Wi-Fi cannot reach the bank. See `apps/cashier-android/README.md`.
- **A computer:** the relay extension for Chrome or Edge. An admin installs it from the Cashier page and chooses **Use this computer**. See `apps/relay-extension/README.md`.
- **A PC without a browser window:** the Node relay agent (`apps/relay`), set up from the platform admin.

The Cashier page lists every relay with its kind, status, the network it last used and the last receipt number it fetched, and turns any of them off at once. An organization has at most 10.

### When the server cannot reach the bank: load it through this phone

A check that waits because the server cannot reach the bank (*Verification unavailable*, reason `provider_unavailable`) shows a card under the result:

- **In the cashier app:** *Load it through this phone?* One tap starts this phone's relay (setting the phone up first if it is not yet: an admin confirms it on the spot; a cashier is asked to have an admin tap *Use this phone* once), then `POST /console/api/cashier/bills/:id/check-now` runs the waiting check again at once instead of at its next scheduled retry. The phone opens the receipt page over Wi-Fi, or mobile data when Wi-Fi cannot reach the bank, and the screen follows the check for up to a minute. If the bank does not answer through the phone either, the card says so (with the phone's last error) and the check still retries on its own.
- **In a browser:** a note says to open the bill in the cashier app on a phone, or to install the relay extension on the computer.

`check-now` only moves a check that is waiting (`pending_retry`), for a bill the person may open, at most 20 times a minute per organization; it returns `{ moved }`.

The Transaction ID box reads the ID as it is typed, the way the server will (`apps/web/src/lib/reference.ts`): it shows the ID it will check ("Checks DKD25KI0AE at telebirr"), or what this bank's IDs look like when it does not fit ("telebirr IDs are 10 letters and digits"), and offers to switch when the ID or a pasted link belongs to another bank the organization accepts. The keyboard capitalizes and does not autocorrect; Paste and Clear are in the box; Check payment waits for a valid ID. Each bank's ID formats and receipt-link hosts come with the Cashier page (`inputs.idFormats`, `inputs.linkHosts`).

The Transaction ID box also takes the receipt link itself (for telebirr, `https://transactioninfo.ethiotelecom.et/receipt/DKD25KI0AE`) and ignores stray punctuation around the number, so a pasted link or `DKD25KI0AE.` is checked as `DKD25KI0AE`.
