// The Claude (MCP) and ChatGPT operations on the person's documents, presentations, sheets and letters.
process.env.MAIL_FAKE = "1";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { OPERATIONS, runOperation } from "../../src/server/tools-api";
import { getFile } from "../../src/server/tools-data";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return "";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const me = (await loadUser((await upsertAccount({ name: "Writer", email: "writer@tools.local", title: "Staff", roles: ["sales"], password: "Tools-2026!xx", mustChangePassword: false })).id))!;
  const other = (await loadUser((await upsertAccount({ name: "Other", email: "other@tools.local", title: "Staff", roles: ["sales"], password: "Tools-2026!xx", mustChangePassword: false })).id))!;
  check("every operation has a description and an input schema", Object.values(OPERATIONS).every((o) => o.description.length > 20 && o.input.type === "object"));

  const made = (await runOperation(me, "create_document", {
    title: "Quarterly report",
    markdown: "# Introduction\n\nHello **team**.\n\n## Numbers\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n# Findings\n\nText.",
    contents: true,
    cover: { subtitle: "Q4", style: "band" },
    header: { left: "{company}", right: "{title}" },
    footer: { right: "Page {page} of {pages}" },
    main_starts_at_heading: "Introduction",
  })) as { id: string; url_path: string };
  check("create_document gives a link to open it", made.url_path === `/tools/docs?file=${made.id}`);
  const f = (await getFile(me, "doc", made.id)).data as { blocks: { type: string; id: string; text?: string }[]; layout: { source: string; cover: { style: string } | null; numbering: { mainStartsAt: string | null } } };
  check("the contents page comes first", f.blocks[0]?.type === "toc");
  check("the headings and table are kept", f.blocks.filter((b) => b.type === "heading").length === 3 && f.blocks.some((b) => b.type === "table"));
  check("the cover is set", f.layout.cover?.style === "band");
  check("the custom header and footer are used", f.layout.source === "custom");
  check("the main pages start at the heading", f.blocks.find((b) => b.id === f.layout.numbering.mainStartsAt)?.text === "Introduction");
  const read = (await runOperation(me, "read_document", { id: made.id })) as { markdown: string; layout: { cover: unknown } };
  check("read_document gives Markdown back", read.markdown.includes("# Quarterly report") && read.markdown.includes("Findings") && !!read.layout.cover);
  await runOperation(me, "update_document", { id: made.id, append_markdown: "## Next steps\n\n- One\n- Two" });
  const again = (await runOperation(me, "read_document", { id: made.id })) as { markdown: string };
  check("update_document adds to the end", again.markdown.includes("Next steps") && again.markdown.includes("- Two"));
  check("a missing heading is reported", /No heading/.test(await throws(() => runOperation(me, "update_document", { id: made.id, main_starts_at_heading: "Nope" }))));
  check("someone else's document cannot be read", !!(await throws(() => runOperation(other, "read_document", { id: made.id }))));

  const deck = (await runOperation(me, "create_presentation", { title: "Plan", slides: [{ title: "Why", kind: "bullets", items: ["a", "b"] }, { title: "Costs", kind: "table", columns: ["Item", "ETB"], rows: [["x", "1"]] }, { title: "Thanks", kind: "closing", text: "Thank you" }] })) as { id: string; slides: number };
  check("create_presentation keeps every slide", deck.slides === 3, deck);
  const rd = (await runOperation(me, "read_presentation", { id: deck.id })) as { slides: { title: string }[] };
  check("read_presentation lists the slides", rd.slides.map((s) => s.title).join() === "Why,Costs,Thanks");

  const sh = (await runOperation(me, "create_sheet", { title: "Budget", sheets: [{ name: "Costs", rows: [["Item", "Cost"], ["Camera", 100], ["Total", "=SUM(B2:B2)"]] }] })) as { id: string };
  const rs = (await runOperation(me, "read_sheet", { id: sh.id })) as { sheets: { name: string; rows: string[][] }[] };
  check("create_sheet and read_sheet keep the cells and formulas", rs.sheets[0]?.name === "Costs" && rs.sheets[0]?.rows[2]?.[1] === "=SUM(B2:B2)", rs.sheets[0]);

  const letter = (await runOperation(me, "create_letter", { subject: "Request for equipment", body: "We ask for a camera.\n\nThank you.", recipient_name: "Procurement" })) as { id: string };
  const lf = (await getFile(me, "letter", letter.id)).data as { subject: string; signName: string };
  check("create_letter drafts on the letterhead with the sender", lf.subject === "Request for equipment" && lf.signName === "Writer");

  const list = (await runOperation(me, "list_files", { kind: "document" })) as { files: { id: string }[] };
  check("list_files finds the document", list.files.some((x) => x.id === made.id));
  check("list_files refuses an unknown kind", !!(await throws(() => runOperation(me, "list_files", { kind: "photos" }))));
  check("the person's own files only", ((await runOperation(other, "list_files", { kind: "document" })) as { files: unknown[] }).files.length === 0);
  void get;
  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  console.log("FAIL crashed");
  await closeDb().catch(() => {});
  process.exit(1);
});
