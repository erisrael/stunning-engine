# MySeed Academy progress report

## 1. Summary as of 23 November 2026

| Item | State |
| --- | --- |
| Built | Website in 9 languages, admin console with 33 screens, Express API with 24 route groups, design system, deploy tooling for VPS, Render, Netlify and Vercel, local control panel |
| Main recent work | Finance workspace, bank transfers with MySeed Verify, student sponsorship applications, quarterly sponsorship pricing (to 17 November 2026) |
| Open | Two-factor sign-in, recurring billing, multi-instance scaling, migration history, admin accessibility audit, tests for aid and bank transfer flows, full site builder |
| Test suites | 16 API suites (`npm test`); 7 Playwright spec files with 31 tests plus per-page accessibility and responsive cases (`npm run test:e2e`); CI on every push and pull request to `main` |
| Last CI result | To confirm (could not be read from this computer) |
| Where production runs | Prepared for a Hostinger VPS with Docker Compose and Caddy at `myseed.com.et`, `admin.myseed.com.et`, `api.myseed.com.et`. VPS fixes on 5 and 10 November 2026 suggest a server was set up. Whether it serves live traffic now: To confirm |
| Commits | 38 on `main`, from 8 October 2026 to 17 November 2026 |
| Contributors (git) | 1 (Kidus Sebsibe, 38 commits) |
| Tags and releases | None |
| Head commit | `31bd529` |

## 2. Status by area

Legend: **Done** = built and covered by automated tests. **Built** = in the code, not fully tested or not checked on the live system. **In progress** = partly built.

| Area | Status | What is still open |
| --- | --- | --- |
| Monorepo, API core, in-memory fallback | Done | Single process only |
| Design system and accessibility (public site) | Done | Admin console not audited |
| Languages (9, Tier 1 and Tier 2) | Done | Tier 2 content needs a translation key in production |
| Bilingual CMS, translations review | Done | Publishing workflow with review and scheduling for articles |
| Media library | Done | S3 or R2 bucket to connect in production (To confirm) |
| Page builder, block library, motion effects | Done for the homepage | Other pages from blocks, menu editor, theme editor (roadmap Part 3) |
| Site appearance, donate page, managed pages | Built | No E2E test |
| Search, assistant, support handoff | Done | AI answers need an Anthropic key |
| Inquiries | Done | |
| Newsletter (double opt-in, campaigns, schedule) | Built | Confirm and unsubscribe email steps tested only by hand |
| Donations with Chapa and Stripe | Built | Live payments not checked from the repository |
| Telebirr direct | Built | Needs Telebirr merchant credentials; not checked live |
| Bank transfers, proof, fraud checks | Built | No E2E test |
| MySeed Verify and Tina Verify | Built | Live verification not checked from the repository |
| Invoices, receipts, verification codes, receipt designer | Built | |
| Sponsorship pricing (quarterly) | Done | |
| Sponsorship applications (aid) | Built | No automated tests; added 13 November 2026 |
| Finance workspace, exports, backups, fakes | Built | Live balances need provider keys |
| Accounts, roles, audit log | Done | Two-factor sign-in and session list |
| SEO tools, analytics, API usage | Done | |
| Uptime monitoring, alerts, maintenance mode | Done | External check off until `UPTIME_ENABLED` is `true` |
| Recycle bin, snapshots, data health | Done | |
| VPS deploy, rollback, backups | Built | Restore never practised (To confirm) |
| Render, Netlify, Vercel, Supabase | Built | Not the documented default; use To confirm |
| Control panel | Built | No automated tests |
| Learning app (videos, quizzes, offline) | Not in this repository | Separate product |

## 3. Built but not yet checked on the live system

- [ ] Live Chapa checkout and webhook at `https://api.myseed.com.et/api/donations/webhook/chapa`
- [ ] Live Stripe checkout and webhook (and the USD price on the quick donate popup)
- [ ] Direct Telebirr checkout
- [ ] Bank transfer proof with MySeed Verify or Tina Verify approving automatically
- [ ] Receipt emails arriving in Gmail and passing `/receipts/verify`
- [ ] Sponsorship application from screening to package and access code
- [ ] Newsletter confirm and unsubscribe emails
- [ ] Tier 2 translation of new content with Google or Claude keys
- [ ] Assistant AI answers and the monthly AI budget cut-off
- [ ] SMS sending through AfroMessage or Iconic SMS
- [ ] Media uploads stored in a bucket, if one is connected
- [ ] Nightly backup running on the server and a restore tested
- [ ] External uptime workflow switched on
- [ ] Rollback with `deploy.sh --rollback`
- [ ] Seeded staff password changed on the live system

## 4. Risks

| Risk | Why it matters | What reduces it |
| --- | --- | --- |
| Silent memory mode in production | If PostgreSQL is unreachable at start, the API serves from memory and new payments or applications are lost on restart | Alert on `/readyz` reporting `memory` |
| One server, one API process | Single point of failure; timers and rate limits cannot be shared across instances | Off-server backups, external uptime check; Redis-backed limits before scaling |
| No migration history | `prisma db push` can refuse a change and stop a deploy; code rollback does not undo schema changes | Prisma migrations, or a review step for schema changes |
| Secrets that cannot change | Changing `ENCRYPTION_KEY` breaks saved keys; changing `JWT_SECRET` breaks issued receipt codes when `RECEIPT_SIGNING_SECRET` is unset | Store `/opt/myseed/.env` in a password manager; set `RECEIPT_SIGNING_SECRET` |
| Staff accounts with password only | Accounts can see donors and applicant documents | Two-factor sign-in |
| Untested money and aid flows | Bank transfer, verification and aid flows have no E2E tests | Add E2E cases TC-9 and TC-11 |
| Docs that do not match the code | `docs/ops/` describes a learning feature, a v2.4.0 release, an incident and on-call staff that do not exist in this repository; `disaster-recovery.md` describes a different backup schedule | Mark those documents as plans or templates (done in this export's index) |
| Committed session transcript | `OPS doc/claudestooped here.md` (a tool session log) is committed; no live secrets were found in it, but it does not belong in the repository | Remove it from the repository |
| Duplicate docs | `OPS doc/` is a copy of `docs/ops/` with Windows line endings | Keep one copy |
| Next.js 14 | No longer gets new fixes | Upgrade to Next.js 15 and React 19 |
| Single contributor | Knowledge sits with one person | This documentation; a second reviewer for deploys |

## 5. Recommended order for what is next

1. Confirm production: which host serves `myseed.com.et`, that `/readyz` reports `postgres`, that backups run, and that the seeded password is changed. Nothing else should go first.
2. Check the money paths live (section 3): Chapa, bank transfer with verification, receipts. These touch donors directly.
3. Switch on the external uptime workflow and add an alert for memory mode.
4. Set `RECEIPT_SIGNING_SECRET` and store all server secrets off the server.
5. Add E2E tests for sponsorship applications and bank transfers.
6. Remove `OPS doc/` (duplicate and transcript) and label the aspirational ops documents.
7. Add two-factor sign-in for roles with donor, aid, finance or settings access.
8. Move from `db push` to Prisma migrations.
9. Upgrade Next.js, then audit the admin console for accessibility.
10. Continue the site builder (roadmap Part 3) and recurring billing.
