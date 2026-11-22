# 04. Mobile apps and parental controls

The Student and Parent apps are separate Android and iOS apps built with React Native (Expo, with native modules where required). They share a design-token package, the API client and the identity flow, but not navigation or permissions. The current combined app is retired once both are live.

This document covers the school-facing features and the parent control model. MySeed learning features (catalog, lessons, video, quizzes, flashcards, national exams, subscriptions) are owned by the Education System specification and are listed here only where they meet the school features.

## 1. Shared foundations

| Concern | Decision |
| --- | --- |
| Sign-in | MySeed Identity: phone number and OTP; optional 4 to 6 digit app PIN or biometric unlock after first sign-in |
| Sessions | Short-lived access token plus rotating refresh token in secure storage (Keychain, Android Keystore); device list visible and revocable |
| API | App API only (Education System); typed client generated from its OpenAPI |
| Data fetching | TanStack Query with persisted cache (encrypted MMKV) for offline display |
| Offline writes | Durable on-device queue for submissions and messages; items show "Sending" until a server receipt arrives |
| Push | FCM and APNs through the Education System notification service; deep links to the exact record |
| Languages | English and Amharic at launch; Noto Sans Ethiopic bundled |
| Calendar | Ethiopian or Gregorian per user setting |
| Device security | Policy from Education System (document 06, section 1.4): screen-capture blocking on protected screens, emulator and integrity checks through Play Integrity and App Attest |
| States | Every screen designs loading, empty, offline, stale ("Last updated 09:40"), not linked, link pending, connection paused, module not enabled, no permission, and error |
| Accessibility | Screen-reader labels, dynamic type, 44 pt touch targets, reduced motion |

The UI follows the same rules as the web: no emoji, lucide icons, MySeed tokens, sentence case.

## 2. MySeed Student: school features

The My School tab appears when the student has at least one active or pending connection. Without one, it shows a single "Connect your school" entry with both link methods. MySeed learning never depends on a school link.

| Screen | Content | Source | Priority |
| --- | --- | --- | --- |
| Connect your school | Enter code; or search school and send request; request status | Connect API | P0 |
| Today | Current and next period, attendance status today, work due in 3 days, new materials, announcements | `/today` | P0 |
| Timetable | Day and week view, teacher and room, changes highlighted | `/timetable` | P0 |
| Assignments | Tabs: To do, Submitted, Returned. Detail with instructions, attachments, rubric, due time, late policy; submit text or files; receipt; feedback and marks | `/assignments` | P0 |
| Materials | By subject, then unit or week; preview in app viewer; download or offline when allowed; "New" badge until opened | `/materials` | P0 |
| Attendance | Month calendar view, totals by status | `/attendance` | P0 |
| Results | Published assessments by subject; report cards list with PDF viewer | `/results`, `/report-cards` | P0 |
| Calendar | Exams, holidays, events, deadlines | `/calendar` | P0 |
| Announcements | List and detail with attachments | `/announcements` | P0 |
| Connection | School, class, status, last sync, disconnect, get help | `/connections/{id}` | P0 |
| Study planner | Combines school timetable, deadlines and chosen MySeed lessons | App API (Education System) plus school data | P1 |
| Related lessons | On an assignment or material, suggest MySeed lessons for the same subject and grade | Education System | P1 |

Every school item is labeled with its source ("From Bole Academy") and school results are never shown inside MySeed practice scores.

## 3. MySeed Parent: school features

| Screen | Content | Priority |
| --- | --- | --- |
| Add a child | Enter guardian code from the school; or request by school search; or link a MySeed-only child (section 4.2) | P0 |
| Overview and action center | Ordered list of things that need the parent: absence today, work due, new report card, fee due, teacher reply, request awaiting approval. Every item opens the record | P0 |
| Child: school | Attendance, timetable, assignments and status, guardian-visible materials, results, report cards, calendar, announcements, teachers | P0 |
| Absence explanation | Reply to an absence with a reason and optional attachment (if school enables) | P0 |
| Messages | Conversations per child and school; start one with an allowed teacher; attachments; read state | P0 |
| Fees | Invoices, balance, due dates, pay with the school's provider, receipts | P0 when school has fees module |
| Correction request | Ask the school to fix a name, contact or record | P1 |
| Family calendar | All children's events in one view, each labeled | P1 |
| Meeting booking | Book teacher meeting slots published by the school | P2 |

What a parent sees at school is decided by the school (guardian access profile, document 02, section 4.13). The Parent app never widens it.

## 4. Parental controls

"Parents control their children" covers two different things, owned by different systems:

| Layer | Who decides | Stored in | Examples |
| --- | --- | --- | --- |
| **School access** | The school | SchoolHub (guardian access profile) | Whether this guardian can see results, pay fees, message teachers |
| **MySeed account controls** | The parent | Education System (`parental_controls`) | Purchases, study time, content level, devices, which schools the child may link |

### 4.1 Who counts as the parent on a MySeed account

A parent can manage a child's MySeed account when a **family link** exists in the Education System. A family link is created in one of three ways:

1. **From a school guardian connection**: when a parent's guardian connection is active for a student who also has a student connection at the same school, the Education System offers a family link. The child is notified in the Student app.
2. **From the child's app**: the child opens **Profile, Family**, shows a one-time family code; the parent enters it in the Parent app.
3. **From the parent's app**: the parent enters the child's MySeed phone number; the child confirms the request in the Student app.

A child can have up to two managing parents. Removing a family link requires either the other managing parent, the child after age 18, or MySeed support with verification.

### 4.2 Controls the parent can set

| Control | Options | Default | Enforced by |
| --- | --- | --- | --- |
| Purchases and subscriptions | Child can buy freely / needs parent approval / parent buys only | Needs approval | Education System checkout refuses unapproved payment intents |
| Daily study limit | Off, or 30 to 300 minutes per day for MySeed content | Off | App API returns `limit_reached`; school features are never limited |
| Allowed hours | Time windows when MySeed content is available, per weekday | Always | App API |
| Content level | Child's grade only / grade and below / all grades | Grade and below | App API filters catalog and lesson access |
| School links | Child may link schools freely / parent must approve each new school link | Parent must approve under 16 | Gateway holds the link request until the parent approves |
| Learning progress sharing with school | Off / allowed | Off | Gateway (document 03, section 12) |
| Devices | See child's signed-in devices; sign out a device; limit to N devices | Limit 2 | MySeed Identity |
| Reports | Weekly summary of learning and school activity by push and in-app | On | Notification service |
| Engagement features | Leaderboards, badges, daily tasks on or off | On, no public leaderboard under 16 | App API and app config |
| Referral and agent programs | Child may join / may not | May not | Education System |

Rules:

- **School features are never blocked by MySeed controls.** A study limit or allowed hours apply to MySeed learning content only; timetable, assignments, materials, results and school messages are always available. A school's own requirements must not be broken by a family setting.
- Every change is recorded with who made it and is visible to the child in **Profile, Family** with a plain explanation. Controls are transparent, not hidden.
- Controls are enforced on the server. The app reflects them, but bypassing the app gains nothing.
- At 18 the child can end the family link and all controls.

### 4.3 What the parent sees about the child

| Information | Source | Condition |
| --- | --- | --- |
| School attendance, results, assignments, materials, fees | SchoolHub | Active guardian connection, access profile allows it |
| MySeed lessons completed, quiz performance, time studied | Education System | Active family link |
| Subscription status and purchase history | Education System | Active family link |
| Child's device list | MySeed Identity | Active family link |
| Child's private notes, bookmarks, message drafts | Not shown | Never |

A parent who is a guardian at school but has no family link sees school data only. A parent with a family link but no school connection sees MySeed data only. The Children screen shows both badges so the parent understands why something is or is not visible.

### 4.4 Approvals inbox

Requests from the child that need the parent appear in the Overview action center:

- Purchase or subscription request (approve, decline, pay now)
- New school link request (approve or decline; on approve, the request continues to the school)
- Extra study time request (grant 15, 30 or 60 minutes today, or decline)

Unanswered requests expire after 7 days. The child sees the status in the Student app.

## 5. Release requirements for both apps

- Builds for Android (minimum version set after device survey of current users, target API level current at release) and iOS.
- Real-device test matrix including low-end Android devices common in Ethiopia and slow 3G network profiles.
- Crash reporting and performance monitoring (Sentry), with personal data scrubbed.
- Forced-upgrade path controlled from Education System app configuration.
- Store listings, privacy labels and data-safety forms prepared with the legal review (open decision D6).
