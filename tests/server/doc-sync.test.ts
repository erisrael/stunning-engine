// Phase 46: documents as formatted company documents, and the repository's documentation kept in the Dev library.
// The renderer keeps documents safe (raw HTML as text, no script links) and formats tasks, callouts, tables, IDs;
// the sync adds files as drafts in their folders, follows changed files, keeps edits made in the app, starts a new
// version for an approved document, never brings back a deleted one and reports bad entries. The project's own
// docs/library.json is checked too: every file there, short enough, and every link between them pointing at a file.
process.env.MAIL_FAKE = "1";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { decideDoc, deleteDoc, getDoc, saveDoc, submitDoc } from "../../src/server/dev-studio";
import { library } from "../../src/server/dev-library";
import { syncRepoDocs } from "../../src/server/doc-sync";
import { looksHardWrapped, markdownTitle, renderSpecBody, resolveRepoPath, specDocumentHtml, splitFrontMatter } from "../../src/lib/spec-doc";
import { DOC_KINDS, DOC_MAX_CHARS } from "../../src/lib/dev-docs";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};

async function main() {
  // --- The renderer -------------------------------------------------------------------------------------------
  const r = renderSpecBody(
    [
      "# Payments",
      "",
      "Intro <script>alert(1)</script> and <img src=x onerror=alert(1)>.",
      "",
      "FR-1 (Must): pay with Chapa",
      "FR-2 (Won't): cash",
      "",
      "- [x] done",
      "- [ ] open",
      "",
      "> [!WARNING]",
      "> Keys stay out of the repository.",
      "",
      "[bad](javascript:alert(1)) [web](https://example.com) [doc](RUNBOOK.md) [other](NOWHERE.md) ![x](javascript:x)",
      "",
      "| A | B |",
      "|---|---|",
      "| 1 | `a<b` |",
    ].join("\n"),
    { title: "Payments", linkTo: (h) => (h === "RUNBOOK.md" ? "/dev/docs?doc=doc_1" : null) },
  );
  check("raw HTML is shown as text, never run", !/<script|<img src=x/.test(r.html) && /&lt;script&gt;/.test(r.html), r.html.slice(0, 300));
  check("script links and images are dropped", !/javascript:/i.test(r.html));
  check("web links open in a new tab", /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/.test(r.html));
  check("links to other documents open them in the library", /href="\/dev\/docs\?doc=doc_1" data-doc-link/.test(r.html));
  check("links to unknown files are plain text", /<span class="spec-xref" title="NOWHERE.md">other<\/span>/.test(r.html));
  check("requirement IDs and priorities are marked", /<span class="spec-req">FR-1<\/span>/.test(r.html) && /spec-moscow-must/.test(r.html) && /spec-moscow-wont/.test(r.html));
  check("checklists, callouts and tables are formatted", /spec-check is-done/.test(r.html) && /spec-callout-warning/.test(r.html) && /<div class="spec-table"><table>/.test(r.html) && /<code>a&lt;b<\/code>/.test(r.html));
  check("a first-line title that repeats the document's title is not shown twice", !/<h1/.test(r.html));
  check("lines typed one under another stay on their own lines", /pay with Chapa<br>/.test(r.html));
  const wrapped = Array.from({ length: 8 }, () => "This README is wrapped at a fixed width so that every line ends before eighty").join("\n");
  check("Markdown wrapped at a fixed width is joined into paragraphs", looksHardWrapped(wrapped) && !looksHardWrapped("FR-1 (Must): a\n  Acceptance: b\nFR-2: c"));
  const toc = renderSpecBody("## One\n\n## Two\n\n## Two");
  check("headings get unique anchors for the contents", toc.headings.map((h) => h.id).join(",") === "one,two,two-2");
  check("front matter is read, not shown", splitFrontMatter("---\ntitle: Plan\nowner: Dev\n---\nBody").meta.owner === "Dev" && !renderSpecBody("---\ntitle: Plan\n---\nBody").html.includes("title:"));
  check("a document names itself from front matter or a single first-line heading", markdownTitle("---\ntitle: A\n---\n# B") === "A" && markdownTitle("# B\n\ntext") === "B" && markdownTitle("# 1. Intro\n\n# 2. Scope") === null && markdownTitle("text\n# B") === null);
  check("repository links resolve from the file's folder", resolveRepoPath("docs/dev-team/RULEBOOK.md", "../RUNBOOK.md#setup") === "docs/RUNBOOK.md" && resolveRepoPath("README.md", "docs/USERS.md") === "docs/USERS.md" && resolveRepoPath("docs/A.md", "https://x.y") === null);
  const page = specDocumentHtml({ workspace: "Myseed <HQ>", title: "Plan & scope", kindLabel: "Technical design", ref: "DEV-DESIGN-ABC123", version: 2, status: "approved", statusLabel: "Approved", body: "## Section\ntext" });
  check("the PDF page has the cover, document control, A4 and the escaped name", /class="spec-cover"/.test(page) && /DEV-DESIGN-ABC123/.test(page) && /size:A4/.test(page) && /Myseed &lt;HQ&gt;/.test(page) && /Plan &amp; scope/.test(page));

  // --- The sync -----------------------------------------------------------------------------------------------
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docsync-"));
  const write = (f: string, s: string) => (fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }), fs.writeFileSync(path.join(root, f), s));
  write("docs/a.md", "# Alpha guide\n\nFirst text. See [beta](b.md).\n");
  write("docs/b.md", "No heading here.\r\n");
  write(
    "docs/library.json",
    JSON.stringify({
      dept: "dev",
      documents: [
        { file: "docs/a.md", folder: "Project docs/Guides", kind: "runbook" },
        { file: "docs/b.md", folder: "Project docs", kind: "nonsense", title: "Beta notes" },
        { file: "docs/missing.md", folder: "Project docs" },
        { file: "../outside.md" },
        { file: "docs/a.txt" },
      ],
    }),
  );
  let s = await syncRepoDocs({ root });
  check("new files are added", s.added.join(",") === "docs/a.md,docs/b.md", s);
  check("bad entries are reported, not added", s.problems.length === 3 && s.problems.some((p) => /missing.md: not found/.test(p)) && s.problems.some((p) => /only Markdown/.test(p)), s.problems);
  const src = async (f: string) => (await get<{ doc_id: string }>("SELECT doc_id FROM dept_doc_sources WHERE dept = 'dev' AND source = ?", f))!.doc_id;
  const aId = await src("docs/a.md");
  const bId = await src("docs/b.md");
  const a = await get<{ title: string; body: string; kind: string; status: string; version: number; folder_id: string; created_by: string | null }>("SELECT title, body, kind, status, version, folder_id, created_by FROM dept_docs WHERE id = ?", aId);
  check("stored exactly as the file, as a draft, titled from its heading", a?.body === "# Alpha guide\n\nFirst text. See [beta](b.md).\n" && a.title === "Alpha guide" && a.kind === "runbook" && a.status === "draft" && a.version === 1 && a.created_by === null, a);
  const b = await get<{ title: string; body: string; kind: string }>("SELECT title, body, kind FROM dept_docs WHERE id = ?", bId);
  check("the list's title and an unknown kind as a note; line endings made \\n", b?.title === "Beta notes" && b.kind === "note" && b.body === "No heading here.\n", b);
  const top = await library(admin, "dev", null);
  const projectDocs = top.tree.find((f) => f.name === "Project docs" && !f.parentId);
  const guides = top.tree.find((f) => f.name === "Guides" && f.parentId === projectDocs?.id);
  check("folders are made as the list names them", !!projectDocs && !!guides && a?.folder_id === guides!.id);
  const inGuides = await library(admin, "dev", guides!.id);
  check("the library marks repository documents", inGuides.docs.some((d) => d.id === aId && d.source === "docs/a.md" && d.author === "Repository"));
  const view = await getDoc(admin, "dev", aId);
  check("the document knows its file and the other repository documents", view.source === "docs/a.md" && view.repoDocs["docs/b.md"] === bId && /^DEV-RUNBOOK-/.test(view.ref), { source: view.source, ref: view.ref });

  s = await syncRepoDocs({ root });
  check("running again changes nothing", !s.added.length && !s.updated.length && s.unchanged === 2, s);
  check("and adds no second copy", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_docs WHERE dept = 'dev' AND title = 'Alpha guide'"))?.n) === 1);

  write("docs/a.md", "# Alpha guide v2\n\nSecond text.\n");
  s = await syncRepoDocs({ root });
  const a2 = await get<{ title: string; body: string; version: number }>("SELECT title, body, version FROM dept_docs WHERE id = ?", aId);
  check("a changed file updates its draft document in place", s.updated.includes("docs/a.md") && !!a2?.body.includes("Second text") && a2.title === "Alpha guide v2" && a2.version === 1, a2);

  // Approved, then the file changes: a new version, the approved one kept.
  await submitDoc(admin, "dev", aId, [admin.id]);
  await decideDoc(admin, "dev", aId, true);
  write("docs/a.md", "# Alpha guide v2\n\nThird text.\n");
  s = await syncRepoDocs({ root });
  const a3 = await get<{ body: string; version: number; status: string }>("SELECT body, version, status FROM dept_docs WHERE id = ?", aId);
  const kept = await all<{ version: number; status: string }>("SELECT version, status FROM dept_doc_versions WHERE doc_id = ?", aId);
  check("an approved document gets a new version; the approved one stays in the history", a3?.version === 2 && a3.status === "draft" && a3.body.includes("Third text") && kept.some((v) => v.version === 1 && v.status === "approved"), { a3, kept });

  // Edited in the app: the file no longer replaces it.
  await saveDoc(admin, "dev", aId, { title: "Alpha guide v2", body: "Our own text." });
  write("docs/a.md", "# Alpha guide v2\n\nFourth text.\n");
  s = await syncRepoDocs({ root });
  check("a document edited in the app is kept", s.keptEdited.includes("docs/a.md") && (await get<{ body: string }>("SELECT body FROM dept_docs WHERE id = ?", aId))?.body === "Our own text.", s);
  write("docs/a.md", "# Alpha guide v2\n\nFifth text.\n");
  s = await syncRepoDocs({ root });
  check("and stays kept on later changes", s.keptEdited.includes("docs/a.md") && (await get<{ body: string }>("SELECT body FROM dept_docs WHERE id = ?", aId))?.body === "Our own text.");

  // Deleted in the app: not brought back.
  await deleteDoc(admin, "dev", bId);
  write("docs/b.md", "Changed after it was deleted.\n");
  s = await syncRepoDocs({ root });
  check("a deleted document is not brought back", !s.added.includes("docs/b.md") && !(await get("SELECT 1 AS x FROM dept_docs WHERE id = ?", bId)) && Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_docs WHERE title = 'Beta notes'"))?.n) === 0);
  check("the project's list shares the handbook with the whole department", (JSON.parse(fs.readFileSync("docs/library.json", "utf8")) as { shareWithTeam?: string[] }).shareWithTeam?.includes("Dev team handbook") === true);
  check("no manifest, nothing to do", (await syncRepoDocs({ root: path.join(root, "nowhere") })).added.length === 0);
  fs.rmSync(root, { recursive: true, force: true });

  // --- The project's own list ---------------------------------------------------------------------------------
  const manifest = JSON.parse(fs.readFileSync("docs/library.json", "utf8")) as { dept: string; documents: { file: string; folder: string; kind: string; title: string }[] };
  const files = manifest.documents.map((d) => d.file);
  check("docs/library.json: every file exists", files.every((f) => fs.existsSync(f)), files.filter((f) => !fs.existsSync(f)));
  check("every file fits in a document", files.every((f) => fs.readFileSync(f, "utf8").length <= DOC_MAX_CHARS));
  check("every entry has a folder, a known kind and a title, and no file twice", manifest.documents.every((d) => d.folder && d.title && DOC_KINDS.some((k) => k.key === d.kind)) && new Set(files).size === files.length);
  check("nothing from folders the server's build leaves out", !files.some((f) => /^(control-panel|data|backups|templates)\//.test(f)) && !files.includes("docs/DEV-TEAM-ASSESSMENT.md"));
  const broken: string[] = [];
  for (const f of files.filter((x) => /^docs\/(project|dev-team|projects)\//.test(x))) {
    // Examples inside code are not links.
    const text = fs.readFileSync(f, "utf8").replace(/^```[\s\S]*?^```/gm, "").replace(/`[^`\n]*`/g, "");
    for (const m of text.matchAll(/\]\(([^)\s]+\.md)(#[^)]*)?\)/g)) {
      const to = resolveRepoPath(f, m[1]!);
      if (!to || !fs.existsSync(to)) broken.push(`${f} -> ${m[1]}`);
    }
  }
  check("links between the new documents point at real files", broken.length === 0, broken);
  const index = fs.readFileSync("docs/project/INDEX.md", "utf8");
  // Myseed Ops' own documents are in its index; each other project has its own index in its folder.
  const own = files.filter((f) => !f.startsWith("docs/projects/"));
  check("the index lists every Myseed Ops document", own.every((f) => index.includes(`\`${f}\``)), own.filter((f) => !index.includes(`\`${f}\``)));
  const projectDirs = [...new Set(files.filter((f) => f.startsWith("docs/projects/")).map((f) => f.split("/")[2]!))];
  check("every other project brings its index, listed in the Myseed Ops index", projectDirs.length > 0 && projectDirs.every((d) => files.includes(`docs/projects/${d}/project/INDEX.md`) && index.includes(`../projects/${d}/project/INDEX.md`)), projectDirs);
  check("every other project's documents sit in its own library folder", manifest.documents.filter((d) => d.file.startsWith("docs/projects/")).every((d) => / documentation\/\d\. /.test(d.folder) && !d.folder.startsWith("Myseed Ops")));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
