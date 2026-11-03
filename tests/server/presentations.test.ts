// Phase 24: presentation templates (built in, made by Admin, imported from a PowerPoint file), the default one,
// hand-written slides kept in a saved deck and in a share link, and what the deck page hands the player.
process.env.MAIL_FAKE = "1";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as T from "../../src/server/deck-templates";
import * as D from "../../src/server/decks";
import { deckPage } from "../../src/server/deck-page";
import { cleanCustomSlide } from "../../src/lib/deck";
import { BUILT_IN_TEMPLATES, cleanTemplate } from "../../src/lib/deck-templates";

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
  const dev = (await loadUser((await upsertAccount({ name: "Deck Dev", email: "deckdev@pres.local", title: "Dev", roles: ["developer"], password: "Present-2026!", mustChangePassword: false })).id))!;

  // Built in, and the default.
  const l0 = await T.listTemplates();
  check("built-in templates: Myseed, dark, International, Ocean, Sunrise", ["myseed", "myseed-dark", "international", "ocean", "sunrise"].every((id) => l0.templates.some((t) => t.id === id)));
  check("Myseed is the default", l0.defaultId === "myseed");
  check("a template is cleaned (bad colours fall back, chart colours kept)", (() => {
    const c = cleanTemplate({ name: "X", colors: { primary: "red", secondary: "#00ff00", chart: ["#111111", "#222222", "#333333"] } as never }, BUILT_IN_TEMPLATES[0]);
    return c.colors.primary === BUILT_IN_TEMPLATES[0]!.colors.primary && c.colors.secondary === "#00FF00" && c.colors.chart.length === 3;
  })());

  // Made by Admin.
  check("only Admin manages templates", /Only Admin/.test((await throws(() => T.saveTemplate(dev, { name: "Mine" }))) ?? ""));
  const id = await T.saveTemplate(admin, { name: "Board meeting", basedOn: "international", colors: { ...BUILT_IN_TEMPLATES[2]!.colors, primary: "#123456" }, footer: "Myseed PLC" });
  const own = (await T.listTemplates()).templates.find((t) => t.id === id);
  check("Admin saves an own template from a built-in one", own?.colors.primary === "#123456" && own.fonts.body === "Calibri" && own.footer === "Myseed PLC" && own.source === "custom", own);
  const copyId = await T.saveTemplate(admin, { id: "myseed", name: "Myseed changed" });
  check("editing a built-in one saves a copy", copyId !== "myseed" && (await T.listTemplates()).templates.find((t) => t.id === "myseed")!.name === "Myseed");
  await T.setDefaultTemplate(admin, id);
  check("Admin sets the default", (await T.listTemplates()).defaultId === id);
  check("built-in ones cannot be deleted", /stay/.test((await throws(() => T.deleteTemplate(admin, "myseed"))) ?? ""));

  // Imported from PowerPoint: a real .pptx made with pptxgenjs (its theme is Office's).
  const Pptx = (await import("pptxgenjs")).default;
  const p = new Pptx();
  p.theme = { headFontFace: "Arial Black", bodyFontFace: "Verdana" };
  p.addSlide().addText("Hello", { x: 1, y: 1, w: 4, h: 1 });
  const buf = (await p.write({ outputType: "nodebuffer" })) as Buffer;
  const theme = await T.readTheme("Partner deck.pptx", buf);
  check("the theme's colours are read", !!theme.colors.accent1 && !!theme.colors.dk1 && !!theme.colors.lt1 && Object.keys(theme.colors).length >= 10, theme.colors);
  const imp = await T.importTemplate(admin, "Partner deck.pptx", buf);
  const it = (await T.listTemplates()).templates.find((t) => t.id === imp.id)!;
  check("imported as a template: accent 1 is the main colour, the six accents colour the charts", it.colors.primary === theme.colors.accent1!.toUpperCase() && it.colors.chart.length === 6 && it.source === "imported" && it.importedFrom === "Partner deck.pptx", it);
  check("its fonts are kept", !!it.fonts.heading && !!it.fonts.body, it.fonts);
  check("a file that is not a presentation is refused", /not a PowerPoint/.test((await throws(() => T.importTemplate(admin, "x.pptx", Buffer.from("hello")))) ?? ""));
  check("other file types are refused", /\.pptx/.test((await throws(() => T.importTemplate(admin, "x.docx", buf))) ?? ""));
  await T.deleteTemplate(admin, id);
  check("deleting the default goes back to Myseed", (await T.listTemplates()).defaultId === "myseed");

  // Hand-written slides.
  check("a hand-written slide is cleaned", cleanCustomSlide({ title: "Plan", body: { kind: "bullets", items: ["One", "", "Two"] } })?.body.kind === "bullets" && (cleanCustomSlide({ title: "Plan", body: { kind: "bullets", items: ["One", "", "Two"] } })!.body as { items: string[] }).items.length === 2);
  check("a picture must be a picture", cleanCustomSlide({ body: { kind: "image", src: "javascript:alert(1)" } as never }) === null);
  check("an unknown kind is dropped", cleanCustomSlide({ body: { kind: "video" } as never }) === null);
  const custom = [
    { key: "custom:abc123", title: "Our plan", group: "x", say: "", body: { kind: "timeline" as const, items: [{ date: "Jan", label: "Start", done: true }, { date: "Mar", label: "Launch" }] } },
    { key: "custom:def456", title: "Thanks", group: "x", say: "", body: { kind: "closing" as const, text: "Thank you", contact: "info@myseed.et" } },
  ];
  const made = (await D.slidesFor(admin, "company")).slides;
  const deckId = await D.saveDeck(admin, { name: "Board", scope: "company", slides: [made[0]!.key, "custom:abc123", "custom:def456"], theme: { template: "international" }, custom });
  const deck = (await D.listDecks(admin, "company")).find((d) => d.id === deckId)!;
  check("a saved deck keeps its hand-written slides and template", deck.custom.length === 2 && deck.custom[0]!.body.kind === "timeline" && deck.theme.template === "international", deck);
  const pg = await deckPage(admin, "company", deckId);
  check("the deck page joins them to the made slides", pg.slides.some((s) => s.key === "custom:abc123") && pg.slides.some((s) => s.key === made[0]!.key));
  check("and hands the player the templates and the workspace", pg.templates.length >= 5 && pg.defaultTemplate === "myseed" && !!pg.workspace);
  const share = await D.createShare(admin, { scope: "company", name: "Board", slideKeys: ["custom:abc123", made[0]!.key], days: 3, theme: { template: "international" }, custom });
  const opened = await D.openShare(share.token);
  check("a share link carries hand-written slides and the template", !!opened && opened.slides.some((s) => s.key === "custom:abc123") && opened.theme.template === "international", opened?.slides.map((s) => s.key));

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
