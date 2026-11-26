// Office-level tools: spreadsheet formulas and workbooks (.xlsx in and out), the document model (run styles,
// tables with formulas and merged cells, contents, columns), designs (cleaning, drawing), the letter library,
// per-person access to the tools, the design editor's options, the company signature and stamp on letters, and
// Correspondence's rules for signatures and stamps (uploaded stamps, required stamps, designs in letters).
process.env.MAIL_FAKE = "1";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { adjustRefs, computeSheet, computeTable, evaluate, formatValue, isErr, shiftFormula } from "../../src/lib/formula";
import { cleanBook, exportableFormula, fromTable, toBook } from "../../src/lib/sheet-book";
import { SHEET_TEMPLATES } from "../../src/lib/sheet-templates";
import { readWorkbook, writeWorkbook } from "../../src/server/workbook-xlsx";
import { blocksHtml, inlineHtml, parseInline } from "../../src/components/app/tools/doc-model";
import { cleanDesign, cleanDesignOptions, elementInner, pageHtml, pageSvg } from "../../src/lib/design";
import { designGallery, letterDesign } from "../../src/lib/design-templates";
import { fillLetter, LETTER_LIBRARY, STANDARD_LETTER_FIELDS } from "../../src/lib/letter-library";
import { saveToolsAccess, toolsConfig, toolsFor, designFor } from "../../src/server/tools";
import * as S from "../../src/server/corr/setup";
import * as Doc from "../../src/server/corr/documents";
import * as G from "../../src/server/corr/signing";
import { issueReadiness } from "../../src/server/corr/workflow";

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
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function main() {
  // --- Formulas ---
  const g = [["Item", "Qty", "Price"], ["a", "2", "10"], ["b", "3", "2.5"], ["c", "x", "4"]];
  check("SUM skips text in a range", evaluate("=SUM(B2:B4)", g) === 5);
  check("SUMPRODUCT", evaluate("=SUMPRODUCT(B2:B3,C2:C3)", g) === 27.5);
  check("VLOOKUP exact", evaluate('=VLOOKUP("b",A2:C4,3,FALSE)', g) === 2.5);
  check("XLOOKUP with a fallback", evaluate('=XLOOKUP("z",A2:A4,C2:C4,"none")', g) === "none");
  check("SUMIFS and COUNTIF with criteria", evaluate('=SUMIF(A2:A4,"b",C2:C4)', g) === 2.5 && evaluate('=COUNTIF(A2:A4,"<>b")', g) === 2 && evaluate('=COUNTIF(B:B,">1")', g) === 2);
  check("IF, AND, text joining", evaluate('=IF(AND(B2>1,C2=10),"yes","no")', g) === "yes" && evaluate('=A2&"-"&A3', g) === "a-b");
  check("powers go left to right as in Excel", evaluate("=2^3^2") === 64 && evaluate("=-2^2") === 4);
  check("errors as in Excel", (evaluate("=1/0") as { error: string }).error === "#DIV/0!" && (evaluate("=NOPE(1)") as { error: string }).error === "#NAME?" && (evaluate("=SUM(") as { error: string }).error === "#ERROR!");
  check("IFERROR catches", evaluate('=IFERROR(1/0,"oops")') === "oops");
  check("dates: DATE, YEAR, TEXT", evaluate("=YEAR(DATE(2026,11,27))") === 2026 && evaluate('=TEXT(0.256,"0.0%")') === "25.6%");
  check("a loan payment (PMT)", Math.abs((evaluate("=PMT(0.01,12,1000)") as number) + 88.8488) < 0.001);
  const sheet = computeSheet([{ name: "S", cells: [["1", "=A1+1", "=B1*2"], ["=A2"]] }]);
  check("formulas refer to formulas; a self-reference is a cycle", sheet[0]![2] === 4 && isErr(sheet[1]![0]) && (sheet[1]![0] as { error: string }).error === "#CYCLE!");
  check("copying a formula moves relative references only", shiftFormula("=A1+$B$2+B$3+Sheet2!C4+SUM(A1:A3)", 2, 1) === "=B3+$B$2+C$3+Sheet2!D6+SUM(B3:B5)");
  check("inserting a row moves references below it", adjustRefs("=SUM(A1:A5)+B9", "row", 3, 1) === "=SUM(A1:A6)+B10");
  check("deleting a referenced row gives #REF!", adjustRefs("=A3+A1", "row", 2, -1).includes("#REF!"));
  check("currency format", formatValue(1234.5, { kind: "currency" }) === "ETB 1,234.50");
  check("Word-style table formulas", JSON.stringify(computeTable([["Item", "Cost"], ["a", "10"], ["b", "5.5"], ["Total", "=SUM(ABOVE)"]])[3]) === JSON.stringify(["Total", "15.5"]));

  // --- Workbooks ---
  check("old saved sheets open as workbooks", toBook({ name: "Old", headers: ["A", "B"], rows: [["1", "2"]] }).sheets[0]!.cells[1]![1] === "2");
  const dirty = cleanBook({ v: 2, sheets: [{ name: "Bad/Name*", cells: [["=1+1", "x\u0001"]], styles: { "0:0": { b: true, color: "javascript:x", fill: "#ff0000" }, junk: { b: true } } }] });
  check("a workbook from the browser is cleaned", dirty.sheets[0]!.name === "Bad Name" && dirty.sheets[0]!.cells[0]![1] === "x" && !dirty.sheets[0]!.styles["0:0"]!.color && dirty.sheets[0]!.styles["0:0"]!.fill === "#ff0000" && !("junk" in dirty.sheets[0]!.styles));
  check("only formulas Myseed knows are written as formulas", exportableFormula("=SUM(A1:A3)") === "SUM(A1:A3)" && exportableFormula('=WEBSERVICE("http://x")') === null && exportableFormula('=CONCAT("SUM(",A1)') !== null);
  check("every sheet template works out without errors", SHEET_TEMPLATES.every((t) => t.book().sheets.every((sh, i, all) => computeSheet(all.map((x) => ({ name: x.name, cells: x.cells })), i).flat().every((v) => !isErr(v)))));
  const book = fromTable("Sales", ["Name", "Amount"], [["A", "10"], ["B", "20"], ["Total", "=SUM(B2:B3)"]]);
  book.sheets[0]!.styles["3:1"] = { b: true, fmt: { kind: "currency", decimals: 2, symbol: "ETB" }, fill: "#fff2cc" };
  book.sheets[0]!.merges = ["A5:B5"];
  book.sheets[0]!.cells.push(["Merged note", ""]);
  const buf = await writeWorkbook(book, "Sales");
  const back = await readWorkbook(buf as ArrayBuffer, "sales.xlsx");
  const s0 = back.sheets[0]!;
  check(".xlsx keeps formulas, styles, frozen header and merged cells", s0.cells[3]![1] === "=SUM(B2:B3)" && !!s0.styles["3:1"]?.b && s0.styles["3:1"]?.fill === "#fff2cc" && s0.styles["3:1"]?.fmt?.kind === "currency" && s0.freeze.rows === 1 && s0.merges.includes("A5:B5"), { cell: s0.cells[3], st: s0.styles["3:1"], fz: s0.freeze, m: s0.merges });

  // --- Documents ---
  const html = inlineHtml("{#c00000|red} {#1d4ed8;14pt;f:Georgia|blue} {bg#fff2cc|hl} H{sub|2}O x{sup|2} {caps|loud}");
  check("run styles: colour, size, font, highlight colour, sub and superscript, capitals", html.includes('<span style="color:#c00000">red</span>') && html.includes("font-size:14pt") && html.includes("background:#fff2cc") && html.includes("<sub>2</sub>") && html.includes("<sup>2</sup>") && html.includes("text-transform:uppercase"), html);
  check("a font name cannot break out of the style", !inlineHtml('{f:Georgia";x:y|t}').includes('";x'));
  check("nested marks still work", parseInline("**{#c00000|red bold}**").some((r) => r.bold && r.color === "#c00000"));
  const doc = blocksHtml([
    { id: "h1", type: "heading", level: 1, text: "Intro" },
    { id: "t", type: "toc", title: "Contents" },
    { id: "x", type: "table", header: true, rows: [["Item", "Cost"], ["a", "10"], ["Total", "=SUM(ABOVE)"], ["joined", "<"]], style: { headFill: "#0f172a", headColor: "#ffffff" } },
    { id: "c", type: "columns", left: "Left", right: "Right" },
    { id: "l", type: "list", ordered: true, style: "a", items: ["one"] },
    { id: "k", type: "list", ordered: false, style: "check", items: ["done", "todo"], checked: [true, false] },
  ]);
  check("contents link to the headings", doc.includes('href="#h-h1"') && doc.includes('id="h-h1"'));
  check("table formulas, header colours and merged cells", doc.includes('colspan="2"') && doc.includes("background:#0f172a"));
  check("table totals are worked out", /Total<\/td><td[^>]*>10</.test(doc));
  check("columns, lettered lists and checklists", doc.includes("grid-template-columns:1fr 1fr") && doc.includes('type="a"') && doc.includes('class="chk"') && doc.includes("✓"));

  // --- Designs ---
  const bad = cleanDesign({ w: 210, h: 297, pages: [{ bg: "red;x", elements: [{ kind: "image", src: "javascript:alert(1)" }, { kind: "text", text: "<script>x</script>", color: "url(x)", font: 'Arial"><script>', link: "javascript:x" }, { kind: "shape", shape: "star", fill: "#ff0000", gradient: "url(evil)" }, { kind: "nonsense" }] }] });
  const p0 = bad.pages[0]!;
  check("designs drop unsafe pictures, links, colours and fonts", p0.bg === "#ffffff" && p0.elements.length === 2 && p0.elements[0]!.kind === "text" && (p0.elements[0] as { link: string | null }).link === null && (p0.elements[0] as { font: string }).font === "Inter" && (p0.elements[1] as { gradient: string | null }).gradient === null);
  const drawn = pageHtml(bad, p0) + pageSvg(bad, p0);
  check("text in designs is escaped", !drawn.includes("<script>") && drawn.includes("&lt;script&gt;"));
  const brand = { company: "Myseed PLC", primary: "#16a34a", accent: "#0f172a", hasLogo: true, address: "Addis Ababa" };
  const ld = letterDesign(brand, { ref: "MS/1", date: "1 Dec 2026", to: "Ato Bekele", subject: "Test", salutation: "Dear Sir,", body: "Hello", closing: "Regards,", signName: "A", signTitle: "CEO" });
  const lhParts = ld.pages[0]!.elements.filter((e) => e.name?.startsWith("Letterhead"));
  check("a letter design locks its letterhead parts and has signature and stamp places", lhParts.length >= 4 && lhParts.every((e) => e.locked) && ld.pages[0]!.elements.some((e) => e.kind === "slot" && e.slot === "signature") && ld.pages[0]!.elements.some((e) => e.kind === "slot" && e.slot === "stamp"));
  check("every gallery design is valid after cleaning", designGallery(brand).every((t) => cleanDesign(t.design()).pages.length === t.design().pages.length));
  check("signature and stamp places show the pictures given", elementInner({ id: "aaaa1", kind: "slot", slot: "signature", x: 0, y: 0, w: 40, h: 15, rotate: 0, opacity: 1 }, {}, { signature: PNG }).includes(PNG));
  check("design options are cleaned", cleanDesignOptions({ maxUploadKb: 999999, fonts: ["Inter", "Evil<font>"], palette: ["#000000", "red"] }).maxUploadKb === 3000);

  // --- Letter library ---
  check("the library has every common kind of letter", LETTER_LIBRARY.length >= 50 && ["offer", "warning1", "termination", "experience", "payment_reminder", "rfq", "ministry_application", "invitation", "memo", "complaint_response", "breach", "certificate", "am_general"].every((k) => LETTER_LIBRARY.some((t) => t.key === k)));
  const undefinedFields = LETTER_LIBRARY.flatMap((t) => [...`${t.subject} ${t.salutation} ${t.body}`.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map((m) => m[1]!).filter((k) => !STANDARD_LETTER_FIELDS.includes(k) && !t.fields.some((f) => f.key === k)).map((k) => `${t.key}:${k}`));
  check("every {{field}} a template uses is asked for or standard", undefinedFields.length === 0, undefinedFields);
  check("template keys are unique", new Set(LETTER_LIBRARY.map((t) => t.key)).size === LETTER_LIBRARY.length);
  check("fields fill and gaps stay visible", fillLetter("Dear {{employee_name}}, {{missing}}", { employee_name: "Abebe" }) === "Dear Abebe, {{missing}}");
  const cats = (await S.listCategories()).map((c) => c.code);
  check("every template's category exists in Correspondence", LETTER_LIBRARY.every((t) => !t.category || cats.includes(t.category)), LETTER_LIBRARY.filter((t) => t.category && !cats.includes(t.category)).map((t) => t.key));

  // --- Per-person access ---
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@office.local`, title: "Staff", roles: roles as never, password: "Office-2026!xx", mustChangePassword: false })).id))!;
  const ana = await mk("office-ana", ["manager"]);
  const ben = await mk("office-ben", ["manager"]);
  const cfg = await toolsConfig();
  await saveToolsAccess(admin, { enabled: true, apps: { ...cfg.apps, sheets: { on: true, roles: ["finance"], users: [ana.id], blocked: [] }, letters: { on: true, roles: [], users: [], blocked: [ben.id] } }, features: { ...cfg.features, notion: { on: true, roles: ["finance"], users: [ben.id], blocked: [] } } });
  const ta = await toolsFor(ana);
  const tb = await toolsFor(ben);
  check("a person named by Admin gets an app their role does not", ta.apps.some((a) => a.key === "sheets") && !tb.apps.some((a) => a.key === "sheets"));
  check("a person left out does not get an app everyone else has", ta.apps.some((a) => a.key === "letters") && !tb.apps.some((a) => a.key === "letters"));
  check("connections are given to people too (each connects their own)", tb.features.includes("notion") && !ta.features.includes("notion"));
  check("only Admin sets access", !!(await throws(() => saveToolsAccess(ana, { enabled: false }))));
  check("people named must be real accounts", (await toolsConfig()).apps.sheets.users.every((u) => u === ana.id));

  // --- Design editor options ---
  await saveToolsAccess(admin, { design: { ...cfg.design, surfaces: { letters: true, decks: false, correspondence: true }, who: { on: true, roles: [], users: [], blocked: [ben.id] }, allowUploads: false } });
  check("the design editor follows Admin's surfaces and people", !!(await designFor(ana, "letters")) && !(await designFor(ana, "decks")) && !(await designFor(ben, "letters")));
  check("the options reach the editor", (await designFor(ana, "letters"))?.allowUploads === false);

  // --- Company signature and stamp on letters ---
  await saveToolsAccess(admin, { seal: { signature: PNG, stamp: PNG, use: "optional", who: { on: true, roles: [], users: [], blocked: [ben.id] }, templates: ["offer"], required: ["experience"] } });
  const sa = (await toolsFor(ana)).seal;
  check("allowed writers get the signature and stamp with the rules", !!sa?.signature && !!sa?.stamp && sa.use === "optional" && sa.templates.includes("offer") && sa.required.includes("experience"));
  check("people left out never receive the pictures", (await toolsFor(ben)).seal === null);
  check("a seal that is not a picture is refused", !!(await throws(() => saveToolsAccess(admin, { seal: { signature: "data:text/html;base64,PGI+" } }))));

  // --- Correspondence: rules for signatures and stamps ---
  check("only administrators set the signing rules", !!(await throws(() => G.saveSignPolicy(ana, { allowUpload: true }))));
  await G.saveSignPolicy(admin, { ...G.DEFAULT_SIGN_POLICY, allowDrawn: false, stampPlacement: "beside-signature", stampRequired: ["GEN"] });
  check("the rules are saved", (await G.signPolicy()).stampPlacement === "beside-signature" && (await G.signPolicy()).allowDrawn === false);
  check("drawing a signature can be switched off", !!(await throws(() => G.registerSignature(admin, { image: PNG, kind: "drawn" }))) && !(await throws(() => G.registerSignature(admin, { image: PNG, kind: "upload" }))));
  const sid = await G.saveStamp(admin, { name: "Real seal", kind: "custom", design: { text: "", color: "#1d4ed8", border: 2, size: 38, rotation: 0, opacity: 0.9, showDate: false }, allowed: { users: [admin.id] }, upload: PNG });
  check("a stamp can be an uploaded picture, used as it is", (await G.listStamps()).find((x) => x.id === sid)?.image === PNG && (await G.stampAllowed(admin, sid)).image === PNG);
  check("an uploaded stamp must be a picture", !!(await throws(() => G.saveStamp(admin, { name: "Bad", kind: "custom", design: { text: "", color: "#1d4ed8", border: 2, size: 38, rotation: 0, opacity: 0.9, showDate: false }, allowed: {}, upload: "data:image/svg+xml;base64,PHN2Zz4=" }))));
  const gen = (await S.listCategories()).find((c) => c.code === "GEN")!;
  const id = await Doc.createDraft(admin, { categoryId: gen.id });
  await Doc.saveDraft(admin, id, { subject: "Designed", data: { salutation: "Dear Sir,", blocks: [], libraryKey: "thanks", design: { ...ld, pages: [{ ...ld.pages[0]!, elements: [...ld.pages[0]!.elements, { kind: "image", src: "javascript:x" }] }] } }, recipients: [{ kind: "to", name: "Ato Bekele" }] });
  const saved = await Doc.getDoc(admin, id);
  const sd = (saved.data as { design?: { pages: { elements: unknown[] }[] }; libraryKey?: string });
  check("a letter keeps its design (cleaned) and its template", !!sd.design && sd.design.pages[0]!.elements.length === ld.pages[0]!.elements.length && sd.libraryKey === "thanks");
  const ready = await issueReadiness(id);
  check("a category Admin listed cannot be issued without a stamp", !ready.ok && /stamp/i.test(ready.reason ?? ""), ready);
  await G.saveSignPolicy(admin, { ...G.DEFAULT_SIGN_POLICY });
  check("without that rule the same letter is ready", (await issueReadiness(id)).ok === true);

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
