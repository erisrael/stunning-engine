# Dev team progress report

Where Myseed Ops stands on 23 November 2026: what is built, what is waiting to be confirmed on the live system, what is still open, and what the Dev team itself needs next. It is updated whenever a phase finishes or its scope changes (RULE-64); the full detail is in the [roadmap](../ROADMAP.md) and the [release history](RELEASE-HISTORY.md).

## 1. Summary

| Measure | Now |
| --- | --- |
| Roadmap phases | 58 planned; 48 done; 9 built with items still open (listed below); Phase 45 in progress |
| Named updates | Update 1.0 (8 phases) and Update 1.1 (phases 10 to 16) done; Update 1.2 (10 phases) built and committed, with checks still to make on the live system |
| Latest work | Phase 46: documents shown as formatted company documents; the project documentation and this handbook in Specs and docs |
| In the app | Dev team: 13 projects on the Roadmap (12 delivered, Maintenance and improvements open), Sprints 1 and 2 closed, Sprint 3 active, 9 releases with their production deployments, 132 tasks (from `docs/dev-history.json`) |
| Automated tests | About 110 server test files and 70 browser flows, run in CI on every push and pull request |
| Production | https://ops.myseed.com.et on the Hostinger VPS, auto deployed from `main` |
| History | 196 commits since 28 October 2026, all by one developer |

## 2. Status by area

| Area | State | Still open |
| --- | --- | --- |
| Production workflow | Done | |
| Departments and flows | Done | Marketing: the requester joining the review |
| Dev studio | Done | |
| Specs and docs, library | Done (Phase 46) | |
| Presentations | Done | Video export |
| Team chat, calls | Done | Continuous ringing on a locked phone (needs the native app) |
| Mail | Core done | Formatting in messages (bold, lists, links); Google Workspace and Microsoft 365 mailboxes through their own sign-in |
| HR, attendance, payroll | Done | Check-in by SMS for basic phones (needs a paid SMS gateway); payroll months in the Ethiopian calendar |
| Finance and Chapa | Built | Confirm the Chapa sync against the live API (section 3) |
| Customer support | Done | Connect the Myseed App (its real key and SDK); SMS as a channel (needs a paid gateway) |
| Legacy CMS (Noor) | Built | Confirm the complete collection and field registry against the live Noor (section 3) |
| Assistant | Done | Answers streamed word by word; reading a page aloud; more actions once people trust the first ones |
| Amharic and the Ethiopian calendar | Dates done | Every remaining label, message and email in Amharic (and Afaan Oromo later) |
| Foundations | Done | A staging site (the steps are in [RECOVERY.md](../RECOVERY.md); it needs a second server) |
| App shell (phones) | Web part done | Native Android and iPhone builds, native camera scanner, reliable notifications and ringing, biometric sign-in, deep links, support inside the Myseed App |
| Fun mode, Seed Town | Phase 45 in progress | Hills and grass fields, sky lighting, more people; elevation on the circuits; online Grand Prix races and online Seed Core; humans and bots in one online match; an 11-a-side match; more licensed car models |

## 3. To confirm on the live system

These are built and tested against fakes, but have not yet been run against the real services:

- [ ] **Chapa**: in Finance, Chapa, Settings press *Check API* for each business (it reports whether Chapa applies the date range, the paging, the row order and the date zone), then run a full sync in *Sync and reconcile* and compare the counts.
- [ ] **Noor**: run the complete collection and the field registry against the live Noor, and check the mirror's hourly and nightly runs.
- [ ] **The repository documents**: after the next deploy, open Dev team, Specs and docs and check that the folders *Myseed Ops documentation* and *Dev team handbook* are there and open formatted.

## 4. The team and its way of working

The system has been built by one developer, which is the biggest risk to it: knowledge, reviews, releases and production access all sit with one person. The handbook added in Phase 46 sets out how a team works on it; these are the steps that make it real:

- [ ] Name the Dev team in the app: the Head of Dev, leads and members (Admin, Departments), and testers in Configure, Flow
- [ ] Protect `main` on GitHub: changes only through pull requests with one approval and green CI (RULE-10)
- [ ] Set the definition of done in Configure, Sprints to match the [operating guide](../dev-team/OPERATING-GUIDE.md), section 5
- [ ] Start the first sprint with the open items above as the backlog, in the order below
- [ ] Fill in the names and phone numbers in [RECOVERY.md](../RECOVERY.md), section 4
- [ ] Set up the staging site
- [ ] Have someone other than the author run a deploy and a rollback with the [release guide](../dev-team/RELEASE-GUIDE.md), so production knowledge is held by two people

## 5. Recommended order for what is next

1. The live checks in section 3 (Chapa first: it is money).
2. The team steps in section 4, starting with protecting `main`.
3. The staging site, so risky changes (payments, sign-in, Noor, calls) can be tried before production.
4. Connecting the Myseed App's support (it needs the app's real key).
5. Native Android builds of the employee app (an Android machine with Android Studio), then iPhone.
6. The remaining Amharic.
7. Seed Town's open items, as time allows around the work above.
