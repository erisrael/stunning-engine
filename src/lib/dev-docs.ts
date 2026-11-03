// Specs and documents in the Dev studio (Phase 12b.3 and 12b.4): the kinds, and ready templates written for
// Myseed's own products. Documents are plain text with "#" headings; requirements carry IDs such as FR-1 and
// NFR-2, which link to tasks.

export const DOC_KINDS = [
  { key: "srs", label: "Software requirements (SRS)" },
  { key: "prd", label: "Product brief (PRD)" },
  { key: "design", label: "Technical design" },
  { key: "adr", label: "Decision record" },
  { key: "testplan", label: "Test plan" },
  { key: "release", label: "Release notes" },
  { key: "runbook", label: "Runbook" },
  { key: "postmortem", label: "Postmortem" },
  { key: "note", label: "Note or imported document" },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]["key"];
export const DOC_STATUS_LABELS: Record<string, string> = { draft: "Draft", review: "In review", approved: "Approved" };

// Requirement IDs in a document, in order of appearance: FR-1, NFR-2, IR-3...
export function requirementIds(body: string): string[] {
  return [...new Set(body.match(/\b(?:FR|NFR|IR|DR|UR|SR)-\d{1,4}\b/g) ?? [])];
}

const SRS = `# 1. Introduction
## 1.1 Purpose
What this document specifies, and for whom.
## 1.2 Scope
The product or feature, what it does and what it does not do.
## 1.3 Definitions and references

# 2. Overall description
## 2.1 Users
Who uses it (students, teachers, Myseed staff) and what they need.
## 2.2 Operating environment
## 2.3 Constraints and assumptions

# 3. Functional requirements
Each with an ID, a MoSCoW priority (Must, Should, Could, Won't) and acceptance criteria.
FR-1 (Must): ...
  Acceptance: ...
FR-2 (Should): ...
  Acceptance: ...

# 4. Non-functional requirements
NFR-1 Performance: ...
NFR-2 Security: ...
NFR-3 Availability: ...
NFR-4 Usability: ...

# 5. Interfaces
IR-1: ...

# 6. Data
DR-1: ...
`;

const SRS_MYSEED = `# 1. Introduction
## 1.1 Purpose
Requirements for a learning feature in the Myseed app.
## 1.2 Scope
Grade, subject, unit and part covered; what the student can do; what is out of scope.

# 2. Overall description
## 2.1 Users
Students (Grade 9 to 12), teachers, parents; Myseed content staff.
## 2.2 Operating environment
Android phones from 2 GB RAM, Android 8 and later; often 3G or unstable connections; shared phones.
## 2.3 Constraints and assumptions
Content follows the Ethiopian curriculum (grade, subject, unit, part). Amharic and English at least.

# 3. Functional requirements
FR-1 (Must): The student finds the part by grade, subject, unit and part.
  Acceptance: from the home screen in at most three taps.
FR-2 (Must): The video plays and continues where the student stopped.
  Acceptance: resume within 2 seconds on a 3G connection.
FR-3 (Must): The student downloads a part to watch offline.
  Acceptance: plays with the network off; the download can be removed.
FR-4 (Should): Notes and the exam for the part are one tap away from the video.
FR-5 (Should): The student switches the language (Amharic, English, others available).
FR-6 (Could): Progress per unit is shown and synced when back online.

# 4. Non-functional requirements
NFR-1 Low bandwidth: video in 240p, 360p and 480p; the app picks the lowest that plays smoothly.
NFR-2 Storage: a part takes at most 60 MB at 360p.
NFR-3 Languages: every text has Amharic and English; Ethiopic script renders on all supported phones.
NFR-4 Offline: everything downloaded works without a connection for 30 days.
NFR-5 Privacy: no personal data leaves the phone without consent.

# 5. Interfaces
IR-1: The content manager publishes the part (video ID, notes, exam) to the app's API.

# 6. Data
DR-1: Parts are identified by grade, subject, unit and part number, as in the content manager.
`;

const PRD = `# Problem
Who has the problem, and how we know.

# Goal
What success looks like, with numbers.

# Users and stories
- As a ..., I want ..., so that ...

# Scope
In: ...
Out: ...

# Requirements
FR-1 (Must): ...

# Risks and open questions

# Timeline and release
`;

const DESIGN = `# Context
What is being built and why (link the SRS or PRD).

# Architecture
Components and how they talk. Myseed's stack: Next.js app (server actions), PostgreSQL (Supabase), the Android app, YouTube for video, the content manager's API.

# Data model
Tables or fields added or changed.

# Interfaces
APIs, events, files.

# Decisions
What was chosen and the alternatives (or link the decision records).

# Security and privacy

# Rollout and migration

# Testing
`;

const ADR = `# Title
ADR-1: ...

# Status
Proposed / Accepted / Replaced by ...

# Context
The forces at play.

# Decision
What we decided.

# Consequences
What becomes easier or harder.
`;

const TESTPLAN = `# Scope
What is tested; which requirements (FR-..., NFR-...).

# Devices
Myseed students' phones: a 2 GB Android 8 phone, a 3 GB Android 10 phone, a recent Android phone; a tablet; Chrome on a laptop for the content manager.

# Networks
Wi-Fi, 4G, 3G, and offline.

# Test cases
TC-1 (FR-1): steps, expected result.
TC-2 (FR-2): ...

# Exit criteria
No open Must bugs; every Must requirement passed on every device.
`;

const RELEASE = `# Version
1.0.0 (date)

# New

# Improved

# Fixed

# Known issues

# Release checklist
- [ ] Every task in the release passed QA
- [ ] Version number and release notes updated
- [ ] Database changes applied and backed up
- [ ] Tested on the low-end phone
- [ ] Rollback plan ready
`;

const RUNBOOK = `# Service
What it is and who owns it.

# How to tell it is healthy

# Common problems and what to do
## Problem
Steps.

# How to deploy and roll back

# Contacts
`;

const POSTMORTEM = `# Summary
What happened, for how long, who was affected.

# Timeline
- time: event

# Root cause

# What went well

# What went badly

# Actions
- [ ] action, owner, due date
`;

export const DOC_TEMPLATES: { key: string; kind: DocKind; label: string; title: string; body: string }[] = [
  { key: "srs", kind: "srs", label: "SRS (IEEE 830 / ISO 29148 outline)", title: "Software requirements specification", body: SRS },
  { key: "srs_myseed", kind: "srs", label: "SRS for a Myseed learning feature", title: "Requirements: new learning feature", body: SRS_MYSEED },
  { key: "prd", kind: "prd", label: "Product brief", title: "Product brief", body: PRD },
  { key: "design", kind: "design", label: "Technical design (Myseed stack)", title: "Technical design", body: DESIGN },
  { key: "adr", kind: "adr", label: "Architecture decision record", title: "Decision record", body: ADR },
  { key: "testplan", kind: "testplan", label: "Test plan with Myseed's devices", title: "Test plan", body: TESTPLAN },
  { key: "release", kind: "release", label: "Release notes and checklist", title: "Release notes", body: RELEASE },
  { key: "runbook", kind: "runbook", label: "Runbook", title: "Runbook", body: RUNBOOK },
  { key: "postmortem", kind: "postmortem", label: "Postmortem", title: "Postmortem", body: POSTMORTEM },
  { key: "note", kind: "note", label: "Blank document", title: "Untitled document", body: "" },
];
