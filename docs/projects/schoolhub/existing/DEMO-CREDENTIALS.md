# Demo and development credentials

These accounts and secrets exist only in a local or demo database created by the seed (`pnpm db:seed`, or Load demo data in the control panel). They are public development defaults. Never use them on a server that holds real school data: the API refuses to start in production with any of the development secrets below.

## Shared password

Every demo account, platform and school, uses the same password:

```
<demo password>
```

No demo account has two-step verification turned on. The control panel (Accounts tab) can reset any account back to this password, unlock it, remove two-step verification or sign it out everywhere.

## Addresses

| What | Address |
| --- | --- |
| Public site | http://localhost:3000 |
| Platform console sign-in | http://localhost:3000/platform/login |
| School portal sign-in | http://`<school>`.localhost:3000/login, for example http://bole-academy.localhost:3000/login |
| API and OpenAPI reference | http://localhost:4000/docs |
| Connect API reference | http://localhost:4000/docs/connect |
| Connect discovery document | http://localhost:4000/connect/v1/discovery |
| Local MySeed gateway (after install) | http://localhost:4100/status |
| Control panel | http://127.0.0.1:8090 (`pnpm control-panel`) |

`*.localhost` resolves to your own machine in every current browser, so no hosts-file change is needed.

## Platform console (MySeed staff)

| Email | Role | What it can do |
| --- | --- | --- |
| admin@myseed.et | Platform administrator | Everything: schools, plans, licenses, MySeed integration, support access |
| developer@myseed.et | Integration developer | MySeed integration (install codes, connected systems, webhooks), operations |
| support@myseed.et | Support engineer | Schools, operations, support access requests, webhook tests |
| sales@myseed.et | Sales lead | Quotes, hosting requests, plans |

## Schools

| School | Address prefix | Plan | State |
| --- | --- | --- | --- |
| Bole Academy | bole-academy | Enterprise | Active, KG to Grade 12, two campuses |
| Addis Ketema Primary School | addis-ketema-primary | Institutional | Active, public primary and middle |
| Hawassa Tabor Secondary School | hawassa-tabor-secondary | Professional | Active, secondary with streams |
| Little Seeds Kindergarten | little-seeds-kg | Starter | Trial, kindergarten only |
| Unity International School | unity-international | Custom package | Active, core plus selected modules |
| Selam Mission School | selam-mission | Professional plus library and transport | Active |
| Debre Berhan Community School | debre-berhan-community | Starter | Suspended: staff can read but not change anything |

## School staff accounts

Every school has one account per role. Replace `<school>` with the address prefix from the table above, for example `registrar@bole-academy.schoolhub.test`.

| Email | Role | Lands on |
| --- | --- | --- |
| owner@`<school>`.schoolhub.test | Organization owner | School administration workspace: everything, including plan, roles and integrations |
| school-admin@`<school>`.schoolhub.test | School administrator | School administration workspace, without role editing, integrations or refund approval |
| registrar@`<school>`.schoolhub.test | Registrar | Admissions, enrollment, student and guardian records, MySeed link approvals |
| academic-head@`<school>`.schoolhub.test | Academic head | Academic office: structure, teaching, lesson plan review, marks approval, report cards |
| teacher@`<school>`.schoolhub.test | Homeroom teacher | Teaching workspace plus the homeroom class |
| subject-teacher@`<school>`.schoolhub.test | Teacher | Teaching workspace for assigned classes only |
| accountant@`<school>`.schoolhub.test | Accountant | Finance office: fees, invoices, payments, discounts, refunds |
| cashier@`<school>`.schoolhub.test | Cashier | Finance office: record payments and receipts |
| communication-officer@`<school>`.schoolhub.test | Communication officer | Announcements, SMS, templates, delivery log, calendar |
| librarian@`<school>`.schoolhub.test | Librarian | Library catalog and loans |
| transport-officer@`<school>`.schoolhub.test | Transport officer | Routes and riders |
| counselor@`<school>`.schoolhub.test | Counselor | Behavior, clubs and student follow-up |
| store-keeper@`<school>`.schoolhub.test | Store keeper | Assets and inventory |
| hr-officer@`<school>`.schoolhub.test | HR officer | Staff records and leave approvals |
| auditor@`<school>`.schoolhub.test | Auditor | Read-only records, finance reports and the audit log |

Other teachers have generated addresses such as `teacher.abel.36@bole-academy.schoolhub.test`. Find them in the control panel (Accounts, Find any account) or in the school's Staff list. Modules that a school's plan does not include are hidden from every role in that school, so the same role sees less at Little Seeds than at Bole Academy.

## Students and guardians

Students and guardians do not sign in to SchoolHub. They use the MySeed Student and Parent apps, which reach the school through the Connect API after the school approves a link (link code, phone code, details match or registrar review). The seed creates active connections for part of each school (about 960 in total) so the apps' views have data. Link codes for testing are generated in a school portal under MySeed connections, Link codes.

## MySeed Education System (Connect API)

| Item | Value |
| --- | --- |
| Seeded client | `myseed-education-gateway`. Its private key is written to `apps/api/.connect-dev-key.json` by the seed; the file is git-ignored |
| Local gateway client | `myseed-education-dev`, created by Install local gateway in the control panel. Its private key and webhook secret are in `.dev-gateway.json` at the repository root (git-ignored) |
| Install codes | One use, expire after 24 hours by default. Issue them in the platform console (MySeed integration), the control panel, or `pnpm connect:code` |

## Database

| Item | Value |
| --- | --- |
| Server | Embedded PostgreSQL 17 on localhost:55432 (`pnpm db:start`, or Start in the control panel) |
| Data folder | `%LOCALAPPDATA%\myseedschoolhub\pg` on Windows, `~/.local/share/myseedschoolhub/pg` elsewhere |
| Owner account | `postgres` / `<password>`, database `schoolhub` (tests use `schoolhub_test`) |
| Application role | `schoolhub_app` / `<password>`. No superuser and no BYPASSRLS, so row-level security applies to every tenant table |
| Connection strings | `DATABASE_URL=postgresql://postgres:<password>@localhost:55432/schoolhub` and `DATABASE_URL_APP=postgresql://schoolhub_app:<password>@localhost:55432/schoolhub` |

## Development secrets

The API falls back to these when the variables are not set. Each one is refused when `NODE_ENV=production`.

| Variable | Development value |
| --- | --- |
| SESSION_SECRET | `<development default, see apps/api/src/config.ts>` |
| INTERNAL_PROXY_SECRET | `<development default, see apps/api/src/config.ts>` |
| FILE_SIGNING_SECRET | `<development default, see apps/api/src/config.ts>` |
| CONNECT_TOKEN_SECRET | `<development default, see apps/api/src/config.ts>` |
| SECRETS_ENCRYPTION_KEY | `<development default, see apps/api/src/config.ts>` |
| PLATFORM_WEBHOOK_SECRET | `<development default, see apps/api/src/config.ts>` |

For a self-hosted or production install, generate each value with `openssl rand -base64 32` and set it in `deploy/compose/selfhosted.env` (copy it from `selfhosted.env.example`).
