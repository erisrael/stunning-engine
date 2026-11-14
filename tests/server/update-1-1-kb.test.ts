// Update 1.1, phase 15: the knowledge base. How-to guides with numbered steps and YouTube videos (checked with
// YouTube before saving), shown on the help center, the widget, the app API and in the Telegram chat; bulk actions;
// import from CSV, JSON, Markdown or a ZIP with a preview first; and export in the same format.
import JSZip from "jszip";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as sd from "../../src/server/support-desk";
import * as ch from "../../src/server/support-channels";
import * as kb from "../../src/server/kb-guides";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;

// YouTube, as the tests see it: two good videos, one private, one with embedding off.
const GOOD = "dQw4w9WgXcQ";
const GOOD2 = "9bZkp7q19f0";
const PRIVATE = "aaaaaaaaaaa";
const NOEMBED = "bbbbbbbbbbb";
const asked: string[] = [];
kb.setYoutubeChecker(async (id) => {
  asked.push(id);
  if (id === PRIVATE) return { ok: false, status: 404 };
  if (id === NOEMBED) return { ok: false, status: 401 };
  return { ok: true, title: id === GOOD ? "Paying with telebirr" : "Opening the app" };
});

async function main() {
  const admin = await by("admin@demo.local");
  const sara = await by("sara@demo.local");
  const dawit = await by("dawit@demo.local");
  await sd.saveSupportConfig(admin, { enabled: true, leads: [] });
  await sd.saveQueue(admin, { name: "Academy", keywords: [], members: [sara.id], strategy: "least_busy" });

  // YouTube links.
  const ids = ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "https://youtu.be/dQw4w9WgXcQ?si=x", "youtube.com/shorts/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ"].map(kb.youtubeId);
  check("every kind of YouTube link gives the video id", ids.every((x) => x === GOOD), ids);
  check("other links are not videos", [kb.youtubeId("https://vimeo.com/123"), kb.youtubeId("https://youtube.com/watch?v=short"), kb.youtubeId("not a link"), kb.youtubeId("https://evil.example/watch?v=dQw4w9WgXcQ")].every((x) => x === null));
  const ok = await kb.checkVideoFor(sara, `https://youtu.be/${GOOD}`);
  check("a good video is checked with its title and thumbnail", ok.ok && ok.video.title === "Paying with telebirr" && ok.thumbnail.includes(GOOD), ok);
  const priv = await kb.checkVideo(`https://youtu.be/${PRIVATE}`);
  check("a private or missing video is refused with the reason", !priv.ok && /private/.test(priv.error), priv);
  const noembed = await kb.checkVideo(`https://youtu.be/${NOEMBED}`);
  check("a video with embedding off is refused with the reason", !noembed.ok && /embedding is off/.test(noembed.error), noembed);
  check("people outside support cannot check videos", /support agents/.test((await err(() => kb.checkVideoFor(dawit, `https://youtu.be/${GOOD}`))) ?? ""));

  // Guides.
  check("a guide needs a step", /at least one step/.test((await err(() => kb.saveKbArticle(sara, { kind: "guide", title: "Empty guide", steps: [{ title: "", body: "" }] }))) ?? ""));
  check("a bad step video is refused, naming the step", /Step 2: .*private/.test((await err(() => kb.saveKbArticle(sara, { kind: "guide", title: "Bad video", steps: [{ title: "One" }, { title: "Two", videoUrl: `https://youtu.be/${PRIVATE}` }] }))) ?? ""));
  check("an agent cannot publish", /support lead publishes/.test((await err(() => kb.saveKbArticle(sara, { kind: "guide", title: "x", published: true, steps: [{ title: "a" }] }))) ?? ""));
  const gid = await kb.saveKbArticle(sara, {
    kind: "guide",
    title: "How to pay your fees in the app",
    intro: "You can pay with **telebirr** or a bank card.",
    category: "Payments",
    keywords: "pay fees telebirr",
    steps: [
      { title: "Open Payments", body: "Press the wallet at the bottom." },
      { title: "", body: "" },
      { title: "Choose telebirr", body: "Enter your number.", videoUrl: `https://www.youtube.com/watch?v=${GOOD}` },
      { title: "Confirm", body: "See [the receipt guide](https://help.example/receipt).", video: { id: GOOD2, title: "Opening the app" } },
    ],
  });
  const g = (await kb.listKb(sara, { kind: "guide" })).find((a) => a.id === gid)!;
  check("an agent saves a guide as a draft", !!g && !g.published && g.kind === "guide");
  check("empty steps are dropped and the rest kept in order", g.steps.map((s) => s.title).join("|") === "Open Payments|Choose telebirr|Confirm", g.steps);
  check("a step's video is kept with YouTube's title", g.steps[1]!.video?.id === GOOD && g.steps[1]!.video?.title === "Paying with telebirr");
  check("an already checked video is not asked again", !asked.includes(GOOD2));
  check("every word of the guide is searchable", (await kb.listKb(sara, { q: "wallet at the bottom" })).some((a) => a.id === gid));
  check("drafts are not shown to customers", /not found/i.test((await err(() => kb.publicArticle(gid))) ?? ""));
  await kb.saveKbArticle(admin, { id: gid, kind: "guide", title: g.title, intro: g.intro, category: "Payments", keywords: g.keywords, published: true, steps: g.steps });
  const pub = await ch.readArticle(gid);
  check("customers see the published guide with its steps", pub.kind === "guide" && pub.steps.length === 3 && pub.intro.includes("telebirr"), pub);
  check("videos come with a privacy-friendly player and a thumbnail", pub.steps[1]!.video?.embed === `https://www.youtube-nocookie.com/embed/${GOOD}` && pub.steps[1]!.video?.thumbnail === `https://i.ytimg.com/vi/${GOOD}/hqdefault.jpg`, pub.steps[1]);
  const views = (await get<{ views: number }>("SELECT views FROM sup_articles WHERE id = ?", gid))!.views;
  check("reading counts a view", Number(views) === 1);

  // A plain answer with a video.
  check("a bad article video is refused", /embedding is off/.test((await err(() => kb.saveKbArticle(admin, { title: "With video", body: "Watch this.", videoUrl: `https://youtu.be/${NOEMBED}` }))) ?? ""));
  const aid = await kb.saveKbArticle(admin, { title: "Watch: opening the app", body: "Tap the MySeed icon.", category: "Payments", videoUrl: `https://youtu.be/${GOOD2}`, published: true });
  const art = await kb.publicArticle(aid);
  check("an article keeps its video", art.kind === "article" && art.video?.id === GOOD2 && art.body === "Tap the MySeed icon.", art);
  const old = await kb.saveKbArticle(admin, { title: "Plain answer", body: "Just text.", category: "Payments", published: true });
  check("the old article save still works", (await ch.saveArticle(admin, { id: old, title: "Plain answer", body: "Just text, edited.", category: "Payments", published: true })) !== undefined && (await kb.publicArticle(old)).body === "Just text, edited.");
  await ch.saveArticle(admin, { id: gid, title: g.title, body: "New intro from the old editor", category: "Payments", published: true });
  check("the old editor keeps a guide a guide", (await kb.publicArticle(gid)).kind === "guide" && (await kb.publicArticle(gid)).steps.length === 3);

  // Telegram: guides read in the chat.
  const msgs = await kb.guideMessages(gid);
  check("a guide becomes one message per step", msgs.length === 4 && msgs[2]!.startsWith("2. Choose telebirr") && msgs[2]!.includes(`https://www.youtube.com/watch?v=${GOOD}`), msgs);
  check("Telegram messages have no Markdown marks", msgs[3]!.includes("the receipt guide (https://help.example/receipt)") && !msgs.join("").includes("**"), msgs);
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  ch.setTelegramPoster(async (url, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    return { ok: true, result: { username: "myseed_help_bot", message_id: posts.length } };
  });
  await ch.connectTelegram(admin, "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ", "https://cm.myseed.et");
  const secret = String(posts.find((p) => p.url.endsWith("/setWebhook"))!.body.secret_token);
  const press = (data: string) => ch.telegramUpdate(secret, secret, { callback_query: { id: `cb${Math.random()}`, data, from: { id: 777, first_name: "Selam" }, message: { chat: { id: 777, type: "private" } } } });
  await ch.telegramUpdate(secret, secret, { message: { message_id: 1, text: "/start", chat: { id: 777, type: "private" }, from: { id: 777, first_name: "Selam" } } });
  posts.length = 0;
  await press("c:payments");
  const list = posts.find((p) => p.url.endsWith("/sendMessage") && String(p.body.chat_id) === "777");
  const buttons = ((list?.body.reply_markup as { inline_keyboard?: { text: string; callback_data?: string }[][] } | undefined)?.inline_keyboard ?? []).flat();
  check("the help topic offers to read guides and video answers here", buttons.some((b) => b.callback_data === `g:${gid}` && b.text.startsWith("Read here")) && buttons.some((b) => b.callback_data === `g:${aid}`) && !buttons.some((b) => b.callback_data === `g:${old}`), buttons);
  posts.length = 0;
  await press(`g:${gid}`);
  const sent = posts.filter((p) => p.url.endsWith("/sendMessage")).map((p) => String(p.body.text));
  check("pressing it sends the guide step by step", sent.length === 4 && sent[1]!.startsWith("1. Open Payments"), sent);
  posts.length = 0;
  await press("g:art_nope");
  check("a removed guide says so", posts.some((p) => String(p.body.text ?? "").includes("no longer available")));

  // Bulk actions (leads).
  check("agents cannot act on many at once", /support leads/.test((await err(() => kb.bulkKb(sara, [gid], "unpublish"))) ?? ""));
  check("nothing chosen is refused", /Choose articles/.test((await err(() => kb.bulkKb(admin, [], "publish"))) ?? ""));
  check("unpublish many", (await kb.bulkKb(admin, [gid, aid, "art_nope"], "unpublish")).changed === 2 && (await kb.listKb(admin, { status: "draft" })).filter((a) => [gid, aid].includes(a.id)).length === 2);
  check("publish many", (await kb.bulkKb(admin, [gid, aid], "publish")).changed === 2 && (await kb.listKb(admin, { status: "published" })).filter((a) => [gid, aid].includes(a.id)).length === 2);
  await kb.bulkKb(admin, [aid, old], "move", "Getting started");
  check("move many to a category", (await kb.listKb(admin, { category: "getting started" })).length === 2);
  await kb.bulkKb(admin, [old], "move", "");
  check("moving to no category", (await kb.listKb(admin, { category: "-" })).some((a) => a.id === old));

  // Export, then import it back.
  check("agents cannot export", /support leads/.test((await err(() => kb.exportKb(sara))) ?? ""));
  const exp = await kb.exportKb(admin);
  const eg = exp.find((x) => x.title === g.title) as { steps?: { video: string | null }[] } | undefined;
  check("the export holds guides with their step videos as links", !!eg && eg.steps?.[1]?.video === `https://www.youtube.com/watch?v=${GOOD}`, eg);
  const back = await kb.importKb(admin, { name: "export.json", data: Buffer.from(JSON.stringify(exp)) }, { preview: true });
  check("importing the export updates every article, creates none", back.created === 0 && back.updated === exp.length && back.skipped === 0, back);

  // CSV with a preview first.
  const csv = [
    "title,body,category,keywords,published,video,step1,step1_video,step2",
    `"Reset your password","Press Forgot password on the sign-in page.",Account,"login, sign in",yes,,,,`,
    `"Install the app",,Getting started,,no,,"Open the store: Search MySeed",https://youtu.be/${GOOD},Install it`,
    `,"no title here",Account,,yes,,,,`,
    `"Bad video","Watch.",Account,,yes,https://youtu.be/${PRIVATE},,,`,
    `"Reset your password","Twice in one file",Account,,yes,,,,`,
  ].join("\n");
  check("agents cannot import", /support leads/.test((await err(() => kb.importKb(sara, { name: "a.csv", data: Buffer.from(csv) }, { preview: true }))) ?? ""));
  asked.length = 0;
  const pv = await kb.importKb(admin, { name: "kb.csv", data: Buffer.from(csv) }, { preview: true });
  check("the preview says what would happen", pv.preview && pv.created === 3 && pv.skipped === 2, pv);
  check("the preview saves nothing and asks YouTube nothing", !(await get("SELECT id FROM sup_articles WHERE title = 'Reset your password'")) && asked.length === 0);
  check("a row without a title is skipped with the reason", pv.lines.some((l) => l.source === "kb.csv row 4" && l.action === "skip" && /title/.test(l.error ?? "")), pv.lines);
  check("a repeated title is skipped", pv.lines.some((l) => l.source === "kb.csv row 6" && /earlier in this import/.test(l.error ?? "")));
  const csvGuide = pv.lines.find((l) => l.title === "Install the app");
  check("step columns make a guide", csvGuide?.kind === "guide" && csvGuide.steps === 2, csvGuide);
  const done = await kb.importKb(admin, { name: "kb.csv", data: Buffer.from(csv) }, { preview: false });
  check("the real import checks videos and skips the bad one", done.created === 2 && done.skipped === 3 && done.lines.some((l) => l.title === "Bad video" && /private/.test(l.error ?? "")), done);
  const inst = (await kb.listKb(admin, { q: "Install the app" })).find((a) => a.title === "Install the app")!;
  check("a CSV step 'Title: text' is split", inst.steps[0]!.title === "Open the store" && inst.steps[0]!.body === "Search MySeed" && inst.steps[0]!.video?.id === GOOD, inst.steps);
  check("published flags come from the file", (await kb.listKb(admin, { status: "published", q: "Reset your password" })).length === 1 && !inst.published);
  const again = await kb.importKb(admin, { name: "kb.csv", data: Buffer.from(csv) }, { preview: false, publish: false });
  check("importing again updates by title, and can make all drafts", again.created === 0 && again.updated === 2 && (await kb.listKb(admin, { status: "draft", q: "Reset your password" })).length === 1, again);
  check("a CSV without a title column is refused", /title/.test((await err(() => kb.importKb(admin, { name: "x.csv", data: Buffer.from("name,answer\na,b") }, { preview: true }))) ?? ""));

  // Markdown and ZIP.
  const md = `---\ntitle: Join a live class\ncategory: Classes\npublished: true\n---\nLive classes start at 6 pm.\n\n## Step 1: Open Classes\nPress **Classes**.\nhttps://youtu.be/${GOOD2}\n\n## Press Join\nThe teacher lets you in.\n`;
  const mdr = await kb.importKb(admin, { name: "live.md", data: Buffer.from(md) }, { preview: false });
  const live = (await kb.listKb(admin, { category: "Classes" }))[0];
  check("a Markdown file becomes a guide with '## ' steps and a step video", mdr.created === 1 && live?.kind === "guide" && live.published && live.steps.length === 2 && live.steps[0]!.title === "Open Classes" && live.steps[0]!.video?.id === GOOD2 && live.intro === "Live classes start at 6 pm.", live);
  const zip = new JSZip();
  zip.file("account/two-factor.md", "# Turn on two-step sign-in\n\nGo to Settings, then Security.\n");
  zip.file("more.json", JSON.stringify([{ title: "Change your school", body: "Ask your school office.", category: "Account", published: true }]));
  zip.file("__MACOSX/._two-factor.md", "junk");
  zip.file("notes.txt.bak", "ignored");
  const zr = await kb.importKb(admin, { name: "kb.zip", data: await zip.generateAsync({ type: "nodebuffer" }) }, { preview: false });
  check("a ZIP of Markdown and JSON files is imported", zr.created === 2 && zr.skipped === 0 && !!(await get("SELECT id FROM sup_articles WHERE title = 'Turn on two-step sign-in' AND kind = 'article'")), zr);
  check("a broken file is refused plainly", /not a ZIP/.test((await err(() => kb.importKb(admin, { name: "bad.zip", data: Buffer.from("nope") }, { preview: true }))) ?? "") && /not valid JSON/.test((await err(() => kb.importKb(admin, { name: "bad.json", data: Buffer.from("{") }, { preview: true }))) ?? "") && /Import a/.test((await err(() => kb.importKb(admin, { name: "x.pdf", data: Buffer.from("%PDF") }, { preview: true }))) ?? ""));
  check("a file over 5 MB is refused", /5 MB/.test((await err(() => kb.importKb(admin, { name: "big.csv", data: Buffer.alloc(kb.IMPORT_MAX + 1) }, { preview: true }))) ?? ""));
  const many = JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ title: `A${i}`, body: "x" })));
  check("more than 500 at a time is refused", /At most 500/.test((await err(() => kb.importKb(admin, { name: "many.json", data: Buffer.from(many) }, { preview: true }))) ?? ""));

  // Filters, and delete.
  check("filters combine", (await kb.listKb(admin, { kind: "guide", category: "Classes", status: "published" })).length === 1 && (await kb.listKb(admin, { kind: "article", category: "Classes" })).length === 0);
  check("help topics list guides and videos for the widget", (await (await import("../../src/server/support-help")).categoryArticles("payments", 10)).some((a) => a.id === gid && a.kind === "guide"));
  check("delete many", (await kb.bulkKb(admin, [gid, live!.id], "delete")).changed === 2 && !(await get("SELECT id FROM sup_articles WHERE id = ?", gid)));
  check("bulk actions are in the audit log", !!(await get("SELECT id FROM audit_events WHERE action = 'support.kb' AND summary LIKE '%deleted 2 help articles%'")));

  await closeDb();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
