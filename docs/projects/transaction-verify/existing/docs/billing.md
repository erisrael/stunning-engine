# Billing rules and finance runbook

For MySeed finance staff (platform roles Finance and Owner), and for anyone who needs to know how an invoice is worked out. Customers' own payments, the ones MySeed Verify checks for them, never mix with this money.

## How an invoice is worked out

Invoices are made once a month for the month before. Each organization gets at most one invoice per month, however many times the month is run.

| Step | Rule |
|---|---|
| 1. Package | The monthly fee of the package as sold to the organization. Later price changes do not touch existing subscriptions unless the package is set to move them at renewal. |
| 2. Verifications above the allowance | Accepted payments in the month (Addis Ababa time) above the included number, times the package's price per verification. Add-ons that grant verifications raise the included number. |
| 3. Add-ons | Each add-on running during the month, times its quantity. |
| 4. Discounts | Discounts running during the month, as a percent of steps 1 to 3 or as a fixed amount. They never take the amount below zero. The reason is printed on the invoice. |
| 5. VAT | The VAT rate in the billing settings, applied to the amount after discounts and rounded half up to the cent. A rate of 0 means no tax line. |
| 6. Credits | Unused credits and partner waivers, applied whole and once, oldest first. A credit larger than what is left waits for a later invoice. |

Invited free partners get an invoice of zero, marked paid. An invoice that credits bring to zero is also marked paid.

Every invoice lists its lines, the seller's name and TIN from the billing settings, and the customer's legal name and TIN from its business details. These are copied onto the invoice when it is made, so later changes do not alter it.

**Numbers** run per calendar year without gaps: `INV-2026-000001`, `INV-2026-000002`, and so on, with the prefix from the billing settings. Running a month again uses no number. Invoices made before these rules keep their old numbers.

**Due date:** the payment days in the billing settings (14 unless changed). The reminders and the past due, grace and suspended stages follow the existing dunning rules: past due at the due date, grace after 7 days, suspended after 14. Paying brings the subscription back once nothing else is overdue.

## Settings to make after the finance review

Under **Platform, Billing, Settings**:

- the seller's legal name, TIN and address
- the VAT rate (left at 0 until finance decides; enter 15 for 15 percent) and its label
- the invoice number prefix
- the days to pay
- the account invoices are paid into: an approved receiving account of the platform organization

Only invoices made after a change use the new settings.

## How customers pay

Customers see their invoices under **Package and billing** and open one to see the lines. An admin chooses **Pay**, which opens MySeed's own payment page for the exact amount. They pay by any accepted bank or wallet and submit the receipt there. The payment is checked like any other payment. Within a minute of being accepted, the invoice turns paid, the admins are told, and a held-back subscription comes back.

Paying through the platform needs an approved receiving account in the platform organization. Without one, customers are asked to pay by bank transfer and tell support.

## Runbook

**Monthly, in the first days of the month:**

1. Open **Platform, Billing, Invoices**, choose last month, and choose **Make invoices**. Doing it twice is safe.
2. Customers are notified and pay from their billing page.
3. For a bank transfer outside the payment page: open the invoice, choose **Paid by bank transfer**, and enter the bank reference from MySeed's statement.
4. Record what MySeed paid banks and wallets that month under **Provider fees**.
5. Open **Reconciliation** for the month. Check that each paid invoice has a payment (through MySeed Verify with its bank reference, or by transfer with yours). Export the CSV for the books.

**Corrections:**

- **Wrong invoice:** **Void** it with a reason. Its payment page stops working. Fix the cause (package, add-on, discount or credit) and make the month again; the organization gets a new number.
- **Refund:** open the paid invoice and choose **Record a refund** after sending the money back. Refunds can never exceed what was paid for the invoice.
- **Goodwill:** add a credit on the organization's page. It applies to the next invoice.

**Add-ons and discounts:**

- Add-ons are defined once under **Billing, Add-ons**: price per month, and what one unit adds (verifications, people or branches). Archived add-ons are not sold again but keep running where already sold.
- Each organization's page sets its add-ons (quantity, from, until) and discounts (percent or fixed, reason, from, until).
- An override on the organization still decides a limit on its own.

## Ledgers

- **Billing ledger:** one entry each time an invoice is issued, a credit applies, it is paid, refunded or voided, with who did it and the reference. An invoice is paid and voided at most once.
- **Provider fees:** what MySeed pays each bank, wallet or gateway per month, with their invoice reference.
- **Reconciliation totals for a month:**
  - Invoiced: issued minus voided.
  - Collected.
  - Still open.
  - Credits.
  - Refunds.
  - Provider fees.
  - Net: collected minus refunds minus provider fees.
  - Tax: the VAT included in the month's invoices.
