// Project packs on the Roadmap: a full project and a sub-project generated from templates (phases as milestones,
// topics as tasks, documents with diagrams), the roadmap infographic and the portfolio picture, the project book
// (cover, control, contents, chapters, traceability), and draw.io diagrams (only the department, pictures checked).
import { all, get, closeDb, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import * as pk from "../../src/server/project-pack";
import * as dg from "../../src/server/diagrams";
import { PACK_DOCS, ROADMAP_TEMPLATES, packDocBody } from "../../src/lib/project-pack";
import { renderSpecBody } from "../../src/lib/spec-doc";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => fn().then(() => null, (e) => (e instanceof Error ? e.message : String(e)));

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@pk.local`, title: "Dev", roles: roles as never, password: "Project-Pack-2026!", mustChangePassword: false })).id))!;
  const lead = await mk("packlead", ["developer"]);
  const outsider = await mk("outsider", ["recording"]);
  await setPosition(admin, "dev", lead.id, "lead");

  // A full project from the web app template.
  const web = ROADMAP_TEMPLATES.find((t) => t.key === "web-app")!;
  const full = await pk.generatePack(lead, "dev", { project: { key: "SHUB", name: "SchoolHub", description: "A school management system.", startDate: "2026-12-01" }, type: "full", template: "web-app", roadmap: true, docs: true });
  check("phases become milestones", full.milestones === web.phases.length, full);
  check("topics become tasks", full.tasks === web.phases.reduce((n, p) => n + p.topics.length, 0), full);
  check("the full set of documents", full.docs === PACK_DOCS.full.length, full);
  const proj = (await get<{ meta: string; due_date: string | null; start_date: string | null }>("SELECT meta, due_date, start_date FROM dept_projects WHERE id = ?", full.projectId))!;
  check("the type and template are kept", JSON.parse(proj.meta).type === "full" && JSON.parse(proj.meta).template === "web-app");
  check("the dates follow the template", proj.start_date === "2026-12-01" && !!proj.due_date && proj.due_date > "2027-01-01", proj);
  const ms = await all<{ name: string; due_date: string }>("SELECT name, due_date FROM dept_milestones WHERE project_id = ? ORDER BY sort", full.projectId);
  check("phases in order with rising dates", ms[0]!.name === "Discovery" && ms.every((m, i) => i === 0 || m.due_date > ms[i - 1]!.due_date));
  const kinds = (await all<{ kind: string; body: string }>("SELECT kind, body FROM dept_docs WHERE project_id = ?", full.projectId));
  check("the design has class, sequence and data diagrams", /classDiagram/.test(kinds.find((k) => k.kind === "design")!.body) && /sequenceDiagram/.test(kinds.find((k) => k.kind === "design")!.body) && /erDiagram/.test(kinds.find((k) => k.kind === "design")!.body));
  check("the SRS has requirements and use cases", /FR-1/.test(kinds.find((k) => k.kind === "srs")!.body) && /Use cases/.test(kinds.find((k) => k.kind === "srs")!.body));
  check("generating again does not repeat the documents", (await pk.generatePack(lead, "dev", { projectId: full.projectId, type: "full", template: null, roadmap: false, docs: true })).docs === 0);

  // A sub-project needs its parent.
  check("a sub-project needs a parent", /parent/.test((await throws(() => pk.generatePack(lead, "dev", { project: { key: "SHQ", name: "Quiz" }, type: "sub", template: "learning-feature", roadmap: true, docs: true }))) ?? ""));
  const sub = await pk.generatePack(lead, "dev", { project: { key: "SHQ", name: "SchoolHub quizzes", parentId: full.projectId }, type: "sub", template: "learning-feature", roadmap: true, docs: true });
  check("the sub-project gets the lighter set", sub.docs === PACK_DOCS.sub.length && sub.milestones === 4);
  check("and sits under its parent", (await get<{ parent_id: string }>("SELECT parent_id FROM dept_projects WHERE id = ?", sub.projectId))?.parent_id === full.projectId);

  // The infographic.
  await run("UPDATE dept_tasks SET status = 'done', status_category = 'done' WHERE project_id = ? AND title IN ('Problem and goals', 'Users and personas')", full.projectId);
  const g = await pk.projectGraphic(lead, "dev", full.projectId);
  check("the infographic is an SVG with every phase", g.svg.startsWith("<svg") && web.phases.every((p) => g.svg.includes(p.name)));
  check("done topics are ticked", g.phases[0]!.topics.filter((t) => t.status === "done").length === 2);
  check("the sub-project's work counts in the parent", g.phases.some((p) => p.name === "Other work") || g.project.progress >= 0);
  const port = await pk.portfolioGraphic(lead, "dev");
  check("the portfolio shows both projects", port.includes("SHUB") && port.includes("SHQ"));
  check("someone outside Dev gets no infographic", !!(await throws(() => pk.projectGraphic(outsider, "dev", full.projectId))));

  // The book.
  const book = await pk.projectBook(lead, "dev", full.projectId);
  check("the book has a cover", book.html.includes("book-cover") && book.html.includes("SchoolHub"));
  check("document control and contents", book.html.includes('id="control"') && book.html.includes('id="contents"'));
  check("chapters in the IEEE order", ["Project management plan", "Software requirements", "Software design", "Testing"].every((t, i, arr) => i === 0 || book.html.indexOf(`<h1>${t}`) > book.html.indexOf(`<h1>${arr[i - 1]}`)));
  check("the roadmap is in the book", book.html.includes("<svg") && book.html.includes("Discovery"));
  check("the requirements traceability", book.html.includes("Requirements traceability") && book.html.includes("FR-1"));
  check("the sub-project's documents are in it", book.html.includes("SchoolHub quizzes: Feature specification"));
  check("mermaid blocks are marked to be drawn", book.html.includes("data-mermaid"));
  check("someone outside Dev cannot open the book", !!(await throws(() => pk.projectBook(outsider, "dev", full.projectId))));

  // draw.io diagrams.
  const d = await dg.createDiagram(lead, "dev", { title: "Classes", projectId: full.projectId, starter: "class" });
  check("a starter class diagram", d.xml.includes("mxGraphModel") && d.xml.includes("Project"));
  check("a picture that is not an SVG is refused", /not a diagram/.test((await throws(() => dg.saveDiagram(lead, d.id, { xml: d.xml, svg: "<html><script>x</script></html>" }))) ?? ""));
  await dg.saveDiagram(lead, d.id, { xml: d.xml, svg: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>').toString("base64")}` });
  check("the picture is saved from draw.io's export", (await dg.getDiagram(lead, d.id)).svg.startsWith("<svg"));
  check("someone outside Dev cannot see it", !!(await throws(() => dg.getDiagram(outsider, d.id))));
  const html = renderSpecBody(`![Classes](/api/diagrams/${d.id})`).html;
  check("a draw.io picture in a document can be edited", html.includes(`data-drawio="${d.id}"`));
  check("the plan's Gantt is valid Mermaid text", /gantt[\s\S]*:p0, 2026-12-01, 14d[\s\S]*:p1, after p0/.test(packDocBody("plan", { name: "X", key: "X", type: "full", start: "2026-12-01", template: web })));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}
main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
