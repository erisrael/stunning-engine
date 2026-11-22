# Writing specs and docs

How the Dev team writes, reviews and keeps documents in Dev team, Specs and docs (`/dev/docs`), and how those documents are stored and shown.

## 1. How documents are stored and shown

Every document is **Markdown**, stored exactly as written or imported. The app shows it as a formatted company document:

- a header with the logo and workspace name, the kind of document and its reference (for example `DEV-SRS-3F9A1C`);
- a **document control** table: version and status, owner, project, last updated, approval date, reviewers and, for documents from the repository, the file they come from;
- **contents** built from the headings;
- the body with Myseed's styling: section headings, tables, checklists, code, callouts, and requirement IDs and priorities picked out.

The editor has three views: **Formatted** (the company document), **Markdown** (the text) and, on wide screens, **Side by side** (type on the left, see the result on the right). Word, Markdown and PDF (print) exports use the same formatting. Word and web pages imported into the library are turned into Markdown once, on import; a Markdown or text file is kept exactly as it is.

## 2. Which document to write

| Kind | Write one when | Template |
| --- | --- | --- |
| Product brief (PRD) | A new feature or product: the problem, the goal, users and stories, scope | Product brief |
| Software requirements (SRS) | Requirements need to be agreed and traced to tasks | SRS (IEEE 830 / ISO 29148 outline), or SRS for a Myseed learning feature |
| Technical design | The change touches the schema, several modules, an outside service or security | Technical design (Myseed stack) |
| Decision record (ADR) | A technical choice others will ask "why?" about | Architecture decision record |
| Test plan | A feature needs more than the automated tests: devices, networks, manual cases | Test plan with Myseed's devices |
| Release notes | Each release | Release notes and checklist |
| Runbook | Something has to be operated, set up or recovered | Runbook |
| Postmortem | After every severity 1 or 2 incident | Postmortem |
| Note | Anything else, and imported documents | Blank document |

A fix or a small change does not need a document; the task and the pull request description are enough.

## 3. Requirements

Write each requirement on its own line with an ID, a MoSCoW priority and acceptance criteria:

```markdown
FR-1 (Must): A student finds a lesson by grade, subject, unit and part.
  Acceptance: from the home screen in at most three taps.
FR-2 (Should): The student can switch between Amharic and English.
NFR-1 Performance: the lesson list opens in under 2 seconds on a 3G connection.
```

- Prefixes: `FR` functional, `NFR` non-functional, `IR` interface, `DR` data, `UR` user, `SR` security.
- Priorities: `(Must)`, `(Should)`, `(Could)`, `(Won't)`.
- IDs never change once the document has been approved. A dropped requirement is marked `(Won't)` rather than deleted, so its links stay meaningful.
- Each ID becomes a row under **Requirements traced to tasks** in the editor: type a task code (DEV-12) to link the task that builds it. A requirement without a task is marked "not covered".

## 4. Markdown that reads well

| You write | It shows as |
| --- | --- |
| `# Heading`, `## Heading`, `### Heading` | Section headings (and the contents) |
| `- item`, `1. item` | Lists |
| `- [ ] to do` and `- [x] done` | A checklist |
| A table with a `\| --- \|` line under the header | A table with a header row |
| `**bold**`, `*italic*`, `` `code` `` | Bold, italic, code |
| Three backticks before and after, with a language (`ts`, `sql`, `bash`) | A code block with its language |
| `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` on the first line of a quote | A callout with that label |
| `[text](https://...)` | A link (web, mail and phone links only) |
| `[text](OTHER-DOC.md)` in a repository document | A link to that document in the library |

Lines typed one under another stay on separate lines, as you typed them (a file wrapped at a fixed width, as some READMEs are, is joined into paragraphs instead). Raw HTML is shown as text and never runs. Mermaid diagrams (a code block marked `mermaid`) are shown as their source.

Front matter (lines between `---` at the very top) is shown in the document control table:

```markdown
---
title: Offline lessons
owner: Dev team
audience: Product, Dev
---
```

## 5. Review and approval

1. Write the draft. Any member of Dev can edit a draft.
2. **Submit for review** with named reviewers (leads or the head; heads and Admin can choose themselves). Reviewers are notified.
3. Each reviewer approves, or requests changes with a note. The document is approved when every named reviewer has approved.
4. Changing an approved document saves a new version; the approved one stays in Earlier versions, and the new version goes through review again.

A spec is approved before the tasks it describes enter a sprint (Definition of Ready).

## 6. Documents from the repository

The project's own documentation lives in the repository as Markdown files and is listed in `docs/library.json`. Every time the server starts (so after every deploy) those files are brought into Specs and docs, into the folders the list names:

- a new file becomes a draft document;
- a changed file updates its document, unless someone edited that document in the app; an approved or reviewed document keeps that version in its history and starts a new version;
- a document someone deleted in the app is not brought back, and a document someone moved stays where they put it.

These documents carry a **repository** mark in the library and show their file in the document control table. To change one, edit the file in a pull request (RULE-63). To add one, add the file and a line in `docs/library.json`:

```json
{ "file": "docs/project/NEW-DOC.md", "folder": "Myseed Ops documentation/3. Architecture and decisions", "kind": "design", "title": "New design" }
```

`kind` is one of `srs`, `prd`, `design`, `adr`, `testplan`, `release`, `runbook`, `postmortem` or `note`. To bring them in on your own computer without starting the server, run `npm run docs:sync`.

## 7. Exports

- **Word**: a `.docx` with the logo (PNG or JPEG logos) and workspace name in the header, the document control table, headings, lists, checklists, tables, code, quotes, links, and page numbers in the footer.
- **PDF**: Print opens the company document on A4 pages with a cover page, contents and page numbers (choose "Save as PDF").
- **Markdown**: the stored text, with the title added on top when the text does not already start with it.
- **Notion**: when Notion is connected, a document can be sent to Notion or brought in from a Notion page.
