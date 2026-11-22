# Customer success and support playbook

For the MySeed Verify platform team: how to get a new organization to its first verified payment, how to answer support tickets, and what to do with an organization that stops on the way. Roadmap v5, Phase 11.

## The goal

An organization is a success when it verifies real payments every week without needing us. The Phase 11 exit gate is three outside organizations that reach their first live payment **without help**: no support ticket opened and no support access granted before that payment. Platform, **Onboarding** counts them.

## The six steps a new organization takes

| Step | What the organization does | Where it can stop | What we do |
|---|---|---|---|
| 1. Signed up | Fills in the sign-up form | Never confirms its email or never signs in | Nothing automatic yet; a friendly email after 2 days if it never signed in |
| 2. Approved | Waits while we check the business | We are slow | Review within one working day with the business verification checklist ([platform admin guide](platform-admin.md)) |
| 3. Receiving account approved | Adds the account payers send money to; a second admin approves it | Only one admin, so nobody can approve | Tell them to invite a second admin, or a platform owner approves after checking the proof |
| 4. First payment request | Creates a bill at the cashier or a request from its own system | Does not know where to start | Point them to **Cashier, Scan QR** for counters, or the [quickstart](quickstart.md) for developers |
| 5. First verified live payment | A real payer's receipt is checked and accepted | The bank is not wired, or the payer's receipt goes to review | Check the bank is wired on the coverage page; for review cases, show them the review queue |
| 6. First invoice paid | Pays the first monthly invoice | Does not see the invoice | Point to **Package and billing**; billing questions are tickets in the Billing category |

## Weekly routine (30 minutes, every Monday)

1. Open **Platform, Onboarding**, period 30 days.
2. For each organization in **Still on the way** that has been on its step for 7 days or more (highlighted), look at its step and use the table above. Write one short message: what the next step is and where to click. Do not grant support access unless they ask for it.
3. Approve every waiting organization you can. Waiting for approval is the one step that depends only on us.
4. Open **Platform, Support tickets**. Nothing should be overdue. Note the share of first answers on time.
5. Note three numbers in the team channel: organizations live this week, live without help in total, first answers on time. These are the Phase 11 measures.

## Answering a ticket

Each package promises a first answer within a set time: Starter 24 hours, Growth 8, Enterprise 4. Urgent tickets get half. The due time is fixed when the ticket is opened.

1. Read the whole thread and the organization's package and step (Onboarding page).
2. Answer the question asked, in plain words, with the exact place to click (for example "Settings, Banks and wallets").
3. If it needs a fix on our side, say what will happen and when, and keep the ticket open.
4. Turn on **Resolve with this answer** only when nothing is left for them to do. A reply from them opens it again.
5. Never ask for passwords, two-step codes or full account numbers. If you need to look inside their workspace, ask them to grant support access; it expires on its own.

### Categories and who answers

| Category | First look | Usually needs |
|---|---|---|
| A question | Support | An answer and a link to the guide |
| Something is not working | Support, then operations | The request ID from the error, the time, the screen |
| A payment or receipt | Support | The payment page in their console; why it was rejected or sent to review |
| A bank or wallet | Provider admin | Whether the bank is wired, certified or in pilot; real receipt samples if they offer them |
| Package and billing | Finance | The invoice number |
| Sign-in and people | Support | Owner reset or a new invitation; never by email alone |

## Common answers

| Situation | What to say |
|---|---|
| "The receipt was not verified" | Ask for the bank and the receipt's QR, link or transaction ID. Many bank numbers are not the transaction reference (for example a Dashen reference is 16 characters starting with three digits). The cashier now says when a typed number is not a reference for the chosen bank |
| "Paid, but it says another account" | The money reached an account that is not theirs or not approved. Check their receiving accounts; a new account needs a second admin's approval |
| "Already used" | The same transfer already paid another bill. That is the protection working; find the first bill under Payments |
| "Sandbox only" | Before approval, and until the cashier is on for their package, bills are sandbox bills. Approve them or explain the package |
| "The bank is not answering" | The check retries on its own. Look at Platform, Health for that provider |

## When an organization is in trouble

- **No live payment 30 days after approval:** a short call or message offering a 20-minute setup session. Record it as help; it is fine, but it does not count toward the exit gate.
- **Many review cases:** their bank is probably not certified yet. Tell them which banks are checked automatically and ask for receipt samples to certify theirs.
- **Overdue invoice:** finance follows the dunning steps in the [billing guide](billing.md). Support does not promise credits.
- **Wants to leave:** follow the [offboarding guide](offboarding.md). Ask one question: what would have made them stay. Write the answer in the decision log review.

## Improving onboarding

Every 4 weeks, look at the step with the lowest share on the Onboarding page and the most common ticket category. Change one thing that would have let those organizations continue without asking, ship it, and compare the next 4 weeks.
