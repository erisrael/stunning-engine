// Correspondence extras: the letter editor's formatting (escaped, safe links, footnotes), odd and even page layouts,
// entity letterheads (a branch inherits from its parent), text-message settings, and OCR (run when Tesseract is
// installed on the computer running the tests; otherwise its absence is reported clearly).
process.env.MAIL_FAKE = "1";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as S from "../../src/server/corr/setup";
import * as N from "../../src/server/corr/notify";
import { ocrBuffer, ocrHints, ocrStatus } from "../../src/server/corr/ocr";
import { blocksHtml, inlineHtml, parseInline } from "../../src/components/app/tools/doc-model";
import { cleanLayout } from "../../src/lib/corr-template";

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
  const writer = (await loadUser((await upsertAccount({ name: "ex", email: "ex@corr.local", title: "Staff", roles: ["manager"], password: "Extra-2026!xx", mustChangePassword: false })).id))!;

  // --- Formatting ---
  const html = inlineHtml("**bold** __under__ ~~old~~ ==mark== {#c00000|red} *it* <script>x</script>");
  check("formatting becomes the right tags", ["<strong>bold</strong>", "<u>under</u>", "<s>old</s>", "<mark>mark</mark>", 'style="color:#c00000"', "<em>it</em>"].every((t) => html.includes(t)), html);
  check("raw HTML in a letter is escaped, never run", html.includes("&lt;script&gt;") && !html.includes("<script>"));
  check("a safe link becomes a link", inlineHtml("[site](https://myseed.com.et)").includes('href="https://myseed.com.et"'));
  check("an unsafe link does not", !inlineHtml("[x](javascript:alert(1))").includes("href=") && !inlineHtml('[x](https://a.example/"onmouseover=1)').includes("onmouseover=1\""));
  const doc = blocksHtml([{ id: "a", type: "paragraph", text: "See the rules^[Regulation 12/2026] and the guide^[Guide, page 3]." }, { id: "b", type: "image", src: "javascript:x", width: 50, align: "center" }]);
  check("footnotes are numbered and listed at the end", doc.includes("<sup class=\"fn\">1</sup>") && doc.includes("<sup class=\"fn\">2</sup>") && doc.includes("<li>Regulation 12/2026</li>"));
  check("a picture that is not an image data URL is dropped", !doc.includes("javascript:"));
  check("nested formatting works", parseInline("**[link](https://a.example) text**").some((r) => r.bold && r.link));

  // --- Odd and even pages ---
  const l = cleanLayout({ oddEven: true, elements: [{ kind: "text", zone: "header-even", text: "Even" }, { kind: "text", zone: "nonsense", text: "x" }] });
  check("odd and even pages survive cleaning, unknown zones fall back to the page", l.oddEven === true && l.elements[0]!.zone === "header-even" && l.elements[1]!.zone === "page");

  // --- Entity letterheads ---
  const company = (await S.getEntity(null)) ?? (await S.listEntities())[0]!;
  const sub = await S.saveEntity(admin, { code: "SUBA", legalName: "Myseed Academy PLC", kind: "subsidiary", parentId: company.id, address: "Bole, Addis Ababa", letterhead: { primary: "#1d4ed8", tagline: "Learning for every child", footer: "Myseed Academy PLC · TIN 0000000000" } });
  const br = await S.saveEntity(admin, { code: "SUBA-HW", legalName: "Myseed Academy, Hawassa branch", kind: "branch", parentId: sub, letterhead: {} });
  const lhSub = await S.letterheadFor(sub);
  const lhBr = await S.letterheadFor(br);
  check("a subsidiary has its own name, colour, tagline and footer", lhSub.company === "Myseed Academy PLC" && lhSub.primary === "#1d4ed8" && lhSub.tagline === "Learning for every child");
  check("a branch without its own parts uses its parent's, with its own name", lhBr.company === "Myseed Academy, Hawassa branch" && lhBr.primary === "#1d4ed8" && lhBr.footer?.includes("TIN") === true);
  check("a bad entity logo is refused", !!(await throws(() => S.saveEntity(admin, { id: sub, code: "SUBA", legalName: "Myseed Academy PLC", letterhead: { logo: "data:text/html;base64,PHNjcmlwdD4=" } }))));

  // --- Text messages ---
  check("text messages are off until Admin switches them on", (await N.corrNotifyConfig()).smsApprovals === false && (await N.corrSms([writer.id], "x", "smsApprovals")) === 0);
  check("only administrators change them", !!(await throws(() => N.saveCorrNotifyConfig(writer, { smsApprovals: true, smsOverdue: true, smsDelivery: true }))));
  await N.saveCorrNotifyConfig(admin, { smsApprovals: true, smsOverdue: false, smsDelivery: true });
  check("the switches are saved", (await N.corrNotifyConfig()).smsApprovals === true && (await N.corrNotifyConfig()).smsOverdue === false);

  // --- OCR ---
  check("hints find a reference, subject and date", (() => {
    const h = ocrHints("Ref: MOE/123/26\nDate: 12/11/2026\nSubject: Content review request\nDear Sir");
    return h.ref === "MOE/123/26" && h.subject === "Content review request" && h.date === "12/11/2026";
  })());
  const st = await ocrStatus();
  if (st.available) {
    // A tiny picture of the word TEST is drawn as a PNG by hand is not practical here; read a text-free image and
    // expect no failure, which proves the program runs end to end.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    const r = await ocrBuffer(png, "image/png").catch((e) => ({ text: `ERR ${e instanceof Error ? e.message : e}`, lang: "", pages: 0 }));
    check(`OCR runs (${st.languages.join("+") || "eng"})`, !r.text.startsWith("ERR") && r.pages === 1, r);
  } else check("without Tesseract, OCR says it is not installed", !!(await throws(() => ocrBuffer(Buffer.from("x"), "image/png")))?.includes("not installed"));

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
