// Project packs: a project's type (a full project or a sub-project of one), roadmap templates (phases and topics, the
// way roadmap.sh draws a path), and the documents each type starts with, written to the IEEE standards (29148 for
// requirements, 1016 for design, 829 for testing, 16326 for the project plan, 1063 for user documentation) with
// diagrams (Mermaid: context, use case, component, class, sequence, entity-relationship, state, deployment).
// Pure data and text: used by the server (src/server/project-pack.ts) and the Roadmap page.

export const PROJECT_TYPES = [
  { key: "full", label: "Full project", hint: "A product or system on its own: every document, the whole roadmap, the project book." },
  { key: "sub", label: "Sub-project", hint: "A part of a full project (a feature, a module, an integration): a lighter set, rolled up into its parent." },
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number]["key"];

export type RoadmapTopic = { title: string; optional?: boolean };
export type RoadmapPhase = { name: string; weeks: number; topics: RoadmapTopic[] };
export type RoadmapTemplate = { key: string; label: string; type: ProjectType; summary: string; phases: RoadmapPhase[] };

const t = (...titles: string[]): RoadmapTopic[] => titles.map((x) => (x.startsWith("?") ? { title: x.slice(1), optional: true } : { title: x }));

export const ROADMAP_TEMPLATES: RoadmapTemplate[] = [
  {
    key: "web-app",
    label: "Web application",
    type: "full",
    summary: "A web product from discovery to launch and operation (Next.js, Postgres, the VPS).",
    phases: [
      { name: "Discovery", weeks: 2, topics: t("Problem and goals", "Users and personas", "Competitor review", "Success measures (KPIs)", "Product brief approved") },
      { name: "Requirements", weeks: 2, topics: t("Use cases", "Functional requirements (FR)", "Non-functional requirements (NFR)", "Data requirements", "SRS reviewed and approved") },
      { name: "Design", weeks: 3, topics: t("Architecture and components", "Data model (ER)", "API design", "UI wireframes", "Security and privacy review", "?Accessibility review", "Design approved") },
      { name: "Build", weeks: 6, topics: t("Repository and CI", "Database and migrations", "Authentication and roles", "Core features", "Admin and settings", "?Offline and mobile", "Code review on every change") },
      { name: "Test", weeks: 2, topics: t("Unit and server tests", "Browser (end-to-end) tests", "Phone and low-bandwidth tests", "Load test", "Security test", "Acceptance by the owner") },
      { name: "Launch", weeks: 1, topics: t("Release notes", "Deploy to production", "Backups and restore checked", "Monitoring and alerts", "Training and user guide") },
      { name: "Operate and grow", weeks: 4, topics: t("Runbook", "Support and feedback", "Measure the KPIs", "?Postmortems", "Next roadmap") },
    ],
  },
  {
    key: "mobile-app",
    label: "Mobile app (Android)",
    type: "full",
    summary: "An Android app (or PWA) for students or staff, offline first, built for low-end phones.",
    phases: [
      { name: "Discovery", weeks: 2, topics: t("Who uses it and on which phones", "Goals and KPIs", "Product brief") },
      { name: "Requirements", weeks: 2, topics: t("Use cases", "Offline and sync rules", "Data budget per day", "SRS approved") },
      { name: "Design", weeks: 2, topics: t("Screens and navigation", "Data model", "Sync and conflict design", "Design approved") },
      { name: "Build", weeks: 6, topics: t("Project setup and signing", "Local storage", "Sync with the server", "Core screens", "Notifications", "?Payments (Chapa or Telebirr)") },
      { name: "Test", weeks: 2, topics: t("Tests on Myseed's test phones", "2G/3G and offline tests", "Battery and storage", "Acceptance") },
      { name: "Release", weeks: 1, topics: t("Play Store listing", "Staged rollout", "Crash reports", "Release notes") },
    ],
  },
  {
    key: "learning-feature",
    label: "Learning feature",
    type: "sub",
    summary: "A feature inside a learning product (a quiz, a lesson player, progress tracking).",
    phases: [
      { name: "Define", weeks: 1, topics: t("The learner's goal", "Curriculum fit (grade, subject)", "Feature spec (SRS)") },
      { name: "Design", weeks: 1, topics: t("Screens", "Data and API changes", "Design note approved") },
      { name: "Build", weeks: 3, topics: t("Server", "Screens", "Content loaded", "?Amharic and Afaan Oromo text") },
      { name: "Test and ship", weeks: 1, topics: t("Tests", "Teacher review", "Release notes", "Ship") },
    ],
  },
  {
    key: "integration",
    label: "Integration or API",
    type: "sub",
    summary: "Connecting to another system (payments, SMS, Telegram, a partner's API).",
    phases: [
      { name: "Define", weeks: 1, topics: t("What flows where", "Interface requirements (IR)", "Credentials and limits") },
      { name: "Design", weeks: 1, topics: t("Sequence of calls", "Errors and retries", "Decision record") },
      { name: "Build", weeks: 2, topics: t("Client and webhooks", "Logging", "Sandbox tests") },
      { name: "Go live", weeks: 1, topics: t("Production keys", "Monitoring", "Runbook") },
    ],
  },
  {
    key: "module",
    label: "Module of a system",
    type: "sub",
    summary: "One part of a bigger system (a page, a department's tools, a report).",
    phases: [
      { name: "Spec", weeks: 1, topics: t("Who uses it", "Requirements", "Permissions") },
      { name: "Build", weeks: 2, topics: t("Data", "Server", "Pages", "Exports") },
      { name: "Check", weeks: 1, topics: t("Tests", "Review with the team", "Release notes") },
    ],
  },
];

// The documents each type starts with (kind, title), in the project book's order.
export const PACK_DOCS: Record<ProjectType, { kind: string; title: string }[]> = {
  full: [
    { kind: "plan", title: "Project management plan" },
    { kind: "prd", title: "Product brief" },
    { kind: "srs", title: "Software requirements specification" },
    { kind: "design", title: "Software design description" },
    { kind: "adr", title: "Decision record: the stack" },
    { kind: "testplan", title: "Test plan" },
    { kind: "release", title: "Release notes" },
    { kind: "runbook", title: "Runbook" },
    { kind: "manual", title: "User guide" },
  ],
  sub: [
    { kind: "srs", title: "Feature specification" },
    { kind: "design", title: "Design note" },
    { kind: "testplan", title: "Test plan" },
    { kind: "release", title: "Release notes" },
  ],
};

// The IEEE standard each kind of document follows (shown on covers and in the book).
export const DOC_STANDARDS: Record<string, string> = {
  plan: "IEEE 16326 (project management plan)",
  srs: "ISO/IEC/IEEE 29148 (requirements, formerly IEEE 830)",
  prd: "ISO/IEC/IEEE 29148 (stakeholder needs)",
  design: "IEEE 1016 (software design description)",
  adr: "ISO/IEC/IEEE 42010 (architecture decisions)",
  testplan: "IEEE 829 / ISO/IEC/IEEE 29119-3 (test documentation)",
  release: "IEEE 828 (configuration and release)",
  runbook: "ISO/IEC 20000 (service operation)",
  postmortem: "ISO/IEC 20000 (incident review)",
  manual: "IEEE 1063 / ISO/IEC/IEEE 26514 (user documentation)",
  note: "",
};

// The book's chapters: which kinds go in each, in order.
export const BOOK_CHAPTERS: { key: string; title: string; kinds: string[]; intro: string }[] = [
  { key: "plan", title: "Project management plan", kinds: ["plan"], intro: "How the project is organised, scheduled and controlled (IEEE 16326)." },
  { key: "brief", title: "Product brief", kinds: ["prd"], intro: "The problem, the people it is for, and how success is measured." },
  { key: "srs", title: "Software requirements", kinds: ["srs"], intro: "What the system must do and how well (ISO/IEC/IEEE 29148)." },
  { key: "design", title: "Software design", kinds: ["design"], intro: "Architecture, components, classes, data and interactions (IEEE 1016)." },
  { key: "decisions", title: "Architecture decisions", kinds: ["adr"], intro: "The important choices, with their reasons and consequences." },
  { key: "test", title: "Testing", kinds: ["testplan"], intro: "How the system is verified and accepted (IEEE 829)." },
  { key: "release", title: "Releases", kinds: ["release"], intro: "What shipped, when, and how it is rolled back." },
  { key: "ops", title: "Operations", kinds: ["runbook", "postmortem"], intro: "Running the service and learning from incidents." },
  { key: "manual", title: "User guide", kinds: ["manual"], intro: "How people use it (IEEE 1063)." },
  { key: "other", title: "Other documents", kinds: ["note"], intro: "Notes, guides and imported documents." },
];

export type PackProject = { name: string; key: string; type: ProjectType; description?: string | null; parent?: string | null; lead?: string | null; start?: string | null; due?: string | null; template?: RoadmapTemplate | null };

const today = () => new Date().toISOString().slice(0, 10);
const slugClass = (s: string) => s.replace(/[^A-Za-z0-9]+/g, " ").trim().split(" ").map((w) => w[0]!.toUpperCase() + w.slice(1)).join("") || "System";

// A document's starting text for the project, with its diagrams.
export function packDocBody(kind: string, p: PackProject): string {
  const N = p.name;
  const C = slugClass(p.key || p.name);
  const scope = p.description?.trim() || `${N} (${p.key}) is ${p.type === "sub" ? `a part of ${p.parent ?? "its parent project"}` : "a project of Myseed"}.`;
  const phases = p.template?.phases ?? [];
  switch (kind) {
    case "plan":
      return `# 1. Overview
## 1.1 Purpose and scope
${scope}

## 1.2 Deliverables
- The working system and its source code
- The documents in this book: requirements, design, tests, releases, operations, user guide

# 2. Organisation
| Role | Person |
|---|---|
| Project lead | ${p.lead ?? "To be named"} |
| Developers | The Dev team |
| Owner (accepts the work) | To be named |

# 3. Schedule
${p.start ? `Start ${p.start}` : "Start date to be set"}${p.due ? `, finish ${p.due}` : ""}.

${phases.length ? `| Phase | Weeks | Topics |\n|---|---|---|\n${phases.map((ph) => `| ${ph.name} | ${ph.weeks} | ${ph.topics.map((x) => x.title).join(", ")} |`).join("\n")}` : "The roadmap (chapter Roadmap) lists the phases."}

\`\`\`mermaid
gantt
  title ${N} schedule
  dateFormat YYYY-MM-DD
${phases.length ? phases.map((ph, i) => `  ${ph.name.replace(/[:#;]/g, "")} :p${i}, ${i ? `after p${i - 1}` : (p.start ?? today())}, ${ph.weeks * 7}d`).join("\n") : `  Work :p0, ${p.start ?? today()}, 30d`}
\`\`\`

# 4. Risks
| Risk | Likelihood | Impact | What we do |
|---|---|---|---|
| Slow or no internet for users | High | High | Offline first, small pages |
| Key person unavailable | Medium | High | Documents and reviews, two people know each part |
| Scope grows | Medium | Medium | Changes go through the lead and the roadmap |

# 5. Monitoring and control
- Weekly progress on the Roadmap and Sprint pages
- Every change reviewed; releases recorded with notes
`;
    case "prd":
      return `# Problem
What is hard today, and for whom.

# Users
- Primary: ...
- Secondary: ...

# Goals and measures
| Goal | Measure | Target |
|---|---|---|
| ... | ... | ... |

# Scope
${scope}

# Out of scope
- ...

# User journey
\`\`\`mermaid
journey
  title Using ${N}
  section Start
    Open ${N}: 4: User
    Sign in: 3: User
  section Work
    Do the main task: 5: User
    See the result: 5: User
\`\`\`
`;
    case "srs":
      return `# 1. Introduction
## 1.1 Purpose
This document specifies the requirements of ${N} (${p.key}), following ISO/IEC/IEEE 29148.
## 1.2 Scope
${scope}
## 1.3 Definitions
| Term | Meaning |
|---|---|
| ${p.key} | ${N} |
## 1.4 References
- ISO/IEC/IEEE 29148:2018, Requirements engineering
${p.parent ? `- The parent project: ${p.parent}\n` : ""}
# 2. Overall description
## 2.1 Product perspective
\`\`\`mermaid
flowchart LR
  user([User]) -->|uses| sys[${N}]
  admin([Admin]) -->|configures| sys
  sys -->|stores| db[(Database)]
  sys -->|notifies| mail[[Email and Telegram]]
\`\`\`
## 2.2 Use cases
\`\`\`mermaid
flowchart LR
  user([User])
  admin([Admin])
  subgraph ${C}[${N}]
    uc1((Sign in))
    uc2((Do the main task))
    uc3((See reports))
    uc4((Configure))
  end
  user --- uc1 & uc2 & uc3
  admin --- uc4 & uc3
\`\`\`
## 2.3 Users and characteristics
- ...
## 2.4 Constraints
- Works on low-end Android phones and slow connections
- Amharic and English text

# 3. Requirements
## 3.1 Functional
- FR-1: The system shall let a signed-in user ...
- FR-2: The system shall ...
- FR-3: The system shall keep a history of every change.
## 3.2 Non-functional
- NFR-1: Pages shall open within 2 seconds on a 3G connection.
- NFR-2: Only people with the right role shall see or change data.
- NFR-3: The service shall be available 99.5% of the time.
## 3.3 Interfaces
- IR-1: ...
## 3.4 Data
- DR-1: Personal data shall be kept only as long as needed.

# 4. Verification
Each requirement is verified by a test in the Test plan; the traceability matrix in the book links them to tasks.
`;
    case "design":
      return `# 1. Introduction
This software design description (IEEE 1016) shows how ${N} is built.

# 2. Context
\`\`\`mermaid
flowchart LR
  browser[Browser or phone] -->|HTTPS| caddy[Caddy]
  caddy --> app[${N} app, Next.js]
  app --> pg[(PostgreSQL)]
  app --> files[(Files)]
\`\`\`

# 3. Components
\`\`\`mermaid
flowchart TB
  subgraph UI[Pages]
    pages[Pages and forms]
  end
  subgraph Server[Server]
    actions[Server actions]
    api[API routes]
    domain[Domain logic]
  end
  db[(Database)]
  pages --> actions --> domain --> db
  api --> domain
\`\`\`

# 4. Classes
\`\`\`mermaid
classDiagram
  class ${C} {
    +string id
    +string name
    +string status
    +create()
    +update()
  }
  class User {
    +string id
    +string name
    +Role[] roles
    +can(capability) bool
  }
  class AuditEntry {
    +string action
    +string summary
    +datetime at
  }
  User "1" --> "*" ${C} : owns
  ${C} "1" --> "*" AuditEntry : history
\`\`\`

# 5. Data model
\`\`\`mermaid
erDiagram
  USERS ||--o{ ${p.key.toUpperCase()}_RECORDS : owns
  ${p.key.toUpperCase()}_RECORDS ||--o{ AUDIT : "is changed in"
  USERS {
    text id PK
    text name
  }
  ${p.key.toUpperCase()}_RECORDS {
    text id PK
    text owner_id FK
    text status
  }
\`\`\`

# 6. Interactions
\`\`\`mermaid
sequenceDiagram
  actor U as User
  participant P as Page
  participant S as Server
  participant D as Database
  U->>P: Fill in and save
  P->>S: Server action
  S->>S: Check permission
  S->>D: Write
  D-->>S: OK
  S-->>P: Saved
  P-->>U: Shows the change
\`\`\`

# 7. States
\`\`\`mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> InReview: submit
  InReview --> Approved: approve
  InReview --> Draft: send back
  Approved --> [*]
\`\`\`

# 8. Deployment
\`\`\`mermaid
flowchart LR
  subgraph VPS[VPS, Docker]
    c[Caddy] --> a[App]
    a --> p[(Postgres)]
  end
  internet((Internet)) --> c
\`\`\`

# 9. Security
- Every server action checks the person's permission
- Secrets only in the server's environment
`;
    case "adr":
      return `# Title
Use Next.js, PostgreSQL and a VPS for ${N}

# Status
Proposed

# Context
What forces the decision (team skills, cost, users' connections).

# Decision
We will ...

# Options considered
| Option | For | Against |
|---|---|---|
| ... | ... | ... |

# Consequences
- Good: ...
- Bad: ...
`;
    case "testplan":
      return `# 1. Test plan identifier
${p.key}-TP-1 (IEEE 829)

# 2. Scope
What is tested in ${N}, and what is not.

# 3. Approach
\`\`\`mermaid
flowchart LR
  unit[Server tests] --> e2e[Browser tests] --> phone[Phone tests] --> uat[Acceptance]
\`\`\`

# 4. Test cases
| ID | Requirement | Steps | Expected | Result |
|---|---|---|---|---|
| TC-1 | FR-1 | ... | ... | |
| TC-2 | NFR-1 | Open on 3G | Under 2 s | |

# 5. Environments
- Myseed's test phones (low-end Android, iPhone)
- Chrome and Firefox on Windows

# 6. Entry and exit criteria
- Exit: every test passes; no open critical bug

# 7. Defect flow
\`\`\`mermaid
stateDiagram-v2
  [*] --> Open
  Open --> Fixing
  Fixing --> Retest
  Retest --> Closed
  Retest --> Fixing: fails
\`\`\`
`;
    case "release":
      return `# Version
${p.key} 1.0.0 (${today()})

# What is new
- ...

# Fixed
- ...

# Known issues
- ...

# Rollback
How to go back to the previous version.
`;
    case "runbook":
      return `# Service
${N}

# Health
- /api/health answers 200
- Alerts go to the Dev team

# Common tasks
| Task | How |
|---|---|
| Restart | deploy.sh --restart |
| Roll back | deploy.sh --rollback |
| Restore a backup | deploy.sh --restore <file> |

# When it breaks
\`\`\`mermaid
flowchart TD
  a[Alert] --> b{Site answers?}
  b -- No --> c[Restart] --> d{Fixed?}
  d -- No --> e[Roll back]
  b -- Yes --> f[Check logs and the database]
\`\`\`
`;
    case "manual":
      return `# Getting started
How to open ${N} and sign in.

# Everyday tasks
1. ...
2. ...

# Questions
Who to ask, and where to send feedback.
`;
    default:
      return `# ${N}\n\n${scope}\n`;
  }
}
