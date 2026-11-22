# Payments and provider coverage

## Money flows

| Flow | Destination | Design |
|---|---|---|
| Myseed subscriptions, fees, sponsorships, donations, and campaigns | An approved Myseed account | Payer transfers through a supported provider and submits evidence. Myseed's backend activates the subscription or records the contribution after acceptance. |
| Merchant or restaurant payment | An approved account belonging to that organization | Merchant supplies the bill amount or an open-amount policy. Verification confirms and claims the transfer. The merchant fulfills the order and issues the receipt. |
| Commercial product subscription | The independent operator's own merchant account | Separate billing service creates an invoice and uses approved settlement evidence or a hosted checkout session. A verified payment applies the commercial entitlement once. |
| Invited free partner | Customer payments still go to the partner's own account | An approved access grant waives the commercial fee. Request limits, usage measurement, and organization isolation still apply. |
| Optional checkout for the customer's payer | The customer organization's merchant account with an approved gateway | The customer's backend initiates its own provider checkout. An authenticated gateway confirmation feeds the same payment request and acceptance path. |

The launch product verifies incoming payments. A payer can pay through a bank or wallet without creating a checkout session. The platform should add hosted checkout only where the organization wants to offer it. Any future collection on behalf of other companies, stored balances, payouts, or payment initiation needs a separate provider and regulatory review. [NBE payment system operators and issuers](https://nbe.gov.et/payment-instrument-issuers-system-operators/)

### Commercial billing

Proposed starting model is an invoiced subscription with an included allowance. Meter one unit per newly accepted commercial payment, keyed to the acceptance ID. Track failed checks, submissions, and retries separately for capacity and abuse controls. Myseed has its own internal entitlement. Free partners have a private waiver with effective dates, an approver, and a usage limit.

Billing needs its own invoice, invoice item, billing payment attempt, provider event, entitlement, and usage ledger records. Store the amount and currency expected for each invoice. Advance the invoice only when verified gateway data matches the amount, currency, transaction reference, environment, and merchant account. Provider retries and reconciliation imports must apply the entitlement once. For hosted checkout, a redirect confirms that the user returned, and the backend performs the payment confirmation. Chapa is one documented candidate for a sandbox evaluation. Provider, prices, allowance, and renewal terms are open decisions. [Chapa payment verification](https://developer.chapa.co/integrations/verify-payments) · [Chapa webhook guidance](https://developer.chapa.co/integrations/webhooks)

### Payment exceptions and receipts

- A fixed request must match the total expected amount. Create a separate request for an agreed installment. Send unplanned underpayments and overpayments to review.
- An open donation or campaign contribution uses the confirmed amount and the purpose attached to the request. Campaign totals count allocated confirmed funds and account for reversals. Pledges have a separate lifecycle.
- Refund and reversal records reference the affected allocations. The reconciliation service must prevent total adjustments from exceeding the original amount. The original transfer remains marked used.
- The acceptance event triggers the business's receipt or donation acknowledgment. The issuer owns numbering, template, and any fiscal requirements. The verification service provides status and reference evidence.
- Authorized statement or merchant export reconciliation can resolve gaps when a provider lacks enough receipt detail. Staff record the evidence and decision. Cash and other manually attested payments should remain distinguishable from verified provider transfers.

## Provider coverage program

Inventory all Ethiopian banks, wallets, e-money issuers, and relevant gateways. Track coverage by payment channel, so a bank can have one approved channel and another under investigation. Use the NBE inventory to identify organizations and each provider's official documentation or authorized access to establish technical capability. [NBE financial institutions](https://nbe.gov.et/financial-institutions/) · [NBE payment providers](https://nbe.gov.et/payment-instrument-issuers-system-operators/)

| Initial investigation | Research questions |
|---|---|
| CBE, CBE Birr, Dashen, Bank of Abyssinia, and Awash | Which official QR, receipt, account export, or merchant channels provide useful recipient evidence? How do older formats differ? |
| telebirr, M-PESA, Kacha, YaYa, and other issuers in the register | Which lookup or merchant sources are available for the organization's transaction type? What authority, credentials, fields, and limits apply? |
| Chapa and other gateways | Which options can confirm payments initiated through a merchant's own integration? Can they also provide settlement and reversal data? |
| Other Ethiopian banks and wallets | Catalogue by official issuer and channel, request authorized access where needed, and validate fixtures before adding support. |

**Catalog in the build (migration 004).** 43 licensed banks, wallets and gateways are listed in `verify.providers`, all at `researching`. The first certification wave chosen for Myseed has priority 1: CBE, telebirr, CBE Birr, Awash Bank, Dashen Bank, Bank of Abyssinia and M-PESA Ethiopia. Names and Amharic names are drafts to check against the NBE register before the pilot. Each organization chooses the channels it accepts (`PUT /v1/channels/{providerId}`). The payment page lists them, and evidence from other channels is refused with `channel_not_accepted`. A channel is verifiable only when a certified connector for it is enabled.

These are research candidates. A channel becomes supported after its approved source, identity rules, available fields, access terms, and end-to-end tests are recorded. The coverage register should contain provider, channel, source URL or contract reference, permitted usage, input types, returned fields, status semantics, reference namespace, matching policy, receipt versions, timeouts, quota, and last verification date. Use `researching`, `testing`, `supported`, and `unavailable` as coverage states.

**More drafts and pilots (migration 027).** From the receipt services public open-source verifiers read: eBirr receipt links (`receipt.ebirr.com/<bank>/<token>`) for E-Birr (KAAFI), Nib, Ahadu and Cooperative Bank of Oromia, each approving only its own path; Wegagen's share link, looked up at its JSON service by the 24-character share id; Bunna's receipt link, whose base64 token is sent to the bank's JSON service. Siinqee and Wegagen also read their eBirr links, and Dashen its newer `receipts.dashenbanksc.com` page. All of these run in pilot. ArifPay (checkout session id) and YaYa Wallet (transaction id, signed with the organization's API key and secret) are checked with the organization's own key, like Chapa, also in pilot because their full answers are not published. SantimPay and Kacha publish no verification API; Hibret, Lion, Oromia, Berhan, Enat, Global, Amhara, Hijra, Gadaa, Shabelle, Tsedey, Goh Betoch, Rammis, Omo, Sidama, Tsehay, ZamZam (its service needs a credential copied from its website), Awash Birr, Amole and HelloCash have no public receipt service that could be found, and stay with staff review.

**Draft receipt definitions (migrations 016 and 021).** Ten providers have a draft official-receipt definition: CBE (PDF and mobile link), telebirr, CBE Birr, M-PESA Ethiopia, Bank of Abyssinia, Awash, Dashen, Zemen, Siinqee and Abay. Each one fetches the provider's own receipt page and reads it; the payer's copy is never trusted. They were checked against the layouts public open-source verifiers read from real receipts (`packages/provider-connectors/test/receipts.test.mjs`), but none is certified, so none accepts a payment yet.

| Provider | What the payer gives | Receipt page | Payment time | Receiver shown |
|---|---|---|---|---|
| CBE | Receipt link or QR (reference plus account digits), or the mobile receipt link | PDF, or JSON | Yes | Last four digits |
| telebirr | Receipt number or link | HTML; must read Completed | Yes | Last four digits |
| CBE Birr | Receipt link (receipt number and phone) | PDF | Yes | Last four digits |
| M-PESA | Transaction ID or link | PDF inside JSON | Yes | Till or number |
| Bank of Abyssinia | Slip link (reference plus 5 digits) | JSON; must read success | Yes | Last four digits |
| Awash | Receipt link (code with a dash) | HTML | Yes | Last four digits |
| Dashen | Reference or link | PDF | Yes | Last four digits, or phone (review) |
| Zemen | Reference or either link | PDF; must read completed | No (review) | Last four digits |
| Siinqee | Reference | PDF | Date only (review) | Last four digits |
| Abay | Receipt link | HTML | Date only (review) | Last four digits |

**Making one automatic:** a provider admin opens the method, runs **Live check** with two or three real receipts (one to the organization, one elsewhere, one wrong), corrects any pattern, saves the seven standard fixtures, certifies and switches the connector on. If Live check reports a certificate error, the bank's server is not sending its full chain: add the bank's intermediate certificate (PEM) as `lookup.caCertificates` in the template. Certificate checking is never turned off. The server must reach Ethiopian addresses; telebirr answers only from inside Ethiopia.

**A draft for every listed bank and wallet (migration 048).** 23 more methods get a draft read through the shared eBirr receipt service: Amhara, Berhan, Hibret, Oromia, Enat, Global, Tsedey, Tsehay, Addis, Lion, DBE, Kacha, Amole, Awash Birr, Goh Betoch, Shabelle, Omo, Sidama, Hijra, ZamZam, Gadaa, Rammis and HelloCash. That brings the registry to 39 methods with a draft. The new ones are drafts only: whether each bank really publishes receipts at `receipt.ebirr.com/<bank>/` has not been confirmed with a real receipt, so no pilot and no connector is switched on. For each, run a Live check with a real receipt on the method page, then start a pilot.

**Lookup network (migration 047).** Under Platform, Methods, Lookup network, a provider admin sets where each receipt page is fetched from. Each method has a path: automatic (the server, then a relay if the server cannot connect), relay first (telebirr by default) or server only. A relay is the small agent in `apps/relay/agent.mjs` on a PC, mini computer or Android phone (Termux) that stays on a connection inside Ethiopia; it polls the server, fetches the public receipt page over https and passes it back unread. Each relay has its own token, created and revoked on that page (only the digest is stored), and the queue is the `relay_jobs` table, so several relays share the work and a restart loses nothing. `RELAY_TOKEN` and `RELAY_API_URL` are no longer used. When the server moves into Ethiopia, switch Server location to "Hosted in Ethiopia": every lookup then goes from the server first and relays stay as a fallback. The page also tests whether a bank's host can be reached from the server or through a relay.

**Provider health and phone relays (migration 053).** The worker checks every connected method's receipt address every five minutes (`healthIntervalMs`; 0 turns it off) with an https request to the host, and keeps the state in `provider_health`: up, degraded (slower than five seconds, or one or two failed checks) or down (three failed checks in a row). Lookup network shows the state, latency, the last time it was up and since when it is down, and Check now runs a check at once (at most four a minute). A cashier sees a down method as unreachable, unless the organization's own phone relay is online. A **phone relay** is a relay that serves one organization only: an admin turns it on from the cashier phone app (Cashier, Use this phone's data), the token goes straight into the app's native storage, and the phone then fetches that organization's receipt pages over its own data connection. It never takes another organization's lookups, and platform-wide lookups never go to it. An organization has at most 10; they are listed and turned off on the Cashier page. See `apps/cashier-android`.

**Turning on the 23 eBirr drafts.** Each one stays a draft until a real receipt from that bank has been run through Live check on its method page; the receipt address, the fields read and the receiving account cannot be confirmed any other way, and switching a connector on without that would accept or refuse payments on a guess. Health checks only show whether the host answers, not whether the receipt is read correctly.

**Transfer routes between banks and wallets (migration 049).** A payer may pay an organization's account at one bank from another bank or wallet; the sender's receipt is what is checked, and it shows the receiving account. Under Platform, Methods, Transfer routes, a provider admin sets each route (sending provider to receiving provider): automatic (the usual rules), a person decides, or not supported (a person decides). With nothing set a route is automatic. Each organization can also limit an account to some senders under Receiving accounts, Senders. A confirmed transfer on a held route goes to review with `transfer_route_review`; it is never refused for the route alone, because the money may have arrived. The cashier shows when a bank cannot be reached right now (a relay-first bank such as telebirr with no relay online), and its receipts wait and are checked once a relay is back.

Every certified connector needs authorized fixtures for a successful match, wrong recipient, bad reference, duplicate across formats, absent fields, pending, timeout, and source changes. Automatic acceptance requires sufficient evidence for the organization and request. Where the provider can confirm the transfer but omits essential recipient or payment status information, route the result for review or corroboration through authorized account records.
