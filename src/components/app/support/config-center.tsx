"use client";

// Customer support's configuration center (Update 1.2, spec 14.2): every area with its state and where it is
// managed, and the settings that live here: business hours and holidays, escalation rules, notifications, chat.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CircleAlertIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { saveCenterConfigAction } from "@/app/actions/support-center";
import type { CenterConfig, Weekday } from "@/server/support-center";

type Area = { key: string; label: string; state: string; ok: boolean; href: string };
type Status = { open: boolean; reason: "hours" | "holiday" | null; holiday: string | null; nextOpen: string | null };
const DAYS: [Weekday, string][] = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const save = async (part: string, input: Partial<CenterConfig>) => {
    setBusy(part);
    const r = await saveCenterConfigAction(input);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Saved");
    router.refresh();
  };
  return { busy, save };
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-0.5" />
      <span>
        <b className="font-medium">{label}</b>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

export function ConfigCenter({ areas, config, status }: { areas: Area[]; config: CenterConfig; status: Status }) {
  const { busy, save } = useSave();
  const [sch, setSch] = React.useState(config.schedule);
  const [esc, setEsc] = React.useState({ ...config.escalation, words: config.escalation.keywords.join(", ") });
  const [nt, setNt] = React.useState(config.notifications);
  const [chat, setChat] = React.useState(config.chat);
  const [hol, setHol] = React.useState({ date: "", name: "" });
  const setDay = (d: Weekday, v: { open: string; close: string } | null) => setSch({ ...sch, days: { ...sch.days, [d]: v } });
  return (
    <div className="space-y-4" data-config-center>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuration center</CardTitle>
          <CardDescription>Every part of customer support that can be set up, how it is set now, and where to change it.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {areas.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex h-full items-start gap-2 rounded-xl border bg-card p-3 text-sm transition-colors hover:bg-muted/60" data-config-area={a.key}>
                  {a.ok ? <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600" />}
                  <span className="min-w-0">
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.state}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card id="hours" data-config-hours>
        <CardHeader>
          <CardTitle className="text-base">Business hours and holidays</CardTitle>
          <CardDescription>
            When support is open, in Addis Ababa time. Outside these hours and on holidays, a new conversation is answered at once with the closed message and when support opens; the app shows the week and the coming holidays.{" "}
            <span className={cn("font-medium", status.open ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700")} data-open-now={status.open ? "open" : "closed"}>
              {sch.on ? (status.open ? "Open now." : status.holiday ? `Closed now: ${status.holiday}.` : "Closed now.") : ""}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Toggle label="Use business hours" hint="Off: support is treated as always open, and the opening hours text in Settings is only shown." checked={sch.on} onChange={(v) => setSch({ ...sch, on: v })} />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {DAYS.map(([d, label]) => {
              const h = sch.days[d];
              return (
                <div key={d} className={cn("space-y-2 rounded-lg border p-2", !h && "bg-muted/40")} data-day={d}>
                  <label className="flex items-center justify-between gap-2">
                    <span className="font-medium">{label}</span>
                    <Switch checked={!!h} aria-label={`Open on ${label}`} disabled={!sch.on} onCheckedChange={(v) => setDay(d, v ? { open: "08:30", close: "17:30" } : null)} />
                  </label>
                  {h ? (
                    <div className="flex items-center gap-1">
                      <Input type="time" aria-label={`${label} opens`} className="h-8" disabled={!sch.on} value={h.open} onChange={(e) => setDay(d, { ...h, open: e.target.value })} />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input type="time" aria-label={`${label} closes`} className="h-8" disabled={!sch.on} value={h.close} onChange={(e) => setDay(d, { ...h, close: e.target.value })} />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Closed</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            <Label>Support holidays</Label>
            <ul className="space-y-1" data-holidays>
              {sch.holidays.map((h) => (
                <li key={h.date} className="flex items-center gap-2 rounded-md border px-2 py-1" data-holiday={h.date}>
                  <span className="w-28 tabular-nums">{h.date}</span>
                  <span className="flex-1">{h.name}</span>
                  <Button size="icon-xs" variant="ghost" aria-label={`Remove ${h.name}`} onClick={() => setSch({ ...sch, holidays: sch.holidays.filter((x) => x.date !== h.date) })}>
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
              {!sch.holidays.length && <li className="text-xs text-muted-foreground">None of support&apos;s own.</li>}
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" aria-label="Holiday date" className="h-8 w-40" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
              <Input aria-label="Holiday name" placeholder="Name, e.g. Meskel" className="h-8 w-52" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
              <Button
                size="sm"
                variant="outline"
                disabled={!hol.date}
                onClick={() => {
                  setSch({ ...sch, holidays: [...sch.holidays.filter((x) => x.date !== hol.date), { date: hol.date, name: hol.name.trim() || "Holiday" }].sort((a, b) => a.date.localeCompare(b.date)) });
                  setHol({ date: "", name: "" });
                }}
                data-holiday-add
              >
                <PlusIcon /> Add
              </Button>
            </div>
            <Toggle label="The workspace's holidays too" hint="The holidays in Settings, Calendar and alerts close support as well." checked={sch.companyHolidays} onChange={(v) => setSch({ ...sch, companyHolidays: v })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cc-closed">Closed message</Label>
            <Textarea id="cc-closed" rows={2} value={sch.closedMessage} onChange={(e) => setSch({ ...sch, closedMessage: e.target.value })} />
            <p className="text-xs text-muted-foreground">The time support opens is added after it.</p>
          </div>
          <Button disabled={busy === "hours"} onClick={() => save("hours", { schedule: sch })} data-save-hours>
            Save hours and holidays
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="escalation" data-config-escalation>
          <CardHeader>
            <CardTitle className="text-base">Escalation rules</CardTitle>
            <CardDescription>A conversation is escalated by itself when a rule matches: marked escalated, raised to high priority, and the support leads told. Agents can still escalate by hand.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Toggle label="When a target is missed" hint="The first answer or the resolution came too late." checked={esc.onBreach} onChange={(v) => setEsc({ ...esc, onBreach: v })} />
            <Toggle label="When the customer rates the help 1 or 2" hint="So a lead looks at what went wrong." checked={esc.lowRating} onChange={(v) => setEsc({ ...esc, lowRating: v })} />
            <div className="space-y-1">
              <Label htmlFor="cc-words">When the customer writes one of these words</Label>
              <Input id="cc-words" placeholder="fraud, lawyer, police, stolen" value={esc.words} onChange={(e) => setEsc({ ...esc, words: e.target.value })} />
              <p className="text-xs text-muted-foreground">Comma separated, whole words, any language (for example ማጭበርበር).</p>
            </div>
            <Button disabled={busy === "escalation"} onClick={() => save("escalation", { escalation: { onBreach: esc.onBreach, lowRating: esc.lowRating, keywords: esc.words.split(",").map((x) => x.trim()).filter(Boolean) } })} data-save-escalation>
              Save escalation rules
            </Button>
          </CardContent>
        </Card>

        <Card id="notifications" data-config-notifications>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription>Who is told what. Agents are always told about their own conversations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Toggle label="Leads: missed targets" hint="Each conversation that misses its first-answer or resolution target, once." checked={nt.breachToLeads} onChange={(v) => setNt({ ...nt, breachToLeads: v })} />
            <Toggle label="Leads: conversations waiting" hint="A new conversation no agent is free to take." checked={nt.waitingToLeads} onChange={(v) => setNt({ ...nt, waitingToLeads: v })} />
            <Toggle label="Customers: request updates" hint="The customer is told in their conversation (and so in Telegram or by email) when a request raised for them is passed on, taken on, resolved or not approved." checked={nt.requestUpdatesToCustomer} onChange={(v) => setNt({ ...nt, requestUpdatesToCustomer: v })} />
            <Button disabled={busy === "notifications"} onClick={() => save("notifications", { notifications: nt })} data-save-notifications>
              Save notifications
            </Button>
          </CardContent>
        </Card>

        <Card id="chat" data-config-chat>
          <CardHeader>
            <CardTitle className="text-base">Chat</CardTitle>
            <CardDescription>What customers may send in a conversation, in the app, the widget and the Mini App.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Toggle label="Files and photos" hint="Screenshots of a payment, documents." checked={chat.customerFiles} onChange={(v) => setChat({ ...chat, customerFiles: v })} />
            <Toggle label="Voice notes" hint="Recorded in the app." checked={chat.voiceNotes} onChange={(v) => setChat({ ...chat, voiceNotes: v })} />
            <div className="w-48 space-y-1">
              <Label htmlFor="cc-mb">Largest file (MB, up to 10)</Label>
              <Input id="cc-mb" type="number" min={1} max={10} value={chat.maxFileMb} onChange={(e) => setChat({ ...chat, maxFileMb: Number(e.target.value) })} />
            </div>
            <Button disabled={busy === "chat"} onClick={() => save("chat", { chat })} data-save-chat>
              Save chat settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
