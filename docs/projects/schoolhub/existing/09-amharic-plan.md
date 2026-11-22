# 09. Full Amharic capability plan

Status: plan, not started beyond what is listed under "Today". Owner: product and portal.

## Goal

A school can run SchoolHub entirely in Amharic: every screen, message, document, search, report and export, with
the Ethiopian calendar and Ethiopic numerals where schools expect them. A person picks English or Amharic for
themselves; parents and students receive messages in their own language; printed documents follow the school's choice
and can be bilingual.

## Today

- `apps/portal/lib/i18n.tsx` has an English and Amharic dictionary, mostly navigation (about 190 `t()` calls). Most
  page copy, toasts, empty states, validation messages and table headers are hard-coded English.
- `user.language` (`en` or `am`) is saved and set on `<html lang>`.
- Noto Sans Ethiopic is loaded as `--font-ethiopic` and sits in the heading font stack.
- `packages/calendar` converts Ethiopian and Gregorian dates; `user.calendar` picks which one is shown.
- Some records already carry an Amharic name field (schema `nameAm` style columns).
- API error messages, notifications (SMS, email, push) and PDF documents are English only.

## Workstreams

### 1. Message catalogue and extraction (foundation)

- Move strings to a catalogue per namespace (`common`, `nav`, `people`, `academics`, `finance` and so on) under
  `packages/i18n`, shared by the portal, the API (errors, notifications, documents) and the mobile apps through
  `packages/contracts`.
- Use ICU MessageFormat for plurals, gender and numbers (Amharic plural rules differ from English).
- Add a lint rule that flags literal JSX text and string literals in `toast`, `Callout`, `PageHeader`, `Field label`.
- Extract every existing English string; keys are stable ids, English is the source.
- CI check: every key present in `en` exists in `am` or is listed as pending; the build reports coverage per page.

### 2. Translation and terminology

- A school glossary reviewed by Ethiopian educators: grade, section, homeroom, term, semester, transcript, assessment,
  guardian, invoice, receipt, fee waiver and the rest, matched to Ministry of Education usage.
- Professional translation of the catalogue, then review by two pilot schools.
- A translation workflow: export to XLIFF or JSON, import with review status, never machine-translate live.
- Tone rules in Amharic: polite forms for parents, short imperative labels for buttons.

### 3. Typography and layout

- Ethiopic as the first font when `lang=am`, for body and headings, in every theme including the serif, rounded and
  technical typefaces (each needs an Ethiopic fallback that matches its weight).
- Line height of at least 1.6 for Ethiopic body text; fidel characters are taller and denser than Latin.
- Check truncation, button widths and table headers: Amharic labels often run 20 to 40 percent longer.
- Respect the new Text size setting; test at 140 percent in Amharic.
- Ethiopic punctuation (word space, full stop) rendered and kept in copy, not replaced by Latin punctuation.

### 4. Input, search and sorting

- Amharic keyboard input works in every field; names accept Ethiopic characters in validation (Zod patterns use
  Unicode property classes, not `[A-Za-z]`).
- Search: normalise fidel variants that sound the same (for example the several "ha" and "se" series) so a search
  finds a name however it was typed; transliteration search so typing "Abebe" finds the Amharic spelling and the
  reverse.
- Postgres: an `unaccent`-style normalisation function and trigram indexes on the normalised name columns.
- Sorting by fidel order (ICU collation `am`), both in the database and in the portal tables.

### 5. Data model

- Bilingual names for people, schools, subjects, grades, sections, fee items and classes: `name` plus `nameAm`,
  the display picking the viewer's language and falling back to the other.
- Imports (CSV, Excel) accept either column and keep both.
- Contracts first: the Zod schemas gain the Amharic fields before the API and portal.

### 6. Dates, numbers and money

- Ethiopian calendar as the default display for Amharic users; Gregorian on request; documents state which.
- Ethiopian academic year (Meskerem to Sene) in term setup, attendance and reports.
- Amharic month and weekday names; time of day in local style as an option.
- Numbers in Arabic digits by default, with Ethiopic numerals as an option for documents (certificates, report cards).
- Money in Birr with the Amharic currency name; amounts in words on receipts in Amharic.

### 7. Documents

- Report cards, transcripts, ID cards, receipts, invoices and letters render in Amharic, English or both side by
  side; the PDF renderer embeds the Ethiopic font and shapes text correctly.
- Templates per school choose the language; bilingual by default for transcripts.

### 8. Notifications

- SMS in Amharic uses UCS-2 (70 characters per part instead of 160); the composer shows the part count and cost.
- Email and push templates per language, picked by each guardian's and student's own language.
- Guardian language is a field on the guardian record, defaulting to the school language.

### 9. API and integrations

- `Accept-Language` on API requests; error messages and validation details localised by key, with the key always
  included so clients can translate themselves.
- Connect API events carry both name fields; MySeed apps choose the display.

### 10. Accessibility and quality

- `lang="am"` on Amharic fragments inside English pages (names, quotes) so screen readers switch voice.
- Screen-reader check with NVDA and an Amharic voice where available.
- Visual regression screenshots of every page in Amharic, light and dark, normal and High contrast, 100 and 140
  percent text.
- Pseudo-locale (lengthened, accented) in development to catch hard-coded strings and overflow.

## Phases

| Phase | Scope | Exit criteria |
| ----- | ----- | ------------- |
| 1. Foundation | Workstream 1, typography (3), lint rule, coverage report | Every string comes from the catalogue; coverage visible in CI |
| 2. Core screens | Translate navigation, home, people, attendance, results; bilingual names (5); input and search (4) | A pilot school can run daily work in Amharic |
| 3. Money and documents | Finance screens, receipts, report cards, transcripts (6, 7) | Amharic and bilingual PDFs approved by pilot schools |
| 4. Messages | SMS, email, push per recipient language (8); API errors (9) | Guardians receive messages in their own language |
| 5. Completeness | Remaining admin screens, Ethiopic numerals, accessibility pass (10) | 100 percent catalogue coverage; screenshot suite green |

## Risks

- Terminology disagreements between schools: keep a school-level override of glossary terms.
- Text overflow in dense tables: the screenshot suite at 140 percent catches it before release.
- SMS cost roughly doubles in Amharic: show it before sending and let schools choose the language per message.
- Search quality for names with several spellings: measure with a sample of real (anonymised) name lists.

## Decisions to confirm

- Default calendar for Amharic users (proposed: Ethiopian).
- Bilingual or single-language transcripts by default (proposed: bilingual).
- Whether Afaan Oromo and Tigrinya follow with the same catalogue (the plan keeps that possible).
