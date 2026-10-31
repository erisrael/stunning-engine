# Face check-in: guidelines

Face check-in lets people check in and out at the attendance kiosk by looking at the camera. It is optional for every person, off until HR switches it on, and always sits beside badge and PIN. Read this before switching it on, and keep it with the HR policies.

## 1. What the system does

- **At the kiosk**, the browser finds one face, asks the person to blink, and turns the face into a *face code*: 128 numbers that describe its shape. No photo or video is stored or sent. The face code goes to the server, is compared with the codes of enrolled people, and is then thrown away. Only the result (who checked in, and when) is recorded, labelled "Kiosk, face".
- **The blink** is the liveness check. A printed photo or a phone screen cannot blink on request. It is a basic check, not proof against a determined attacker (see section 7).
- **Matching** accepts the closest enrolled person only when the face is close enough (the *match strictness*, 0.5 by default) and clearly closer than anyone else. Otherwise the kiosk says "not recognised" and the person uses their badge or PIN.
- **Enrolled face codes** are stored encrypted with the workspace key, and only on the server: never on the kiosk, never in backups, exports or the audit log. They are deleted automatically when the person leaves (status *Left* in HR), when they withdraw consent, or when HR deletes them.
- **The models** that read faces are served by the app itself; no face is sent to any outside service.
- **Offline**, face check-in does not work. Badge and PIN do: the kiosk keeps them and sends them later.

## 2. Before switching it on

1. **Decide whether you need it.** Badges and PINs already work. Use faces only if they solve a real problem (for example, badges shared between colleagues) and only where the law allows it.
2. **Check the law.** A face code is biometric personal data. In Ethiopia this falls under the personal data protection law (Personal Data Protection Proclamation No. 1321/2024) and the Labour Proclamation No. 1156/2019. Have your legal adviser confirm what applies to you: lawful basis, consent, registration or notification with the authority, retention and cross-border storage (the database may be hosted abroad, for example on Supabase).
3. **Write a short assessment (DPIA)** with: purpose (attendance only), why badges and PINs are not enough, who can see what, how long data is kept, risks (wrong matches, misuse, a breach) and what reduces them. Keep it with this document.
4. **Prepare the consent form** (section 3) and a place to keep signed forms.
5. **Update the attendance policy** shown in Attendance, Setup (the face paragraph is already included) and tell staff before the first enrolment.
6. **Try it** with a few volunteers for two weeks (section 6) before offering it to everyone.

## 3. Consent

- Face check-in is **only** for people who choose it, by **signing** the consent form. No one may be pressured, rewarded or treated differently for choosing or refusing it; badge and PIN must always work.
- The app shows the consent text (version 2026-10) in the enrolment dialog. Print the same text as the form:

  > I agree that my employer uses a code made from my face to record when I check in and out at the attendance kiosk. No photo of me is stored. The face code is encrypted, used only for attendance, never shared or exported, and deleted when I withdraw this consent or leave. I can use my badge or PIN instead at any time, and withdraw this consent on my Attendance page or by telling HR, without any effect on my job.
  >
  > Name, employee number, signature, date. Witness (HR): name, signature.

- HR ticks "signed the consent form" in the app and notes where the signed form is kept. The app records who enrolled the person, when, and which consent version.
- **Withdrawing**: the person presses *Withdraw consent and delete* on their Attendance page, or asks HR. The face code is deleted at once and they use their badge or PIN.
- If the consent text changes, it gets a new version and people are asked again.

## 4. Enrolment (HR)

1. Attendance, Setup: switch on *Face check-in at the kiosk*.
2. In *People, shifts and badges*, press *Set up* in the Face column for the person, with them present.
3. Read the consent text with them, have them sign the form, tick the box.
4. Use a laptop or tablet camera in good, even light, the person alone in view, glasses as they normally wear them. Press *Take captures* and let them follow the five prompts (straight, a little left, right, chin up, straight).
5. Save. If the captures do not look like one person, the app refuses them; take them again.
6. Re-enrol when appearance changes a lot (a new beard, new glasses) or when check-ins start failing often.

## 5. The kiosk

- Mount the tablet at face height, facing away from windows and bright lights. Light should fall on faces from the front.
- People press *Check in with my face*, look at the camera and blink. A screen tells them to come closer or move into the middle if needed.
- The kiosk never shows a list of enrolled people and never stores pictures. The camera is on only while someone is checking in with their face.
- If someone is not recognised, they use their badge or PIN; nothing else happens.

## 6. Trial and accuracy

- Run a two-week trial with 5 to 10 volunteers of different ages, skin tones, with and without glasses. Count: successful checks, "not recognised" (too strict), and any wrong person (too loose).
- Start at strictness 0.5. If any wrong person is recorded, lower it (0.45). If many people are not recognised, check the light first, then re-enrol, and only then raise it (never above 0.55).
- Recognition can work less well for some faces. If a group of people is often not recognised, stop and review before going further; they must never be disadvantaged (badge and PIN keep working).
- Check the *How* column on the daily board: wrong matches show as a check-in the person did not make. People can ask for a correction; HR reviews it.

## 7. Limits and risks

- The blink check stops photos and screens, not a well-prepared video or mask. Face check-in is for convenience, not high security. For sensitive areas use badges and supervision.
- Twins and close relatives can be confused; the "clearly closer than anyone else" rule reduces this but does not remove it. Offer them badges.
- A face code cannot be changed like a PIN. That is why it is stored encrypted, only on the server, never exported, and deleted when no longer needed.

## 8. Access, retention and incidents

- Only the matching code on the server reads face codes. HR sees *whether* someone is enrolled, never the code. Admins cannot export it; backups do not contain it.
- Face codes are kept only while the person is employed and consenting. Attendance records (times) follow the normal attendance retention for payroll and labour law.
- **If you suspect a breach** (lost server credentials, a leaked database copy): switch face check-in off, delete all face data (Setup, Face column, Delete for each person), inform affected staff and the authority as the law requires, rotate the workspace key (`APP_SECRET`), then re-enrol only with fresh consent.
- Review this document, the DPIA and the consent text once a year.

## 9. Switching it off

Switch off *Face check-in at the kiosk* in Attendance, Setup. Kiosks stop offering it at once. To remove all data, delete each enrolled person's face in the Face column; people who leave are deleted automatically.
