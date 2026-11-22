# Launch communications

For the MySeed Verify team: what we say at the public launch, to whom, in what order, and the ready-to-send texts. Roadmap v5, Phase 11. Edit the texts before sending; nothing here is sent automatically.

## What we are announcing

MySeed Verify checks payments made through Ethiopian banks and wallets. A business scans the QR on the payer's receipt, pastes the receipt link or types the transaction ID, and sees at once whether the money reached its account, for the right amount, and has not been used before.

Three points to repeat everywhere:

1. **No more fake screenshots.** The check asks the bank, not the picture.
2. **One transfer pays once.** The same receipt cannot pay two bills.
3. **At the counter or in your own system.** The cashier page on any phone, or the API with webhooks.

Do not claim a bank is "supported" unless the public coverage page shows it checked automatically. Say "being connected" for the rest.

## Before launch (one week ahead)

| Check | Owner | Done when |
|---|---|---|
| Coverage page lists only wired banks and wallets | Provider admin | Every bank shown is checked automatically or marked as being connected |
| Pricing page matches the packages | Finance | Prices and the support response times on the page are the same as in Packages |
| Status page at /status is green and has no old incidents | Operations | Opened from a phone outside the office |
| Sign-up to first sandbox payment works on a phone | Support | A person outside the team did it without help |
| Support desk staffed for the first two weeks | Platform owner | Names and hours written in the team channel |
| Restore drill this month signed off | Operations | Recorded in the runbook log |

## Order of announcements

| When | Channel | Audience | Text |
|---|---|---|---|
| Day 0, morning | Website changelog | Everyone | Text A |
| Day 0, morning | Email to existing organizations and leads | People who already asked | Text B |
| Day 0, noon | Telegram channel and social pages | Businesses in Ethiopia | Text C |
| Day 1 to 5 | One-to-one messages | Ten chosen businesses (schools, clinics, shops with counters) | Text D |
| Day 14 | Email to new sign-ups that are not live yet | Stuck organizations | Text E |

## Texts

### Text A: changelog entry

> **MySeed Verify is open to every business.** Check bank and wallet payments by their receipt QR, link or transaction ID, at the counter or from your own system. Sign up, add the account your customers pay into, and verify your first payment the same day. See which banks and wallets are checked automatically on the coverage page.

### Text B: email to existing organizations and leads

> Subject: MySeed Verify is now open
>
> Hello,
>
> You asked us about checking payments. MySeed Verify is now open to every business.
>
> When a customer says they paid, scan the QR on their receipt. MySeed Verify asks the bank and tells you in seconds whether the money reached your account, for the right amount, and whether that receipt was already used.
>
> To start: sign up at transactionverify.myseed.com.et, add the account your customers pay into, and try a sandbox receipt right away. We check new businesses within one working day.
>
> If anything is unclear, open a ticket from Help and support in your console. We answer within the time your package promises.
>
> The MySeed Verify team

### Text C: short post

> Customers send you a screenshot and say "I paid". Now you can check it with the bank in seconds: scan the receipt QR, see Paid or Not paid. The same receipt cannot pay twice. MySeed Verify is open to every business: transactionverify.myseed.com.et

### Text D: one-to-one message

> Hello [name], this is [your name] from MySeed Verify. Many [schools / clinics / shops] lose money to edited payment screenshots. We built a way to check a bank or wallet payment in seconds from any phone. Would you like to try it this week? It takes about 15 minutes to set up and we can do it with you.

When the business accepts a setup session, record it as help on the Onboarding page (it is help, and does not count toward the exit gate).

### Text E: follow-up to an organization that is not live after 14 days

> Hello, you signed up for MySeed Verify two weeks ago. Your next step is: [next step from the Onboarding page]. It is under [place to click]. Reply here or open a ticket from Help and support if something is in the way.

## After launch

- Each day for the first two weeks: new sign-ups, approvals waiting, tickets overdue (Onboarding and Support tickets pages).
- At day 14: send Text E to everyone in **Still on the way**.
- At day 30: write a short note with sign-ups, organizations live, live without help, and the most common ticket category, and decide one change for the next 4 weeks (see the [customer success playbook](customer-success.md)).
