# Platform admin guide

For MySeed staff who run the platform: reviewing and approving organizations, packages and limits, and support access. Everything here is under **Platform** in the console, for people with a platform role.

## Platform roles

| Role | Can change |
|---|---|
| Owner | Everything, including the platform team and emergency approvals |
| Operations | Organization approvals and suspensions, feature flags, support access, website, leads |
| Provider admin | Banks and wallets, templates, certification |
| Finance | Packages, invoices, credits, subscriptions |
| Support | Customer support access requests and leads |
| Sales | Leads from the website |
| Content | The public website text |
| Engineer | Health and feature flags |
| Security auditor | Reads everything, changes nothing |

Business verification and approvals need Owner or Operations.

### Changing what a platform role reaches

**Platform roles** shows each area of the platform admin against each role. A platform owner ticks or unticks and saves; changed boxes are ringed and listed with who changed them. **Defaults** puts every role back. Owners always reach every area, and reading the platform admin and changing the team stay fixed, so nobody can lock the platform out.

### Database

**Database** (owners and engineers by default):

- **Overview:** size, PostgreSQL version, connections, migrations, receipts in the main storage and in the archive, and problems found (a table with organization rows but no tenant wall, many dead rows, connections near the limit).
- **Tables:** rows, size, dead rows, last vacuum and the tenant wall, with search, filters and grouping. Vacuum or reindex one table, or analyze and vacuum all.
- **Clean up** across every organization, with counts first.
- **Backups:** a whole-database backup, sealed in the archive storage; verify it against its checksum, download or delete it. **Restore** (platform owners only, typing RESTORE DATABASE) first makes a backup of the database as it is, then replaces every table; everyone is signed out. Receipt files are not part of a database backup. The database user needs the right to set session_replication_role (the deployment's owner user has it); otherwise the restore changes nothing and says why.
- **Sessions:** every connection to the database, the longest transaction first, with what it waits on and which sessions block it. **Cancel** stops its running query; **End** closes the connection. The console's own connection cannot be stopped.
- **Indexes:** each index's scans and size since statistics were reset; indexes never used and not needed for uniqueness are marked.
- **Query** (platform owners only): one read-only SQL statement, in a read-only transaction with a 5-second limit and at most 500 rows shown. A second statement, or any write, is refused. Each query is in the audit log; download the result as CSV.
- **Export** (platform owners only): a whole table as CSV, at most 50,000 rows, from the table list.

### Operations

**Operations** (reading: every platform role; changing: owners, operations and engineers) shows:

- **Now:**
  - checks waiting and the oldest one
  - workers running
  - webhooks and messages that gave up
  - the age of the last database backup
- **Alerts:** the worker checks each minute, and each problem is one alert until it clears. Owners, operations and engineers get a notice and an email when one opens. Acknowledge one to show you are on it. What to do for each is in the [runbooks](runbooks.md).
- **Workers and queues:** each worker by heartbeat; each queue with its waiting, working and given-up counts; each bank or wallet check's failures in the last hour.
- **Restore drills:** restore a backup into a scratch database, counted and timed, then sign the drill off.
- **Server errors:** every "Something went wrong on our side" answer, with its request ID, address, the person and organization, and the first lines of the error. A person who reports the request ID shown in the console can be matched here. Clear old ones with **Clear**.
- **Status page:** incidents shown at `/status`, with updates (investigating, identified, monitoring, resolved). Parts also turn yellow or red by themselves from open alerts. See the [incident guide](incident-guide.md).

### Banks and wallets: pilot and logo

A method's page has two more cards:

- **Pilot:** runs the current template live against the bank's own receipt page before it is certified. The bank's answer is recorded and shown on the payment, but every payment goes to the review queue with `provider_pilot`; nothing is accepted or refused by itself. Use a pilot to collect real receipts for the fixtures, then certify. Ending the pilot turns the connector off while the template is uncertified. A pilot needs a template with a lookup rule. Awash, Siinqee and Abay start in pilot (migration 026).
- **Logo:** upload the method's official logo (PNG, SVG, JPEG or WebP, at most 256 KB) once you have permission to show it. SVG files with scripts or event handlers are refused, and logos are served with a sandboxing policy. Until one is uploaded, a mark with the method's initials in its colour is shown; change the colour here. Logos appear on the landing page, the Banks and wallets list and Receiving accounts.

**Database** also has an **Encryption** card. It shows how many secrets are sealed with the current key and how many with a previous one during a key rotation ([security](security.md#key-rotation)).

## Reviewing a new organization

A new sign-up waits as **Pending**. Its people can explore the console, but live keys and live payments start only after approval.

1. **The organization gives its business details.** On their home page, its admins enter:
   - the legal name, as on the trade license
   - the trade license number
   - the TIN (10 digits)
   - what the business sells and what payments it takes
   - a website, if it has one
2. **Open the organization** under **Platform, Organizations**. Pending organizations are listed first. The **Business verification** card shows the details and six checks:

   | Check | What to confirm |
   |---|---|
   | Legal name matches the trade license | The name given matches the license the business sent |
   | Trade license is valid for this business | Number, holder, business sector and renewal date |
   | TIN is registered to the business | The 10-digit TIN belongs to the license holder |
   | Contact person confirmed | Call the business on a published number, or email from its domain |
   | Receiving accounts are in the business's name | Account names match the legal name; not applicable if none are proposed yet |
   | The business and its payments are allowed | What it sells is lawful and within MySeed's terms |

3. **Record each check** as passed, failed or not applicable. Ask the business for its license and TIN certificate by email and look at them yourself; the platform does not store the documents.
   - **Passed** takes an optional note of what you saw, for example the license number and renewal year.
   - **Failed** and **Not applicable** need a note saying why.
4. **Approve** once every check is passed or not applicable. Until then, approval is refused and names the checks still open. This also applies to reinstating a rejected organization that was never approved.
5. **Or reject** with a reason. The organization sees the reason in its audit log.

The organization sees each check as "Checked", "Needs attention", "Not needed" or "Not checked yet". It never sees your notes or who checked. When it changes its legal name, license number, TIN or business description, those checks go back to "Not checked yet". After approval, the details are fixed; changes go through MySeed support.

Every check and every change of details is in the organization's timeline.

## Creating, editing and deleting organizations

- **New organization** (Organizations page; platform owners and operations): name, contact details, access and package, and optionally the first admin, who gets a one-time setup link to copy and send. It starts as pending, like a sign-up: finish the business verification and approve it.
- **Edit** on the organization's page changes its name and contact details.
- **Delete** first shows a table of what would be removed (rows per table and receipt files) and asks for a reason and the organization's name typed back. The organization moves to the **Trash**:
  - It is suspended at once: nobody signs in, its keys are refused and its payments are not checked. Every row is kept.
  - **Restore** brings it back as it was, for 30 days.
  - After 30 days the worker deletes it for good. A platform owner can do it sooner with **Delete for good now**, typing the name and DELETE FOR GOOD.
  - Deleting for good takes a safety backup of the organization's rows in the archive, deletes its receipt files and every other file its rows point at, then every row, children first. The Trash page keeps a record of each one: when, why, how many rows and files, and whether a backup was kept.
- **Pause the service** (platform owners and finance): for non-payment, a contract on hold or misuse. The organization's admins can still sign in, see why and pay; its server keys are refused with `service_paused` and its payments wait unchecked until you **Resume**. Its admins get a notice. Nothing is deleted. This is separate from the automatic billing suspension 14 days after an unpaid invoice.
- **Clear all organizations** (Database page): every organization except the platform's own goes to the trash, or, for a platform owner, is deleted for good after a whole-database safety backup. It shows the list of organizations with their rows first and needs DELETE ALL ORGANIZATIONS typed. Packages, methods, the website and the platform team stay.

The platform organization can never be deleted or paused.

## After approval

- **Lifecycle:**
  - Suspend and offboard need a reason.
  - Suspending signs everyone out and stops the keys.
  - Offboarding deletes evidence and personal data after 30 days unless the organization is reinstated.
- **Package:**
  - Changing the package records it as sold at that moment. Later edits to the package do not change existing subscriptions.
  - Invited partners can be marked as paying no fees.
- **Overrides:**
  - Overrides change one entitlement for one organization: included verifications, hard cap, people, branches, retention or API rate. Each needs a reason and can expire.
  - Feature flags can be overridden the same way.
  - Admins are told at 80 and 100 percent of the included verifications.
- **Support access:**
  - Requests for temporary access are shown to the organization, which can revoke them.
  - Emergency (break-glass) access needs a second owner.

## Partners and resellers

Under **Platform, Partners**, the sales side of the team (owners, operations, sales) adds partners; finance records payouts.

- **Kinds.** A referral partner sends organizations to us. A reseller also sells and supports them. Both earn the same way; the kind is for our records and the partner's page.
- **Code and link.** Each partner has a code, for example `ABEBE-TECH`. Its sign-up link is `/signup?ref=ABEBE-TECH`; the sign-up page shows "Referred by" and the new organization is tied to the partner. An unknown or archived code is ignored and the sign-up goes on. To tie an existing organization, choose the partner on the organization's page; the commission period starts that day. A partner cannot refer its own organization.
- **Commission.** For each invoice the organization pays within the partner's months (12 by default) from the referral, the partner earns its rate (10 percent by default, at most 50) of the invoice before VAT, rounded down to the cent. Invoices paid later earn nothing.
- **Payouts.** Record each transfer with its reference and date on the partner's page. A payout above what is due is refused. Earned minus paid is what is due.
- **The partner's own view.** If the partner has its own organization here, choose it on the partner's form. Its admins then see **Partner program**: their link, the organizations they brought (name, status, live or not) and their commission. They never see those organizations' payments, people or invoices.
- **Archiving** stops the link from tying new sign-ups. Organizations already brought keep earning until their months end.

