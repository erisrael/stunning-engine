"use client";

// Customer support setup (Admin and support leads): the on and off switch and rules, queues with their agents and
// targets, connected apps with the SDK snippet, saved replies; and the monitor of agents' activity.
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleIcon, CopyIcon, KeyRoundIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/support-desk";
import type { SupportConfig } from "@/lib/support";
import { cn } from "@/lib/utils";

type Res = { ok: boolean; error?: string; data?: unknown };
function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<Res>, done?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Something went wrong.");
    if (done) toast.success(done);
    router.refresh();
    return r.data ?? true;
  };
  return { act, busy };
}
const select = "h-9 rounded-md border bg-background px-2 text-sm";
type Person = { id: string; name: string };
type Queue = { id: string; name: string; description: string | null; keywords: string[]; members: string[]; strategy: string; slaFirstMin: number; slaResolveMin: number; active: boolean };
type App = { id: string; name: string; publicKey: string; origins: string[]; queueId: string | null; verifyIdentity: boolean; greeting: string | null; color: string | null; active: boolean };

function People({ all, value, onChange, label }: { all: Person[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto rounded-md border p-2" aria-label={label}>
      {all.map((p) => (
        <label key={p.id} className={cn("flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs", value.includes(p.id) && "border-primary bg-primary/10")}>
          <input type="checkbox" className="sr-only" checked={value.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))} />
          {p.name}
        </label>
      ))}
    </div>
  );
}

export function SupportSettings({ cfg, people, admin, mailboxes = [], telegram = { connected: false, bot: null } }: { cfg: SupportConfig; people: Person[]; admin: boolean; mailboxes?: string[]; telegram?: { connected: boolean; bot: string | null } }) {
  const { act, busy } = useAct();
  const [c, setC] = React.useState(cfg);
  const [token, setToken] = React.useState("");
  const sw = (k: keyof SupportConfig, label: string, hint: string) => (
    <label className="flex items-start gap-3">
      <Switch checked={!!c[k]} onCheckedChange={(v) => setC({ ...c, [k]: v })} aria-label={label} disabled={!admin} />
      <span>
        <b>{label}</b>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
  const num = (k: keyof SupportConfig, label: string) => (
    <div className="space-y-1">
      <Label htmlFor={`sc-${k}`}>{label}</Label>
      <Input id={`sc-${k}`} type="number" disabled={!admin} value={Number(c[k])} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} />
    </div>
  );
  return (
    <Card data-support-settings>
      <CardHeader>
        <CardTitle className="text-base">Customer support</CardTitle>
        <CardDescription>Switch the help desk on, choose who leads it, and how tickets and calls are handled.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {sw("enabled", "Customer support on", "Off: the desk is hidden and connected apps show that support is not available.")}
        {sw("autoAssign", "Give out tickets automatically", "Each new ticket goes to an online agent of its queue at once (least busy, or in turn, as the queue says).")}
        {sw("requireCheckin", "Only agents checked in at work", "An agent must be checked in (Attendance) to be given tickets and calls.")}
        {sw("recordCalls", "Record calls", "Calls from the app are recorded after the customer agrees; agents' recordings are kept with the ticket.")}
        <div className="space-y-1">
          <Label htmlFor="sc-notice">What the customer is told before a recorded call</Label>
          <Textarea id="sc-notice" disabled={!admin} value={c.recordingNotice} onChange={(e) => setC({ ...c, recordingNotice: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {num("recordingDays", "Keep recordings (days)")}
          {num("autoCloseDays", "Close solved tickets after (days)")}
          {num("ringSeconds", "A call rings for (seconds)")}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sc-hours">Opening hours (shown in the app)</Label>
            <Input id="sc-hours" disabled={!admin} value={c.hours} onChange={(e) => setC({ ...c, hours: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sc-away">When nobody is online</Label>
            <Input id="sc-away" disabled={!admin} value={c.awayMessage} onChange={(e) => setC({ ...c, awayMessage: e.target.value })} />
          </div>
        </div>
        <fieldset className="space-y-2 rounded-lg border p-3" data-ivr-settings>
          <legend className="px-1 text-sm font-medium">Waiting message for callers</legend>
          <p className="text-xs text-muted-foreground">Played to someone calling from the app until an agent answers: your recording, or the message read out in their browser, then soft hold music. Repeated, with their place in line.</p>
          <label className="flex items-center gap-2 text-sm">
            <Switch disabled={!admin} checked={c.ivr.on} onCheckedChange={(v) => setC({ ...c, ivr: { ...c.ivr, on: v } })} /> Play a waiting message
          </label>
          <div className="space-y-1">
            <Label htmlFor="sc-ivr">Message</Label>
            <Textarea id="sc-ivr" rows={2} disabled={!admin || !c.ivr.on} value={c.ivr.message} onChange={(e) => setC({ ...c, ivr: { ...c.ivr, message: e.target.value } })} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="sc-ivr-lang">Voice language</Label>
              <select id="sc-ivr-lang" disabled={!admin || !c.ivr.on} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={c.ivr.lang} onChange={(e) => setC({ ...c, ivr: { ...c.ivr, lang: e.target.value } })}>
                <option value="en-US">English</option>
                <option value="am-ET">Amharic (where the phone has the voice)</option>
                <option value="en-GB">English (UK)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-ivr-rep">Repeat every (seconds)</Label>
              <Input id="sc-ivr-rep" type="number" min={10} max={300} disabled={!admin || !c.ivr.on} value={c.ivr.repeatSec} onChange={(e) => setC({ ...c, ivr: { ...c.ivr, repeatSec: Number(e.target.value) } })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sc-ivr-file">Or a recording (MP3, up to 4 MB)</Label>
              <Input
                id="sc-ivr-file"
                type="file"
                accept="audio/*"
                disabled={!admin || !c.ivr.on}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 4 * 1024 * 1024) return void toast.error("Up to 4 MB.");
                  const url = await new Promise<string>((res) => {
                    const r = new FileReader();
                    r.onload = () => res(String(r.result));
                    r.readAsDataURL(f);
                  });
                  setC({ ...c, ivr: { ...c.ivr, audio: url } });
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Switch disabled={!admin || !c.ivr.on} checked={c.ivr.music} onCheckedChange={(v) => setC({ ...c, ivr: { ...c.ivr, music: v } })} /> Hold music
            </label>
            <label className="flex items-center gap-2">
              <Switch disabled={!admin || !c.ivr.on} checked={c.ivr.position} onCheckedChange={(v) => setC({ ...c, ivr: { ...c.ivr, position: v } })} /> Say their place in line
            </label>
            {c.ivr.audio && (
              <Button size="xs" variant="ghost" disabled={!admin} onClick={() => setC({ ...c, ivr: { ...c.ivr, audio: null } })}>
                Remove the recording
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              type="button"
              onClick={() => {
                if (c.ivr.audio) return void new Audio(c.ivr.audio).play();
                const u = new SpeechSynthesisUtterance(`${c.ivr.message} You are number 2 in line.`);
                u.lang = c.ivr.lang;
                window.speechSynthesis?.speak(u);
              }}
            >
              Listen
            </Button>
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sc-mailbox">Support mailbox (email becomes tickets)</Label>
            <select id="sc-mailbox" disabled={!admin} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={c.mailbox ?? ""} onChange={(e) => setC({ ...c, mailbox: e.target.value || null })}>
              <option value="">No mailbox</option>
              {mailboxes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">A mailbox from Email, Settings, Mailboxes (for example support@). New mail opens a ticket; replies keep [#number] in the subject; agents&apos; replies go out from it.</p>
          </div>
          <div className="space-y-1" data-telegram>
            <Label htmlFor="sc-tg">Telegram bot</Label>
            {telegram.connected ? (
              <p className="text-sm">
                Connected: <b>@{telegram.bot}</b>. Customers write to it; agents answer in the desk.
              </p>
            ) : (
              <div className="flex gap-2">
                <Input id="sc-tg" disabled={!admin} placeholder="Bot token from @BotFather" value={token} onChange={(e) => setToken(e.target.value)} />
                <Button size="sm" variant="outline" disabled={!admin || busy || !token.trim()} onClick={async () => (await act(() => A.connectTelegramAction(token), "Telegram connected")) && setToken("")}>
                  Connect
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Support leads (set up queues, see every ticket, monitor agents, listen to recordings)</Label>
          <People all={people} value={c.leads} onChange={(v) => setC({ ...c, leads: v })} label="Support leads" />
        </div>
        {admin && (
          <Button disabled={busy} onClick={() => act(() => A.saveSupportConfigAction(c), "Saved")}>
            Save
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function Queues({ queues, people }: { queues: Queue[]; people: Person[] }) {
  const { act, busy } = useAct();
  const blank = { id: null as string | null, name: "", description: "", keywords: "", members: [] as string[], strategy: "least_busy", slaFirstMin: 60, slaResolveMin: 1440, active: true };
  const [q, setQ] = React.useState<typeof blank | null>(null);
  return (
    <Card data-support-queues>
      <CardHeader>
        <CardTitle className="text-base">Queues</CardTitle>
        <CardDescription>A queue is a team of agents for a kind of question. Keywords route a ticket to it; the targets set when it must be answered and solved (urgent ones in a quarter of the time, high in half).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {queues.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2" data-queue={x.name}>
            <span className="font-medium">{x.name}</span>
            <span className="text-xs text-muted-foreground">
              {x.members.length} agents · {x.strategy === "least_busy" ? "least busy first" : x.strategy === "round_robin" ? "in turn" : "by hand"} · answer in {x.slaFirstMin} min, solve in {Math.round(x.slaResolveMin / 60)} h
              {x.keywords.length ? ` · ${x.keywords.join(", ")}` : ""}
              {!x.active && " · off"}
            </span>
            <Button size="xs" variant="outline" className="ml-auto" onClick={() => setQ({ ...x, description: x.description ?? "", keywords: x.keywords.join(", ") })}>
              Edit
            </Button>
          </div>
        ))}
        {!q && (
          <Button size="sm" variant="outline" onClick={() => setQ(blank)}>
            <PlusIcon /> New queue
          </Button>
        )}
        {q && (
          <div className="space-y-2 rounded-lg border border-primary/30 p-3" data-queue-form>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input aria-label="Queue name" placeholder="Name, e.g. App and account" value={q.name} onChange={(e) => setQ({ ...q, name: e.target.value })} />
              <Input aria-label="Keywords" placeholder="Keywords, comma separated: password, login" value={q.keywords} onChange={(e) => setQ({ ...q, keywords: e.target.value })} />
              <select aria-label="How tickets are given out" className={select} value={q.strategy} onChange={(e) => setQ({ ...q, strategy: e.target.value })}>
                <option value="least_busy">Least busy agent first</option>
                <option value="round_robin">In turn</option>
                <option value="manual">By hand (a lead assigns)</option>
              </select>
              <div className="flex gap-2">
                <Input aria-label="Answer within (minutes)" type="number" value={q.slaFirstMin} onChange={(e) => setQ({ ...q, slaFirstMin: Number(e.target.value) })} />
                <Input aria-label="Solve within (minutes)" type="number" value={q.slaResolveMin} onChange={(e) => setQ({ ...q, slaResolveMin: Number(e.target.value) })} />
              </div>
            </div>
            <Label>Agents</Label>
            <People all={people} value={q.members} onChange={(v) => setQ({ ...q, members: v })} label="Agents" />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={q.active} onChange={(e) => setQ({ ...q, active: e.target.checked })} /> Active
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !q.name.trim()} onClick={async () => (await act(() => A.saveQueueAction({ ...q, keywords: q.keywords.split(",").map((k) => k.trim()) }), "Queue saved")) && setQ(null)}>
                Save queue
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setQ(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Apps({ apps, queues, origin, admin }: { apps: App[]; queues: Queue[]; origin: string; admin: boolean }) {
  const { act, busy } = useAct();
  const [a, setA] = React.useState<{ id: string | null; name: string; origins: string; queueId: string; verifyIdentity: boolean; greeting: string; color: string; active: boolean } | null>(null);
  const [secret, setSecret] = React.useState<{ app: string; secret: string } | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [tests, setTests] = React.useState<Record<string, { ok: boolean; ms: number; lines: { label: string; ok: boolean; detail: string }[] }>>({});
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast.success("Copied"));
  const snippet = (x: App) => `<script src="${origin}/support-sdk.js"></script>
<script>
  MyseedSupport.init({
    appKey: "${x.publicKey}",
    user: { id: "123", name: "Abebe Kebede", email: "abebe@example.com"${x.verifyIdentity ? ', hash: "<HMAC-SHA256 of the id with the app secret, from your server>"' : ""} },
  });
</script>`;
  return (
    <Card data-support-apps>
      <CardHeader>
        <CardTitle className="text-base">Connected apps (SDK)</CardTitle>
        <CardDescription>Each app that lets its customers reach support (the Myseed App, a website). Add the snippet to the app; mobile apps use the API or open the widget page. See docs/SUPPORT-SDK.md.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {secret && (
          <div className="rounded-lg border border-[#E8710A]/40 bg-[#E8710A]/5 p-2" data-app-secret>
            <p className="font-medium">Secret for {secret.app}: shown once. Keep it on the app&apos;s server only.</p>
            <code className="break-all">{secret.secret}</code>
            <Button size="xs" variant="ghost" onClick={() => copy(secret.secret)}>
              <CopyIcon /> Copy
            </Button>
          </div>
        )}
        {apps.map((x) => (
          <div key={x.id} className="space-y-2 rounded-lg border p-2" data-app={x.name}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{x.name}</span>
              <code className="text-xs">{x.publicKey}</code>
              <span className="text-xs text-muted-foreground">
                {x.origins.length ? x.origins.join(", ") : "any web address"} {x.verifyIdentity && "· customers signed by the app"} {!x.active && "· off"}
              </span>
              {admin && (
                <span className="ml-auto flex gap-1">
                  <Button size="xs" variant="outline" onClick={() => setA({ id: x.id, name: x.name, origins: x.origins.join(", "), queueId: x.queueId ?? "", verifyIdentity: x.verifyIdentity, greeting: x.greeting ?? "", color: x.color ?? "", active: x.active })}>
                    Edit
                  </Button>
                  <Button size="xs" variant="ghost" disabled={busy} onClick={async () => window.confirm("Make a new secret? Customers of this app sign in again.") && setSecret({ app: x.name, secret: String(await act(() => A.newAppSecretAction(x.id))) })}>
                    <KeyRoundIcon /> New secret
                  </Button>
                </span>
              )}
            </div>
            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs" data-snippet>
              {snippet(x)}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button size="xs" variant="outline" onClick={() => copy(snippet(x))}>
                <CopyIcon /> Copy the snippet
              </Button>
              <a className="text-xs text-primary hover:underline" href={`/support-widget?key=${x.publicKey}&name=Test%20customer&id=test-1`} target="_blank" rel="noreferrer">
                Try the widget as a customer
              </a>
              <Button
                size="xs"
                variant="outline"
                disabled={testing === x.id}
                data-test-connection
                onClick={async () => {
                  setTesting(x.id);
                  const r = await A.testAppAction(x.id);
                  setTesting(null);
                  if (!r.ok) return void toast.error(r.error);
                  setTests({ ...tests, [x.id]: r.data! });
                }}
              >
                Test connection
              </Button>
            </div>
            {tests[x.id] && (
              <ul className="space-y-0.5 rounded-lg border p-2 text-xs" data-test-result={tests[x.id]!.ok ? "ok" : "warn"}>
                <li className="font-medium">{tests[x.id]!.ok ? "Ready" : "Something needs attention"} ({tests[x.id]!.ms} ms)</li>
                {tests[x.id]!.lines.map((l) => (
                  <li key={l.label} className="flex gap-1.5">
                    <span className={l.ok ? "text-[var(--st-done-fg)]" : "text-[var(--st-paused-fg)]"}>{l.ok ? "✓" : "!"}</span>
                    <span>
                      <span className="font-medium">{l.label}:</span> {l.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {admin && !a && (
          <Button size="sm" variant="outline" onClick={() => setA({ id: null, name: "", origins: "", queueId: "", verifyIdentity: false, greeting: "", color: "", active: true })}>
            <PlusIcon /> Connect an app
          </Button>
        )}
        {a && (
          <div className="grid gap-2 rounded-lg border border-primary/30 p-3 sm:grid-cols-2" data-app-form>
            <Input aria-label="App name" placeholder="Myseed App" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
            <Input aria-label="Allowed web addresses" placeholder="https://app.myseed.et, https://myseed.et (empty: any)" value={a.origins} onChange={(e) => setA({ ...a, origins: e.target.value })} />
            <select aria-label="First queue" className={select} value={a.queueId} onChange={(e) => setA({ ...a, queueId: e.target.value })}>
              <option value="">Queue by keywords, else the first</option>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
            <Input aria-label="Greeting" placeholder="Greeting, e.g. Hi! How can we help with your lessons?" value={a.greeting} onChange={(e) => setA({ ...a, greeting: e.target.value })} />
            <Input aria-label="Colour" placeholder="#1A73E8" value={a.color} onChange={(e) => setA({ ...a, color: e.target.value })} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.verifyIdentity} onChange={(e) => setA({ ...a, verifyIdentity: e.target.checked })} /> The app signs who the customer is (recommended for signed-in customers)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={a.active} onChange={(e) => setA({ ...a, active: e.target.checked })} /> Active
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button
                size="sm"
                disabled={busy || !a.name.trim()}
                onClick={async () => {
                  const r = (await act(() => A.saveAppAction({ ...a, origins: a.origins.split(",").map((o) => o.trim()).filter(Boolean), queueId: a.queueId || null, color: a.color || null }), "Saved")) as { secret: string | null } | undefined;
                  if (r) {
                    if (r.secret) setSecret({ app: a.name, secret: r.secret });
                    setA(null);
                  }
                }}
              >
                Save app
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setA(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


// For developers: the customer API, with examples to copy, and a check to run from their own app.
export function DeveloperApi({ origin, appKey }: { origin: string; appKey: string | null }) {
  const key = appKey ?? "<app key>";
  const copy = (t: string) => void navigator.clipboard.writeText(t).then(() => toast.success("Copied"));
  const base = `${origin}/api/support/v1`;
  const rows: [string, string, string][] = [
    ["GET", "ping", "Checks the key and the setup. No customer needed. Use it to test the connection."],
    ["POST", "identify", "{ id, name, email, phone, hash? } gives a customer token."],
    ["GET", "tickets", "The customer's conversations."],
    ["POST", "tickets", "{ subject?, message, priority? } opens one."],
    ["GET", "tickets/<id>/messages?since=", "Messages since a time (poll every few seconds)."],
    ["POST", "tickets/<id>/messages", "{ body } replies."],
    ["POST", "tickets/<id>/rating", "{ rating: 1 to 5, comment? }"],
    ["GET", "articles?q=", "Help articles matching the words."],
    ["GET", "ice", "STUN and TURN servers for a call."],
    ["POST", "calls", "{ ticketId?, offer, consent } starts a call (WebRTC offer)."],
    ["GET", "calls/<id>", "{ status, answer, position, ivr } while it rings and once answered."],
    ["POST", "calls/<id>/ice", "{ candidate }"],
    ["POST", "calls/<id>/end", "Ends the call."],
  ];
  const curl = `curl -s ${base}/ping -H "X-App-Key: ${key}"

curl -s -X POST ${base}/identify -H "X-App-Key: ${key}" -H "Content-Type: application/json" \\
  -d '{"id":"123","name":"Abebe Kebede","email":"abebe@example.com"}'

curl -s -X POST ${base}/tickets -H "X-App-Key: ${key}" -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" -d '{"subject":"Video does not play","message":"Grade 9 Biology unit 1"}'`;
  const js = `const api = (path, body) => fetch("${base}/" + path, {
  method: body ? "POST" : "GET",
  headers: { "X-App-Key": "${key}", "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());

console.log(await api("ping"));                         // { ok: true, app, checks: [...] }
const { token } = await api("identify", { id: "123", name: "Abebe" });`;
  return (
    <Card data-developer-api>
      <CardHeader>
        <CardTitle className="text-base">Developer API</CardTitle>
        <CardDescription>For the app&apos;s developers: every request sends the app key in X-App-Key; after identify, the customer token as a Bearer token. Errors come back as {"{ error }"} with the status code. Full guide: docs/SUPPORT-SDK.md.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Base address: <code className="break-all">{base}</code>
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <tbody>
              {rows.map(([m, p, what]) => (
                <tr key={m + p} className="border-t first:border-t-0">
                  <td className="p-1.5 font-mono font-semibold">{m}</td>
                  <td className="p-1.5 font-mono whitespace-nowrap">{p}</td>
                  <td className="p-1.5 text-muted-foreground">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {[
          ["From a terminal", curl],
          ["From JavaScript", js],
        ].map(([label, code]) => (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">{label}</p>
              <Button size="xs" variant="ghost" onClick={() => copy(code!)}>
                <CopyIcon /> Copy
              </Button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{code}</pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function Canned({ list }: { list: { id: string; title: string; body: string }[] }) {
  const { act, busy } = useAct();
  const [c, setC] = React.useState({ title: "", body: "" });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Saved replies</CardTitle>
        <CardDescription>Answers agents add to a reply with one click.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {list.map((x) => (
          <div key={x.id} className="flex items-start gap-2 rounded border p-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{x.title}</p>
              <p className="whitespace-pre-wrap text-xs text-muted-foreground">{x.body}</p>
            </div>
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => act(() => A.deleteCannedAction(x.id), "Removed")}>
              Remove
            </Button>
          </div>
        ))}
        <Input aria-label="Saved reply title" placeholder="Title, e.g. Reset password" value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} />
        <Textarea aria-label="Saved reply text" placeholder="The answer" value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} />
        <Button size="sm" disabled={busy || !c.title.trim() || !c.body.trim()} onClick={async () => (await act(() => A.saveCannedAction(c), "Saved")) && setC({ title: "", body: "" })}>
          Add saved reply
        </Button>
      </CardContent>
    </Card>
  );
}

type Mon = {
  agents: { userId: string; name: string; status: string; statusSince: string | null; lastSeen: string | null; maxOpen: number; open: number; solved: number; replies: number; firstResponseMin: number | null; resolveMin: number | null; calls: number; callMin: number; missed: number; rating: number | null; ratings: number; breached: number; lastActivity: { at: string; kind: string } | null }[];
  queues: { id: string; name: string; waiting: number; oldestWaitMin: number | null; open: number; online: number; agents: number }[];
  log: { at: string; kind: string; detail: string | null; who: string | null; ticket_id: string | null; number: number | null }[];
  recordings: { id: string; ticket_id: string; number: number; agent: string | null; customer: string | null; started_at: string; duration_s: number | null; recording_size: number | null }[];
  totals: { created: number; solved: number; csat: number | null };
};

export function Monitor({ m, from, to }: { m: Mon; from: string; to: string }) {
  const router = useRouter();
  const { act } = useAct();
  const fmtMin = (n: number | null) => (n === null ? "-" : n < 60 ? `${n} min` : `${Math.round(n / 6) / 10} h`);
  return (
    <div className="space-y-4" data-support-monitor>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="mon-from">From</Label>
          <Input id="mon-from" type="date" value={from} onChange={(e) => router.push(`/support?tab=monitor&from=${e.target.value}&to=${to}`)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mon-to">To</Label>
          <Input id="mon-to" type="date" value={to} onChange={(e) => router.push(`/support?tab=monitor&from=${from}&to=${e.target.value}`)} />
        </div>
        <p className="ml-auto text-sm">
          <b>{m.totals.created}</b> tickets opened · <b>{m.totals.solved}</b> solved · customer rating <b>{m.totals.csat ?? "-"}</b> of 5
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {m.queues.map((q) => (
          <Card key={q.id}>
            <CardContent className="py-3 text-sm">
              <p className="font-medium">{q.name}</p>
              <p className={cn("text-2xl font-semibold tabular-nums", q.waiting ? "text-[#E8710A]" : "")}>{q.waiting}</p>
              <p className="text-xs text-muted-foreground">
                waiting{q.oldestWaitMin !== null ? `, oldest ${fmtMin(q.oldestWaitMin)}` : ""} · {q.open} open · {q.online} of {q.agents} agents free
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agents</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs" data-agents-table>
            <thead>
              <tr className="text-left text-muted-foreground">
                {["Agent", "Status", "Open", "Limit", "Solved", "Replies", "First answer", "Solve time", "Calls", "Missed", "Rating", "Late", "Last activity"].map((h) => (
                  <th key={h} className="py-1 pr-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.agents.map((a) => (
                <tr key={a.userId} className="border-t">
                  <td className="py-1 pr-2 font-medium">{a.name}</td>
                  <td className="pr-2">
                    <CircleIcon className={cn("mr-1 inline size-2.5 fill-current", a.status === "online" ? "text-[#188038]" : a.status === "away" ? "text-[#F9AB00]" : "text-muted-foreground")} />
                    {a.status}
                  </td>
                  <td className="pr-2 tabular-nums">{a.open}</td>
                  <td className="pr-2">
                    <Input aria-label={`Limit for ${a.name}`} type="number" className="h-6 w-14 text-xs" defaultValue={a.maxOpen} onBlur={(e) => Number(e.target.value) !== a.maxOpen && act(() => A.setAgentLimitAction(a.userId, Number(e.target.value)), "Limit saved")} />
                  </td>
                  <td className="pr-2 tabular-nums">{a.solved}</td>
                  <td className="pr-2 tabular-nums">{a.replies}</td>
                  <td className="pr-2">{fmtMin(a.firstResponseMin)}</td>
                  <td className="pr-2">{fmtMin(a.resolveMin)}</td>
                  <td className="pr-2">
                    {a.calls} ({a.callMin} min)
                  </td>
                  <td className="pr-2">{a.missed}</td>
                  <td className="pr-2">{a.rating === null ? "-" : `${a.rating} (${a.ratings})`}</td>
                  <td className={cn("pr-2", a.breached && "text-[#D93025]")}>{a.breached}</td>
                  <td className="pr-2 text-muted-foreground">{a.lastActivity ? `${a.lastActivity.kind.replace(/_/g, " ")}, ${new Date(a.lastActivity.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call recordings</CardTitle>
            <CardDescription>Each listen is logged.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {m.recordings.length === 0 && <p className="text-muted-foreground">No recordings in this period.</p>}
            {m.recordings.map((r) => (
              <div key={r.id} className="space-y-1 rounded border p-1.5">
                <p>
                  #{r.number} · {r.customer ?? "Customer"} with {r.agent ?? "-"} · {new Date(r.started_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                  {r.duration_s !== null && ` · ${Math.floor(r.duration_s / 60)}:${String(r.duration_s % 60).padStart(2, "0")}`}
                </p>
                <audio controls preload="none" src={`/api/support/recording/${r.id}`} className="h-8 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-1 overflow-y-auto text-xs" data-activity>
            {m.log.map((l, i) => (
              <p key={i}>
                <span className="text-muted-foreground">{new Date(l.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span> {l.who ?? "System"}: {l.kind.replace(/_/g, " ")}
                {l.number ? ` #${l.number}` : ""}
                {l.detail ? `, ${l.detail}` : ""}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The knowledge base: agents write, leads publish; customers search it in the app before asking
// ---------------------------------------------------------------------------

type Art = { id: string; title: string; body: string; category: string | null; keywords: string; published: boolean; views: number; helpful: number; not_helpful: number; updated_at: string };

export function KnowledgeBase({ list, lead, origin }: { list: Art[]; lead: boolean; origin: string }) {
  const { act, busy } = useAct();
  const [a, setA] = React.useState<{ id: string | null; title: string; body: string; category: string; keywords: string; published: boolean } | null>(null);
  return (
    <Card data-kb>
      <CardHeader>
        <CardTitle className="text-base">Knowledge base</CardTitle>
        <CardDescription>Answers customers find in the app before asking (and you link in replies). Agents write drafts; leads publish. Each shows how often it was read and found helpful.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {list.map((x) => (
          <div key={x.id} className="flex flex-wrap items-center gap-2 rounded border p-2" data-article={x.title}>
            <span className="flex-1">
              <span className="font-medium">{x.title}</span> {x.category && <span className="text-xs text-muted-foreground">· {x.category}</span>}
              {!x.published && <span className="ml-1 rounded bg-muted px-1 text-[10px]">draft</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {x.views} reads · {x.helpful} helpful · {x.not_helpful} not
            </span>
            {x.published && (
              <a className="text-xs text-primary hover:underline" href={`${origin}/help/${x.id}`} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
            <Button size="xs" variant="ghost" onClick={() => setA({ id: x.id, title: x.title, body: x.body, category: x.category ?? "", keywords: x.keywords, published: x.published })}>
              Edit
            </Button>
          </div>
        ))}
        {!list.length && <p className="text-muted-foreground">No articles yet. Start with the questions customers ask most.</p>}
        {a ? (
          <div className="space-y-2 rounded-lg border border-primary/30 p-2" data-article-form>
            <Input aria-label="Article title" placeholder="How do I reset my password?" value={a.title} onChange={(e) => setA({ ...a, title: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input aria-label="Category" placeholder="Category, e.g. Account" value={a.category} onChange={(e) => setA({ ...a, category: e.target.value })} />
              <Input aria-label="Keywords" placeholder="Other words people use: login, sign in, forgot" value={a.keywords} onChange={(e) => setA({ ...a, keywords: e.target.value })} />
            </div>
            <Textarea aria-label="Answer" className="min-h-40" placeholder="The answer, step by step" value={a.body} onChange={(e) => setA({ ...a, body: e.target.value })} />
            {lead && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={a.published} onChange={(e) => setA({ ...a, published: e.target.checked })} /> Published (customers see it)
              </label>
            )}
            <div className="flex gap-2">
              <Button size="sm" disabled={busy || !a.title.trim() || !a.body.trim()} onClick={async () => (await act(() => A.saveArticleAction(a), "Article saved")) && setA(null)}>
                Save article
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setA(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setA({ id: null, title: "", body: "", category: "", keywords: "", published: false })}>
            <PlusIcon /> New article
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
