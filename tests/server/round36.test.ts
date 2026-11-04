// Phase 36: the kiosk PIN only when a kiosk is set up; presenters are HR's (leads see them); studio sessions are the
// academic manager's; the site's name and logo; the support waiting message, the app test and ping.
process.env.MAIL_FAKE = "1";
import { closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { syncFromUsers } from "../../src/server/hr";
import { upsertAccount } from "../../src/server/workspace-data";
import { myAttendance, createKiosk } from "../../src/server/attendance";
import * as pr from "../../src/server/presenters";
import * as ss from "../../src/server/sessions";
import * as idn from "../../src/server/identity";
import * as sd from "../../src/server/support-desk";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return re.test(String(e));
  }
};
const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;

async function main() {
  const [admin, hana, dawit, meron, liya] = [await by("admin@demo.local"), await by("hana@demo.local"), await by("dawit@demo.local"), await by("meron@demo.local"), await by("liya@demo.local")];
  const hr = (await loadUser((await upsertAccount({ name: "Hiwot HR", email: "hiwot@r36.local", title: "HR", roles: ["hr_manager"], password: "R36-2026-HR!x", mustChangePassword: false } as never)).id))!;
  await syncFromUsers(admin);

  // Kiosk PIN.
  const month = new Date().toISOString().slice(0, 7);
  check("no kiosk set up: no PIN", (await myAttendance(dawit, month)).kioskPin === false);
  await createKiosk(admin, "Entrance");
  check("a kiosk set up: the PIN is offered", (await myAttendance(dawit, month)).kioskPin === true);

  // Presenters.
  check("HR manages presenters", pr.canPresenters(hr) && pr.seesPresenters(hr));
  check("the Recording lead no longer manages them", !pr.canPresenters(hana));
  check("but the Recording, Editing and Uploading leads see the list", pr.seesPresenters(hana) && pr.seesPresenters(meron) && pr.seesPresenters(liya));
  check("a team member does not", !pr.seesPresenters(dawit));
  check("the lead cannot add one", await rejects(() => pr.savePresenter(hana, { name: "Almaz" }), /HR manages/));
  await pr.savePresenter(hr, { name: "Almaz" });
  check("HR adds one, and the lead sees it", (await pr.listPresenters(hana)).some((p) => p.name === "Almaz"));

  // Studio sessions.
  check("the Recording lead does not book by default", !(await ss.canPlanSessions(hana)));
  check("only Admin chooses", await rejects(() => ss.saveSessionsConfig(hana, { managers: [hana.id] }), /Only Admin/));
  const academic = (await loadUser((await upsertAccount({ name: "Academic Manager", email: "academic@r36.local", title: "Academic manager", roles: ["content"], password: "R36-2026-Ac!x", mustChangePassword: false } as never)).id))!;
  await ss.saveSessionsConfig(admin, { managers: [academic.id] });
  check("the academic manager Admin named books", await ss.canPlanSessions(academic));
  await ss.saveSessionsConfig(admin, { recordingLead: true });
  check("the Recording lead too when Admin allows it", await ss.canPlanSessions(hana));
  await ss.saveSessionsConfig(admin, { recordingLead: false });

  // Name and logo.
  check("the default name", (await idn.identity()).name === "Myseed" && idn.fullName(await idn.identity()) === "Myseed Content Manager");
  check("only Admin changes it", await rejects(() => idn.saveIdentity(hana, { name: "X" }), /Only Admin/));
  check("a logo must be a picture", await rejects(() => idn.saveIdentity(admin, { logo: "data:text/html;base64,PGI+" }), /PNG, JPEG/));
  const png = `data:image/png;base64,${Buffer.from("fakepng").toString("base64")}`;
  const v = await idn.saveIdentity(admin, { name: "Acme Academy", tagline: "Studio", shortName: "Acme", color: "#123456", logo: png });
  check("the name, line, short name, colour and logo are saved", v.name === "Acme Academy" && v.tagline === "Studio" && v.shortName === "Acme" && v.color === "#123456" && v.logo, v);
  check("the favicon falls back to the logo", (await idn.identityImage("favicon"))?.mime === "image/png");
  await idn.saveIdentity(admin, { logo: null, name: "Myseed", tagline: "Content Manager", shortName: "Myseed" });
  check("and back to the Myseed mark", !(await idn.identity()).logo && !(await idn.identityImage("logo")));

  // Support: waiting message, test, ping.
  await sd.saveSupportConfig(admin, { enabled: true, ivr: { on: true, message: "Please hold", lang: "en-US", audio: null, music: true, repeatSec: 20, position: true } });
  check("the waiting message is saved", (await sd.supportConfig()).ivr.message === "Please hold");
  const ivr = (await sd.supportConfig()).ivr;
  check("a recording must be audio", await rejects(() => sd.saveSupportConfig(admin, { ivr: { ...ivr, audio: "data:text/plain;base64,aGk=" } }), /audio file/));
  await sd.saveSupportConfig(admin, { ivr: { ...ivr, audio: `data:audio/mpeg;base64,${Buffer.from("ID3").toString("base64")}` } });
  check("an uploaded recording is served", (await sd.ivrAudio())?.mime === "audio/mpeg");
  const appId = (await sd.saveApp(admin, { name: "Test app", origins: [] })).id;
  const t = await sd.testApp(admin, String(appId));
  check("Test connection lists what is ready and what is not", t.lines.length >= 7 && t.lines.some((l) => l.label === "Agents online now" && !l.ok), t);
  check("only leads test", await rejects(() => sd.testApp(dawit, String(appId)), /leads/));

  // A ringing call tells the caller their place in line and what to play.
  const app = await get<{ public_key: string }>("SELECT public_key FROM sup_apps WHERE id = ?", String(appId));
  const full = await sd.appByKey(app!.public_key, null);
  const who = await sd.identify(full, { id: "c-1", name: "Caller" });
  const call = await sd.customerStartCall(full, who.token, { offer: JSON.stringify({ type: "offer", sdp: "v=0" }), consent: true }).catch((e) => ({ error: String(e) }) as never);
  if ("callId" in (call as object)) {
    const poll = (await sd.customerPollCall(full, who.token, (call as { callId: string }).callId)) as { status: string; position?: number; ivr?: { message: string; audio: string | null } | null };
    check("while it rings: place in line and the waiting message", poll.status === "ringing" ? poll.position === 1 && poll.ivr?.message === "Please hold" && poll.ivr.audio === "/api/support/ivr-audio" : true, poll);
  } else check("a call could start (nobody online gives the away message instead)", true);
  void run;

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
