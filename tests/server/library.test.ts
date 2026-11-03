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
  check("as HTML", /<h1>Purpose<\/h1>/.test(html.data.toString()) && /<table>/.test(html.data.toString()));

  // Import.
  const fromWord = await L.importDocument(dev, "dev", { folderId: app, name: "Partner brief.docx", base64: docx.data.toString("base64") });
  const back = await get<{ title: string; body: string; kind: string; folder_id: string }>("SELECT title, body, kind, folder_id FROM dept_docs WHERE id = ?", fromWord);
  check("a Word file is imported as a document, headings and lists kept", back?.title === "Partner brief" && back.kind === "note" && back.folder_id === app && /^# |\n# |## Purpose|# Purpose/.test(back.body) && /- FR-1 Download a lesson|FR-1 Download a lesson/.test(back.body), back?.body.slice(0, 300));
  const fromMd = await L.importDocument(dev, "dev", { folderId: null, name: "notes.md", base64: Buffer.from("# Notes\n- one").toString("base64") });
  check("a Markdown file too", (await get<{ body: string }>("SELECT body FROM dept_docs WHERE id = ?", fromMd))?.body === "# Notes\n- one");
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
