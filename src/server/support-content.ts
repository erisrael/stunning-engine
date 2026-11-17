import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import type { AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { getMeta, setMeta } from "./settings";

// What the Telegram bot and the Mini App say (Update 1.2, Phase 5), in one versioned store (sup_content). Each item
// is a key in one language for one bot ('default', or a connected system's own bot, which falls back to 'default').
// It is edited as a draft and published; every publish is kept and can be restored. The bot reads only published,
// enabled text, so a change reaches customers without a deployment. Languages are open: English and Amharic are
// made at installation, any other code can be added as a translation.

export const CONTENT_KINDS = [
  ["welcome", "Welcome message"],
  ["command", "Bot command"],
  ["menu", "Main menu entry"],
  ["button", "Button label"],
  ["category", "Conversation topic"],
  ["faq", "FAQ entry"],
  ["reply", "Automated reply"],
  ["offline", "Offline message"],
  ["queue", "Queue message"],
  ["call", "Call notice"],
  ["policy", "Support policy"],
  ["terms", "Terms and privacy"],
  ["escalation", "Escalation message"],
  ["closing", "Closing message"],
] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number][0];
// What a menu entry or topic does when pressed.
export const CONTENT_ACTIONS = ["start", "requests", "history", "faq", "contact", "language", "category:", "url:"] as const;

type Def = { key: string; kind: ContentKind; en: string; am: string; action?: string; sort?: number; parent?: string };
// The installation defaults (spec 5.2), English and Amharic.
export const CONTENT_DEFAULTS: Def[] = [
  { key: "welcome", kind: "welcome", en: "Welcome to MySeed Support. How can we help you today?", am: "እንኳን ወደ ማይሲድ ድጋፍ በደህና መጡ። ዛሬ በምን ልንረዳዎ እንችላለን?" },
  { key: "menu.start", kind: "menu", action: "start", sort: 1, en: "Start a Conversation", am: "ውይይት ይጀምሩ" },
  { key: "menu.requests", kind: "menu", action: "requests", sort: 2, en: "My Support Requests", am: "የእኔ የድጋፍ ጥያቄዎች" },
  { key: "menu.history", kind: "menu", action: "history", sort: 3, en: "Previous Conversations", am: "ያለፉ ውይይቶች" },
  { key: "menu.faq", kind: "menu", action: "faq", sort: 4, en: "Frequently Asked Questions", am: "ተደጋግመው የሚጠየቁ ጥያቄዎች" },
  { key: "menu.account", kind: "menu", action: "category:account", sort: 5, en: "Account and Subscription Help", am: "የመለያ እና የደንበኝነት እርዳታ" },
  { key: "menu.payment", kind: "menu", action: "category:payments", sort: 6, en: "Payment Assistance", am: "የክፍያ እርዳታ" },
  { key: "menu.technical", kind: "menu", action: "category:app", sort: 7, en: "Technical Support", am: "የቴክኒክ ድጋፍ" },
  { key: "menu.contact", kind: "menu", action: "contact", sort: 8, en: "Contact Support", am: "ድጋፍን ያግኙ" },
  { key: "topic.account", kind: "category", action: "category:account", sort: 1, en: "Account and Login", am: "መለያ እና መግቢያ" },
  { key: "topic.learning", kind: "category", action: "category:app", sort: 2, en: "Learning and Educational Content", am: "ትምህርት እና የትምህርት ይዘት" },
  { key: "topic.subscription", kind: "category", action: "category:plans", sort: 3, en: "Subscription", am: "የደንበኝነት ምዝገባ" },
  { key: "topic.payments", kind: "category", action: "category:payments", sort: 4, en: "Payments and Billing", am: "ክፍያ እና ሂሳብ" },
  { key: "topic.technical", kind: "category", action: "category:app", sort: 5, en: "Technical Problems", am: "የቴክኒክ ችግሮች" },
  { key: "topic.school", kind: "category", action: "category:person", sort: 6, en: "School and Enrollment", am: "ትምህርት ቤት እና ምዝገባ" },
  { key: "topic.other", kind: "category", action: "category:person", sort: 7, en: "Other Inquiries", am: "ሌሎች ጥያቄዎች" },
  { key: "cmd.start", kind: "command", sort: 1, en: "Main menu", am: "ዋና ማውጫ" },
  { key: "cmd.requests", kind: "command", sort: 2, en: "My support requests", am: "የእኔ የድጋፍ ጥያቄዎች" },
  { key: "cmd.history", kind: "command", sort: 3, en: "Previous conversations", am: "ያለፉ ውይይቶች" },
  { key: "cmd.language", kind: "command", sort: 4, en: "Choose the language", am: "ቋንቋ ይምረጡ" },
  { key: "cmd.transfer", kind: "command", sort: 5, en: "Move my conversation to another topic", am: "ውይይቴን ወደ ሌላ ርዕስ አዛውር" },
  { key: "cmd.close", kind: "command", sort: 6, en: "Close my conversation", am: "ውይይቴን ዝጋ" },
  { key: "cmd.reopen", kind: "command", sort: 7, en: "Reopen my last conversation", am: "የመጨረሻ ውይይቴን እንደገና ክፈት" },
  { key: "cmd.phone", kind: "command", sort: 8, en: "Share my phone number", am: "ስልክ ቁጥሬን አጋራ" },
  { key: "button.menu", kind: "button", en: "« Menu", am: "« ማውጫ" },
  { key: "button.language", kind: "button", en: "Language · ቋንቋ", am: "Language · ቋንቋ" },
  { key: "button.transfer", kind: "button", en: "Change topic", am: "ርዕስ ቀይር" },
  { key: "button.close", kind: "button", en: "Close conversation", am: "ውይይቱን ዝጋ" },
  { key: "button.reopen", kind: "button", en: "Reopen", am: "እንደገና ክፈት" },
  { key: "button.open_app", kind: "button", en: "Open the support app", am: "የድጋፍ መተግበሪያውን ክፈት" },
  { key: "ask", kind: "reply", en: "Write your question in one message. Our team will answer here.", am: "ጥያቄዎን በአንድ መልዕክት ይጻፉ። ቡድናችን እዚሁ ይመልስልዎታል።" },
  { key: "thanks", kind: "reply", en: "Thank you. Your request is #{number}. We will answer here.", am: "እናመሰግናለን። የጥያቄዎ ቁጥር #{number} ነው። እዚሁ እንመልስልዎታለን።" },
  { key: "feedback.ask", kind: "reply", en: "Write your feedback in one message. It goes to our team.", am: "አስተያየትዎን በአንድ መልዕክት ይጻፉ። ለቡድናችን ይደርሳል።" },
  { key: "feedback.thanks", kind: "reply", en: "Thank you for your feedback.", am: "ስለ አስተያየትዎ እናመሰግናለን።" },
  { key: "language.choose", kind: "reply", en: "Choose your language.", am: "ቋንቋዎን ይምረጡ።" },
  { key: "language.saved", kind: "reply", en: "We will write to you in English.", am: "ከአሁን በኋላ በአማርኛ እንጽፍልዎታለን።" },
  { key: "topics.choose", kind: "reply", en: "What is your question about?", am: "ጥያቄዎ ስለ ምንድን ነው?" },
  { key: "requests.title", kind: "reply", en: "Your support requests:", am: "የእርስዎ የድጋፍ ጥያቄዎች፦" },
  { key: "requests.none", kind: "reply", en: "You have no open support requests.", am: "ክፍት የድጋፍ ጥያቄ የለዎትም።" },
  { key: "history.title", kind: "reply", en: "Your previous conversations:", am: "ያለፉ ውይይቶችዎ፦" },
  { key: "history.none", kind: "reply", en: "You have no previous conversations.", am: "ያለፈ ውይይት የለዎትም።" },
  { key: "faq.prompt", kind: "faq", en: "Type your question and we will look for answers.", am: "ጥያቄዎን ይጻፉ፤ መልስ እንፈልግልዎታለን።" },
  { key: "faq.results", kind: "faq", en: "These answers may help:", am: "እነዚህ መልሶች ሊረዱዎት ይችላሉ፦" },
  { key: "faq.none", kind: "faq", en: "We found no answer. Press Contact Support to ask our team.", am: "መልስ አላገኘንም። ቡድናችንን ለመጠየቅ «ድጋፍን ያግኙ» የሚለውን ይጫኑ።" },
  { key: "agent.available", kind: "queue", en: "An agent is available and will answer you soon.", am: "ወኪል አሁን ዝግጁ ነው፤ በቅርቡ ይመልስልዎታል።" },
  { key: "queue.position", kind: "queue", en: "You are number {position} in line.", am: "በተራ ቁጥር {position} ላይ ነዎት።" },
  { key: "queue.wait", kind: "queue", en: "The usual wait is about {minutes} minutes.", am: "የተለመደው የጥበቃ ጊዜ {minutes} ደቂቃ ገደማ ነው።" },
  { key: "offline", kind: "offline", en: "Our team is offline right now. We will answer here as soon as we are back.", am: "ቡድናችን አሁን የለም። እንደተመለስን እዚሁ እንመልስልዎታለን።" },
  { key: "transfer.choose", kind: "reply", en: "Choose the topic to move your conversation to.", am: "ውይይትዎን የሚያዛውሩበትን ርዕስ ይምረጡ።" },
  { key: "transfer.done", kind: "reply", en: "Your conversation #{number} now goes to {topic}.", am: "ውይይት #{number} ወደ {topic} ተዛውሯል።" },
  { key: "transfer.none", kind: "reply", en: "You have no open conversation to move.", am: "የሚዛወር ክፍት ውይይት የለዎትም።" },
  { key: "close.done", kind: "closing", en: "Your conversation #{number} is closed. Thank you for contacting MySeed Support.", am: "ውይይት #{number} ተዘግቷል። ማይሲድ ድጋፍን ስላገኙ እናመሰግናለን።" },
  { key: "close.none", kind: "closing", en: "You have no open conversation.", am: "ክፍት ውይይት የለዎትም።" },
  { key: "reopen.done", kind: "reply", en: "Your conversation #{number} is open again. Write your message.", am: "ውይይት #{number} እንደገና ተከፍቷል። መልዕክትዎን ይጻፉ።" },
  { key: "reopen.none", kind: "reply", en: "There is no conversation you can reopen. Start a new one from the menu.", am: "እንደገና ሊከፈት የሚችል ውይይት የለም። ከማውጫው አዲስ ይጀምሩ።" },
  { key: "escalation", kind: "escalation", en: "Your request has been passed to a specialist. We will update you here.", am: "ጥያቄዎ ለባለሙያ ተላልፏል። እዚሁ እናሳውቅዎታለን።" },
  { key: "call.incoming", kind: "call", en: "{agent} from MySeed Support is calling you. Open the support app to answer.", am: "{agent} ከማይሲድ ድጋፍ እየደወሉልዎ ነው። ለመመለስ የድጋፍ መተግበሪያውን ይክፈቱ።" },
  { key: "call.missed", kind: "call", en: "We tried to call you. Reply here or call us when it suits you.", am: "ልንደውልልዎ ሞክረን ነበር። ሲመችዎ እዚሁ ይመልሱልን ወይም ይደውሉልን።" },
  { key: "call.ended", kind: "call", en: "Your call with MySeed Support has ended. Thank you.", am: "ከማይሲድ ድጋፍ ጋር የነበረዎት ጥሪ አብቅቷል። እናመሰግናለን።" },
  { key: "policy.support", kind: "policy", en: "We answer every request in the order it arrives, in English or Amharic. Please keep one conversation per question.", am: "እያንዳንዱን ጥያቄ በደረሰበት ቅደም ተከተል በእንግሊዝኛ ወይም በአማርኛ እንመልሳለን። እባክዎ ለአንድ ጥያቄ አንድ ውይይት ይጠቀሙ።" },
  { key: "terms.privacy", kind: "terms", en: "We keep your messages, files and calls to answer you and improve our support. We do not share them outside MySeed.", am: "መልዕክቶችዎን፣ ፋይሎችዎን እና ጥሪዎችዎን የምንይዘው እርስዎን ለመርዳት እና ድጋፋችንን ለማሻሻል ነው። ከማይሲድ ውጭ አናጋራቸውም።" },
];
const DEF = new Map(CONTENT_DEFAULTS.map((d) => [d.key, d]));

type Row = { id: string; key: string; kind: string; bot: string; lang: string; parent_key: string | null; action: string | null; sort: number; enabled: number; draft_body: string | null; published_body: string | null; published_at: string | null; updated_at: string; updated_by: string | null };
export type ContentItem = { id: string; key: string; kind: string; bot: string; lang: string; parentKey: string | null; action: string | null; sort: number; enabled: boolean; draft: string | null; published: string | null; publishedAt: string | null; updatedAt: string; changed: boolean };
const toItem = (r: Row): ContentItem => ({
  id: r.id, key: r.key, kind: r.kind, bot: r.bot, lang: r.lang, parentKey: r.parent_key, action: r.action, sort: Number(r.sort), enabled: !!Number(r.enabled),
  draft: r.draft_body, published: r.published_body, publishedAt: r.published_at, updatedAt: r.updated_at, changed: r.draft_body != null && r.draft_body !== r.published_body,
});

// The texts the bot had before this store (Customer support, Telegram), kept when they were changed from the
// built-in ones: the store starts from what customers already see.
const OLD_TEXTS: [string, string, string, string][] = [
  ["welcome", "welcome", "welcomeAm", "Selam! What do you need help with?"],
  ["ask", "ask", "askAm", ""],
  ["thanks", "thanks", "thanksAm", ""],
  ["feedback.ask", "feedbackAsk", "feedbackAskAm", ""],
  ["feedback.thanks", "feedbackThanks", "feedbackThanksAm", ""],
];
let seeded: Promise<void> | null = null;
export function ensureSupportContent(): Promise<void> {
  seeded ??= (async () => {
    if ((await getMeta("supContentV1")) === "1") return;
    const now = nowIso();
    const oldDefault = parseJson<Record<string, string>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'sup.telegram.texts'"))?.value, {});
    for (const d of CONTENT_DEFAULTS)
      for (const lang of ["en", "am"] as const) {
        let body = d[lang];
        const old = OLD_TEXTS.find((o) => o[0] === d.key);
        if (old) {
          const v = oldDefault[lang === "en" ? old[1] : old[2]];
          // Changed by the team (and not the old built-in welcome): kept.
          if (typeof v === "string" && v.trim() && !(d.key === "welcome" && lang === "en" && v === old[3]) && !(d.key === "welcome" && lang === "am" && v === "ሰላም! በምን እንርዳዎት?")) body = v.trim();
        }
        await insertPublished("default", d, lang, body, now);
      }
    // A system's own bot: its changed texts become that bot's own items; the rest falls back to the default bot.
    for (const s of await all<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'sup.telegram.texts.%'")) {
      const bot = s.key.slice("sup.telegram.texts.".length);
      const v = parseJson<Record<string, string>>(s.value, {});
      for (const [key, en, am] of OLD_TEXTS)
        for (const [lang, field] of [["en", en], ["am", am]] as const) {
          const body = String(v[field] ?? "").trim();
          if (body && body !== String(oldDefault[field] ?? "")) await insertPublished(bot, DEF.get(key)!, lang, body, now);
        }
    }
    await setMeta("supContentV1", "1");
  })().catch((e) => {
    seeded = null;
    throw e;
  });
  return seeded;
}
async function insertPublished(bot: string, d: Def, lang: string, body: string, now: string) {
  const id = uid("sct_");
  const r = await run(
    "INSERT INTO sup_content (id, key, kind, bot, lang, parent_key, action, sort, enabled, draft_body, published_body, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?) ON CONFLICT (key, bot, lang) DO NOTHING",
    id, d.key, d.kind, bot, lang, d.parent ?? null, d.action ?? null, d.sort ?? 0, body, body, now, now,
  );
  if (r.changes) await run("INSERT INTO sup_content_versions (id, content_id, body, action, published_at, note) VALUES (?, ?, ?, ?, ?, 'Installed')", uid("scv_"), id, body, d.action ?? null, now);
}

// ---------------------------------------------------------------------------
// Reading (the bot and the Mini App)
// ---------------------------------------------------------------------------

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

// The published text of a key in a language: this bot's, else the default bot's, else English, else the built-in.
export async function contentText(key: string, lang: string, bot = "default", vars: Record<string, string | number> = {}): Promise<string> {
  await ensureSupportContent();
  const rows = await all<{ bot: string; lang: string; published_body: string | null; enabled: number }>(
    "SELECT bot, lang, published_body, enabled FROM sup_content WHERE key = ? AND bot IN (?, 'default') AND lang IN (?, 'en')", key, bot, lang,
  );
  const pick = (b: string, l: string) => rows.find((r) => r.bot === b && r.lang === l);
  for (const [b, l] of [[bot, lang], ["default", lang], [bot, "en"], ["default", "en"]] as const) {
    const r = pick(b, l);
    // Switched off: the key says nothing (an empty string the caller can skip).
    if (r && !Number(r.enabled)) return "";
    if (r?.published_body) return fill(r.published_body, vars);
  }
  const d = DEF.get(key);
  return d ? fill(lang === "am" ? d.am : d.en, vars) : "";
}
// Both languages, for a bot set to speak both until the customer picks one.
export async function contentSay(key: string, lang: "en" | "am" | "both", bot = "default", vars: Record<string, string | number> = {}) {
  if (lang !== "both") return contentText(key, lang, bot, vars);
  const [en, am] = await Promise.all([contentText(key, "en", bot, vars), contentText(key, "am", bot, vars)]);
  return en === am || !am ? en : !en ? am : `${en}\n${am}`;
}

export type MenuEntry = { key: string; action: string; label: string; sort: number };
// The published, enabled entries of a kind (main menu or topics) for a bot: its own when it has any, else the default.
export async function contentEntries(kind: "menu" | "category", lang: "en" | "am" | "both", bot = "default"): Promise<MenuEntry[]> {
  await ensureSupportContent();
  const rows = await all<Row>("SELECT * FROM sup_content WHERE kind = ? AND bot IN (?, 'default') AND published_body IS NOT NULL ORDER BY sort, key", kind, bot);
  const own = rows.some((r) => r.bot === bot && bot !== "default");
  const use = rows.filter((r) => r.bot === (own ? bot : "default"));
  const keys = [...new Set(use.map((r) => r.key))];
  const out: MenuEntry[] = [];
  for (const key of keys) {
    const en = use.find((r) => r.key === key && r.lang === "en");
    const base = en ?? use.find((r) => r.key === key)!;
    if (!Number(base.enabled) || !base.action) continue;
    const am = use.find((r) => r.key === key && r.lang === "am");
    const text = (r?: Row) => (r && Number(r.enabled) ? r.published_body ?? "" : "");
    const label = lang === "am" ? text(am) || text(en) : lang === "en" ? text(en) || text(am) : text(en) && text(am) && text(en) !== text(am) ? `${text(en)} · ${text(am)}` : text(en) || text(am);
    if (label) out.push({ key, action: base.action, label: label.slice(0, 64), sort: Number(base.sort) });
  }
  return out;
}
// Bot commands for Telegram's command list, in a language.
export async function contentCommands(lang: "en" | "am", bot = "default") {
  await ensureSupportContent();
  const rows = await all<Row>("SELECT * FROM sup_content WHERE kind = 'command' AND bot IN (?, 'default') AND enabled = 1 AND published_body IS NOT NULL ORDER BY sort, key", bot);
  const out = new Map<string, string>();
  for (const r of rows.filter((r) => r.lang === lang || r.lang === "en").sort((a, b) => Number(a.lang === lang) - Number(b.lang === lang) || Number(a.bot !== "default") - Number(b.bot !== "default")))
    out.set(r.key.replace(/^cmd\./, ""), r.published_body!.slice(0, 256));
  return [...out.entries()].filter(([c]) => /^[a-z0-9_]{1,32}$/.test(c)).map(([command, description]) => ({ command, description }));
}

// ---------------------------------------------------------------------------
// Managing (Customer support, Content)
// ---------------------------------------------------------------------------

async function lead(user: AppUser) {
  const sd = await import("./support-desk");
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin manage the bot and Mini App content.");
}
const clean = (s: unknown, max: number) => String(s ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);
const KEY_RE = /^[a-z0-9_.-]{1,60}$/;
const LANG_RE = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
const kindOk = (k: string): k is ContentKind => CONTENT_KINDS.some(([x]) => x === k);
const actionOk = (a: string | null) => !a || ["start", "requests", "history", "faq", "contact", "language"].includes(a) || /^category:[a-z0-9_]{1,30}$/.test(a) || /^url:https:\/\/\S{3,500}$/.test(a);

export async function listSupportContent(user: AppUser, bot = "default") {
  await lead(user);
  await ensureSupportContent();
  const rows = await all<Row>("SELECT * FROM sup_content WHERE bot = ? ORDER BY kind, sort, key, lang", bot);
  const langs = [...new Set((await all<{ lang: string }>("SELECT DISTINCT lang FROM sup_content")).map((r) => r.lang))];
  return { items: rows.map(toItem), langs: [...new Set(["en", "am", ...langs])], kinds: CONTENT_KINDS.map(([k, l]) => ({ key: k, label: l })), defaults: Object.fromEntries(CONTENT_DEFAULTS.map((d) => [d.key, { en: d.en, am: d.am }])) };
}

// A draft: a new item, a change to one, or a translation (the same key in another language).
export async function saveContentDraft(user: AppUser, input: { id?: string | null; key: string; kind: string; bot?: string; lang: string; body: string; action?: string | null; parentKey?: string | null; publish?: boolean }) {
  await lead(user);
  await ensureSupportContent();
  const key = clean(input.key, 60).toLowerCase();
  const lang = clean(input.lang, 12).toLowerCase();
  const bot = clean(input.bot ?? "default", 60) || "default";
  const body = clean(input.body, 4000);
  const action = input.action ? clean(input.action, 520) : null;
  if (!KEY_RE.test(key)) throw new WorkflowError("VALIDATION", "A key is lowercase letters, digits, dots, dashes or underscores.");
  if (!LANG_RE.test(lang)) throw new WorkflowError("VALIDATION", "Use a language code such as en, am or om.");
  if (!kindOk(input.kind)) throw new WorkflowError("VALIDATION", "Choose what kind of content this is.");
  if (!body) throw new WorkflowError("VALIDATION", "Write the text.");
  if ((input.kind === "menu" || input.kind === "category") && !action) throw new WorkflowError("VALIDATION", "Choose what the entry does.");
  if (!actionOk(action)) throw new WorkflowError("VALIDATION", "That action is not one the bot can do.");
  if (input.kind === "command" && !/^cmd\.[a-z0-9_]{1,32}$/.test(key)) throw new WorkflowError("VALIDATION", "A command key is cmd. and the command, for example cmd.start.");
  if (bot !== "default" && !(await get("SELECT id FROM sup_apps WHERE id = ?", bot))) throw new WorkflowError("NOT_FOUND", "Unknown bot.");
  const now = nowIso();
  const existing = input.id ? await get<Row>("SELECT * FROM sup_content WHERE id = ?", input.id) : await get<Row>("SELECT * FROM sup_content WHERE key = ? AND bot = ? AND lang = ?", key, bot, lang);
  let id: string;
  if (existing) {
    id = existing.id;
    if (existing.key !== key || existing.lang !== lang || existing.bot !== bot) throw new WorkflowError("VALIDATION", "The key, language and bot of an item cannot change. Add a new one.");
    await run("UPDATE sup_content SET kind = ?, draft_body = ?, action = ?, parent_key = ?, updated_at = ?, updated_by = ? WHERE id = ?", input.kind, body, action, input.parentKey ?? existing.parent_key, now, user.id, id);
  } else {
    // A translation shares the order and action of the key's other languages.
    const sib = await get<Row>("SELECT * FROM sup_content WHERE key = ? AND bot = ? ORDER BY lang LIMIT 1", key, bot);
    const sort = sib ? Number(sib.sort) : Number((await get<{ n: number | null }>("SELECT MAX(sort) AS n FROM sup_content WHERE bot = ? AND kind = ?", bot, input.kind))?.n ?? 0) + 1;
    id = uid("sct_");
    await run(
      "INSERT INTO sup_content (id, key, kind, bot, lang, parent_key, action, sort, enabled, draft_body, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
      id, key, input.kind, bot, lang, input.parentKey ?? sib?.parent_key ?? null, action ?? sib?.action ?? null, sort, body, now, user.id,
    );
  }
  await audit({ actor: user }, { action: "support.content", summary: `${user.name} saved a draft of ${key} (${lang}${bot === "default" ? "" : `, ${bot}`})` });
  if (input.publish) return publishContent(user, id);
  return toItem((await get<Row>("SELECT * FROM sup_content WHERE id = ?", id))!);
}

export async function publishContent(user: AppUser, id: string, note?: string | null) {
  await lead(user);
  const r = await get<Row>("SELECT * FROM sup_content WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Content not found.");
  if (!r.draft_body) throw new WorkflowError("INVALID_STATE", "There is no draft to publish.");
  const now = nowIso();
  await tx(async () => {
    await run("UPDATE sup_content SET published_body = draft_body, published_at = ?, updated_at = ?, updated_by = ? WHERE id = ?", now, now, user.id, id);
    // Translations of a menu entry or topic act alike.
    if (r.action) await run("UPDATE sup_content SET action = ? WHERE key = ? AND bot = ?", r.action, r.key, r.bot);
    await run("INSERT INTO sup_content_versions (id, content_id, body, action, published_at, published_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("scv_"), id, r.draft_body, r.action, now, user.id, note ? clean(note, 200) : null);
  });
  await audit({ actor: user }, { action: "support.content_publish", summary: `${user.name} published ${r.key} (${r.lang}${r.bot === "default" ? "" : `, ${r.bot}`})` });
  if (r.kind === "command") await pushCommands(r.bot).catch(() => null);
  return toItem((await get<Row>("SELECT * FROM sup_content WHERE id = ?", id))!);
}

// Telegram's command list follows the published commands, per language.
async function pushCommands(bot: string) {
  const ch = await import("./support-channels");
  const send = async () => {
    for (const lang of ["en", "am"] as const) await ch.botApi("setMyCommands", { commands: await contentCommands(lang, bot), ...(lang === "am" ? { language_code: "am" } : {}) });
  };
  await (bot === "default" ? send() : ch.withBot(bot, send));
}

export async function setContentEnabled(user: AppUser, id: string, enabled: boolean) {
  await lead(user);
  const r = await get<Row>("SELECT * FROM sup_content WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Content not found.");
  // A key is switched on or off in every language at once.
  await run("UPDATE sup_content SET enabled = ?, updated_at = ?, updated_by = ? WHERE key = ? AND bot = ?", enabled ? 1 : 0, nowIso(), user.id, r.key, r.bot);
  await audit({ actor: user }, { action: "support.content", summary: `${user.name} switched ${r.key} ${enabled ? "on" : "off"}` });
}

export async function reorderContent(user: AppUser, bot: string, kind: string, keys: string[]) {
  await lead(user);
  await tx(async () => {
    for (const [i, key] of keys.entries()) await run("UPDATE sup_content SET sort = ? WHERE bot = ? AND kind = ? AND key = ?", i + 1, bot, kind, key);
  });
  await audit({ actor: user }, { action: "support.content", summary: `${user.name} reordered the ${kind} entries` });
}

export async function deleteContent(user: AppUser, id: string, allLanguages = false) {
  await lead(user);
  const r = await get<Row>("SELECT * FROM sup_content WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Content not found.");
  // A built-in key of the default bot is switched off, not deleted: the bot needs something to say.
  if (DEF.has(r.key) && r.bot === "default" && (allLanguages || r.lang === "en")) throw new WorkflowError("INVALID_STATE", "Built-in content cannot be deleted. Switch it off or change its text.");
  if (allLanguages) await run("DELETE FROM sup_content WHERE key = ? AND bot = ?", r.key, r.bot);
  else await run("DELETE FROM sup_content WHERE id = ?", id);
  await audit({ actor: user }, { action: "support.content_delete", summary: `${user.name} deleted ${r.key}${allLanguages ? " in every language" : ` (${r.lang})`}` });
}

export async function contentHistory(user: AppUser, id: string) {
  await lead(user);
  return all<{ id: string; body: string; action: string | null; published_at: string; published_by: string | null; note: string | null; by: string | null }>(
    "SELECT v.*, u.name AS by FROM sup_content_versions v LEFT JOIN users u ON u.id = v.published_by WHERE v.content_id = ? ORDER BY v.published_at DESC LIMIT 50", id,
  );
}

// A version back as the draft (to look at, then publish).
export async function restoreContentVersion(user: AppUser, versionId: string) {
  await lead(user);
  const v = await get<{ content_id: string; body: string; action: string | null }>("SELECT content_id, body, action FROM sup_content_versions WHERE id = ?", versionId);
  if (!v) throw new WorkflowError("NOT_FOUND", "Version not found.");
  await run("UPDATE sup_content SET draft_body = ?, action = COALESCE(?, action), updated_at = ?, updated_by = ? WHERE id = ?", v.body, v.action, nowIso(), user.id, v.content_id);
  return toItem((await get<Row>("SELECT * FROM sup_content WHERE id = ?", v.content_id))!);
}

// The bot texts edited on the Telegram page (welcome, ask, thanks, feedback) are content items too: saving there
// publishes them here, so there is one copy. Called after that page's own permission check.
export const TEXT_FIELDS: [key: string, en: string, am: string][] = [
  ["welcome", "welcome", "welcomeAm"],
  ["ask", "ask", "askAm"],
  ["thanks", "thanks", "thanksAm"],
  ["feedback.ask", "feedbackAsk", "feedbackAskAm"],
  ["feedback.thanks", "feedbackThanks", "feedbackThanksAm"],
];
export async function publishBotTexts(bot: string, texts: Record<string, unknown>, userId: string | null) {
  await ensureSupportContent();
  const now = nowIso();
  for (const [key, en, am] of TEXT_FIELDS)
    for (const [lang, field] of [["en", en], ["am", am]] as const) {
      const body = clean(texts[field], 4000);
      if (!body) continue;
      const cur = await get<Row>("SELECT * FROM sup_content WHERE key = ? AND bot = ? AND lang = ?", key, bot, lang);
      if (cur?.published_body === body) continue;
      // A system's bot that says what the default bot says needs no item of its own.
      if (!cur && bot !== "default" && (await contentText(key, lang, "default")) === body) continue;
      const id = cur?.id ?? uid("sct_");
      if (cur) await run("UPDATE sup_content SET draft_body = ?, published_body = ?, published_at = ?, updated_at = ?, updated_by = ? WHERE id = ?", body, body, now, now, userId, id);
      else await run("INSERT INTO sup_content (id, key, kind, bot, lang, sort, enabled, draft_body, published_body, published_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)", id, key, DEF.get(key)!.kind, bot, lang, body, body, now, now, userId);
      await run("INSERT INTO sup_content_versions (id, content_id, body, published_at, published_by, note) VALUES (?, ?, ?, ?, ?, 'Telegram page')", uid("scv_"), id, body, now, userId);
    }
}
// Those texts as the Telegram page's fields, from the store.
export async function botTextsFromContent(bot: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, en, am] of TEXT_FIELDS) {
    const [e, a] = await Promise.all([contentText(key, "en", bot), contentText(key, "am", bot)]);
    if (e) out[en] = e;
    if (a) out[am] = a;
  }
  return out;
}
