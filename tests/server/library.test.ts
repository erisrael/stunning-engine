// Phase 26: the department document library. Folders in folders (no loops, no twins), documents and files in them,
// moving, search through text and names, pins, duplicates, importing Word and Markdown as documents, exporting as
// Word, Markdown and HTML (opened and read), and removing a folder without losing what is in it.
process.env.MAIL_FAKE = "1";
import JSZip from "jszip";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { createDoc, saveDoc } from "../../src/server/dev-studio";
import * as L from "../../src/server/dev-library";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@lib.local`, title: "Dev", roles: roles as never, password: "Library-2026!", mustChangePassword: false })).id))!;
  const dev = await mk("libdev", ["developer"]);
  const dev2 = await mk("libdev2", ["developer"]);
  const outsider = await mk("libmkt", ["marketing"]);
  await setPosition(admin, "dev", dev.id, "member");
  await setPosition(admin, "dev", dev2.id, "member");

  // Folders.
  const app = await L.saveFolder(dev, "dev", { name: "Mobile app" });
  const specs = await L.saveFolder(dev, "dev", { name: "Specs", parentId: app });
  check("folders inside folders", (await L.library(dev, "dev", specs)).path.map((p) => p.name).join("/") === "Mobile app/Specs");
  check("no two folders with the same name in one place", /already a folder/.test((await throws(() => L.saveFolder(dev, "dev", { name: "Mobile app" }))) ?? ""));
  check("a folder cannot go inside itself", /inside itself/.test((await throws(() => L.saveFolder(dev, "dev", { id: app, name: "Mobile app", parentId: specs }))) ?? ""));
  check("people outside the department cannot open it", /access/.test((await throws(() => L.library(outsider, "dev", null))) ?? ""));

  // Documents in folders.
  const docId = await createDoc(dev, "dev", { kind: "srs", template: "srs", folderId: specs });
  await saveDoc(dev, "dev", docId, { title: "Offline lessons", body: "# Purpose\nStudents download lessons to watch offline.\n- FR-1 Download a lesson\n- FR-2 Watch without internet\n\n| Phone | Tested |\n|---|---|\n| Tecno Spark | yes |\n\n**Bold** and `code`." });
  let lib = await L.library(dev, "dev", specs);
  check("a document is made in the open folder", lib.docs.some((d) => d.id === docId && d.title === "Offline lessons"));
  check("the top shows the folder, not the document", (await L.library(dev, "dev", null)).subfolders.some((f) => f.name === "Mobile app") && !(await L.library(dev, "dev", null)).docs.some((d) => d.id === docId));

  // Files.
  const fileId = await L.uploadFile(dev, "dev", { folderId: specs, name: "wireframe.png", mime: "image/png", base64: Buffer.from("png-bytes").toString("base64") });
  lib = await L.library(dev, "dev", specs);
  check("files are added to a folder", lib.files.some((f) => f.id === fileId && f.size > 0));
  check("and read back", (await L.readFile(dev, fileId))?.data.toString() === "png-bytes");
  check("only people in the department read them", /access/.test((await throws(() => L.readFile(outsider, fileId))) ?? ""));
  await L.renameFile(dev, "dev", fileId, "home-wireframe.png");
  check("a file is renamed", (await L.library(dev, "dev", specs)).files[0]!.name === "home-wireframe.png");
  await L.moveItem(dev, "dev", { kind: "file", id: fileId, folderId: app });
  check("and moved", (await L.library(dev, "dev", app)).files.some((f) => f.id === fileId));
  check("another member cannot delete it", /Only whoever added it/.test((await throws(() => L.deleteFile(dev2, "dev", fileId))) ?? ""));

  // Search, pins, duplicates.
  const s = await L.searchLibrary(dev, "dev", "without internet");
  check("search finds text inside documents", s.docs.some((d) => d.id === docId && /without internet/.test(d.snippet ?? "")), s);
  check("and file and folder names", (await L.searchLibrary(dev, "dev", "wireframe")).files.length === 1 && (await L.searchLibrary(dev, "dev", "spec")).folders.length === 1);
  check("a document is pinned", (await L.togglePin(dev, "dev", docId)) === true && (await L.library(dev, "dev", null)).pins.some((p) => p.id === docId));
  check("pins are each person's own", !(await L.library(dev2, "dev", null)).pins.length);
  const copy = await L.duplicateDoc(dev, "dev", docId);
  check("a document is duplicated in the same folder", (await L.library(dev, "dev", specs)).docs.some((d) => d.id === copy && d.title === "Offline lessons (copy)"));

  // Export.
  const docx = await L.exportDoc(dev, "dev", docId, "docx");
  const xml = await (await JSZip.loadAsync(docx.data)).file("word/document.xml")!.async("string");
  check("exported as Word with its headings, lists and table", docx.name === "Offline lessons.docx" && /Purpose/.test(xml) && /Download a lesson/.test(xml) && /Tecno Spark/.test(xml) && /<w:tbl>/.test(xml));
  const md = await L.exportDoc(dev, "dev", docId, "md");
  check("as Markdown", md.name.endsWith(".md") && md.data.toString().startsWith("# Offline lessons"));
  const html = await L.exportDoc(dev, "dev", docId, "html");
  check("as HTML, the formatted company document", /<h1 id="spec-purpose">Purpose<\/h1>/.test(html.data.toString()) && /<table>/.test(html.data.toString()) && /class="spec-doc spec-print"/.test(html.data.toString()) && /DEV-SRS-/.test(html.data.toString()));
  const footer = await (await JSZip.loadAsync(docx.data)).file("word/footer1.xml")?.async("string");
  check("Word has the document control table and page numbers", /DEV-SRS-/.test(xml) && /PAGE/.test(footer ?? ""), footer?.slice(0, 200));

  // Import.
  const fromWord = await L.importDocument(dev, "dev", { folderId: app, name: "Partner brief.docx", base64: docx.data.toString("base64") });
  const back = await get<{ title: string; body: string; kind: string; folder_id: string }>("SELECT title, body, kind, folder_id FROM dept_docs WHERE id = ?", fromWord);
  check("a Word file is imported as a document, headings and lists kept", back?.title === "Partner brief" && back.kind === "note" && back.folder_id === app && /^# |\n# |## Purpose|# Purpose/.test(back.body) && /- FR-1 Download a lesson|FR-1 Download a lesson/.test(back.body), back?.body.slice(0, 300));
  const fromMd = await L.importDocument(dev, "dev", { folderId: null, name: "notes.md", base64: Buffer.from("# Notes\n- one").toString("base64") });
  check("a Markdown file too", (await get<{ body: string }>("SELECT body FROM dept_docs WHERE id = ?", fromMd))?.body === "# Notes\n- one");
  check("a single first-line heading names an imported Markdown file", (await get<{ title: string }>("SELECT title FROM dept_docs WHERE id = ?", fromMd))?.title === "Notes");
  const planMd = "---\ntitle: Release plan\n---\n# Heading\n\n| A | B |\n|---|---|\n| <b>x</b> | `y` |\n\n- [ ] task\r\n";
  const kept = await L.importDocument(dev, "dev", { folderId: null, name: "plan.md", base64: Buffer.from(`﻿${planMd}`).toString("base64") });
  const keptRow = await get<{ title: string; body: string }>("SELECT title, body FROM dept_docs WHERE id = ?", kept);
  check("imported Markdown is stored exactly as the file, titled from its front matter", keptRow?.title === "Release plan" && keptRow.body === planMd.replace(/\r\n/g, "\n"), keptRow);
  check("a document too long is refused, not cut", /hold up to/.test((await throws(() => L.importDocument(dev, "dev", { folderId: null, name: "big.md", base64: Buffer.from("x".repeat(1_000_001)).toString("base64") }))) ?? ""));
  check("and so is saving one", /hold up to/.test((await throws(() => saveDoc(dev, "dev", kept, { title: "Big", body: "x".repeat(1_000_001) }))) ?? ""));
  check("a Word table comes in as a Markdown table, and bold stays bold", /\| Phone \| Tested \|\n\| --- \| --- \|\n\| Tecno Spark \| yes \|/.test(back!.body) && /\*\*Bold\*\*/.test(back!.body), back?.body.slice(0, 600));
  const web = await L.importDocument(dev, "dev", { folderId: null, name: "page.html", base64: Buffer.from('<html><head><title>x</title></head><body><h2>Plan</h2><p>One <strong>two</strong> <a href="https://a.b">link</a></p><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><script>bad()</script></body></html>').toString("base64") });
  const webBody = (await get<{ body: string }>("SELECT body FROM dept_docs WHERE id = ?", web))!.body;
  check("a web page comes in as Markdown with its table and link, without scripts", /## Plan/.test(webBody) && /\*\*two\*\*/.test(webBody) && /\[link\]\(https:\/\/a\.b\)/.test(webBody) && /\| A \| B \|/.test(webBody) && !/bad\(\)/.test(webBody), webBody);
  await saveDoc(dev, "dev", docId, { title: "Offline lessons", body: "# Offline lessons\n\n## Purpose\ntext" });
  check("Markdown export does not repeat a title the text already starts with", (await L.exportDoc(dev, "dev", docId, "md")).data.toString() === "# Offline lessons\n\n## Purpose\ntext\n");
  check("other files are refused as documents", /Import a Word/.test((await throws(() => L.importDocument(dev, "dev", { folderId: null, name: "x.pdf", base64: "AAAA" }))) ?? ""));

  // Removing a folder keeps its contents.
  await L.deleteFolder(dev, "dev", specs);
  lib = await L.library(dev, "dev", app);
  check("removing a folder moves its documents up", lib.docs.some((d) => d.id === docId) && !lib.subfolders.some((f) => f.id === specs));

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
