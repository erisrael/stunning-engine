"use client";

// Connected systems (Customer support, Connected systems): per system its description, channel switches, its own
// Telegram bot, the outgoing webhook with its signing secret, and last week's traffic. Keys stay on Apps and SDK.
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BotIcon, CopyIcon, KeyRoundIcon, Loader2Icon, WebhookIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import * as A from "@/app/actions/support-desk";
import { cn } from "@/lib/utils";

type Channel = "web_chat" | "telegram" | "calls" | "sms";
type System = {
  id: string;
  name: string;
  publicKey: string;
  active: boolean;
  description: string;
  channels: Record<Channel, boolean>;
  bot: string | null;
  callEngine: "browser" | "phone";
  callPhone: string;
  webhookUrl: string;
  webhookEvents: string[];
  webhookSecretSet: boolean;
  webhookLast: { event: string; status: number; ok: boolean; at: string } | null;
  tickets7: number;
  open: number;
  byChannel: Record<string, number>;
};
const CHANNELS: { key: Channel; label: string; hint: string }[] = [
  { key: "web_chat", label: "Web chat", hint: "Widget and SDK conversations" },
  { key: "telegram", label: "Telegram chat", hint: "Messages to this system's bot" },
  { key: "calls", label: "Calls", hint: "Customers call from the widget" },
  { key: "sms", label: "SMS", hint: "Agents text this system's customers" },
];
const EVENTS = ["ticket.created", "ticket.replied", "ticket.solved"];

export function Systems({ systems, unattached, admin, origin }: { systems: System[]; unattached: { tickets7: number; byChannel: Record<string, number> }; admin: boolean; origin: string }) {
  if (!systems.length)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">No connected systems yet</CardTitle>
          <CardDescription>Connect an app on the Apps and SDK tab first; it then appears here with its channels, bot and webhook.</CardDescription>
        </CardHeader>
      </Card>
    );
  return (
    <div className="space-y-4" data-systems>
      <p className="text-sm text-muted-foreground">
        Each system has its own keys (Apps and SDK), channels, Telegram bot and webhook. All tickets arrive in the one desk, in each system&apos;s queue. Last 7 days without a system (email, default bot): {unattached.tickets7} tickets.
      </p>
      {systems.map((s) => (
        <SystemCard key={s.id} s={s} admin={admin} origin={origin} />
      ))}
    </div>
  );
}

// How this system's customers call: in the browser (to agents in the desk), or a phone number (the widget shows it
// with "Ask us to call you").
function CallEngine({ s, admin }: { s: System; admin: boolean }) {
  const router = useRouter();
  const [engine, setEngine] = React.useState(s.callEngine);
  const [phone, setPhone] = React.useState(s.callPhone);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm" data-call-engine>
      <span className="font-medium">Calls</span>
      <select aria-label={`How ${s.name}'s customers call`} disabled={!admin} className="h-8 rounded-md border bg-background px-2 text-sm" value={engine} onChange={(e) => setEngine(e.target.value as System["callEngine"])}>
        <option value="browser">In the browser, to agents in the desk</option>
        <option value="phone">A phone number</option>
      </select>
      {engine === "phone" && <Input aria-label="Phone number customers call" placeholder="+251 11 ..." className="h-8 w-48" disabled={!admin} value={phone} onChange={(e) => setPhone(e.target.value)} />}
      {admin && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || (engine === s.callEngine && phone === s.callPhone)}
          onClick={async () => {
            setBusy(true);
            const r = await A.saveCallEngineAction(s.id, { engine, phone });
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Saved");
            router.refresh();
          }}
        >
          Save
        </Button>
      )}
      <span className="text-xs text-muted-foreground">Customers can always ask for a call-back; it waits on the Calls tab.</span>
    </div>
  );
}

function SystemCard({ s, admin, origin }: { s: System; admin: boolean; origin: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [desc, setDesc] = React.useState(s.description);
  const [channels, setChannels] = React.useState(s.channels);
  const [url, setUrl] = React.useState(s.webhookUrl);
  const [events, setEvents] = React.useState(s.webhookEvents);
  const [token, setToken] = React.useState("");
  const [secret, setSecret] = React.useState<string | null>(null);
  const run = async <T,>(key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: T }>, ok: string) => {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return void toast.error(r.error ?? "Failed");
    toast.success(ok);
    router.refresh();
    return r.data;
  };
  const save = async () => {
    const d = await run("save", () => A.saveSystemAction(s.id, { description: desc, channels, webhookUrl: url, webhookEvents: events }), "System saved");
    if (d && d.webhookSecret) setSecret(d.webhookSecret);
  };
  const copy = (v: string) => navigator.clipboard?.writeText(v).then(() => toast.success("Copied"));
  return (
    <Card data-system={s.name}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {s.name}
          {!s.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">switched off</span>}
          <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums" data-system-traffic>
            {s.tickets7} tickets in 7 days · {s.open} open
            {Object.keys(s.byChannel).length ? ` · ${Object.entries(s.byChannel).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}
          </span>
        </CardTitle>
        <CardDescription className="font-mono text-xs">{s.publicKey}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor={`desc-${s.id}`} className="text-xs">What it is</Label>
          <Input id={`desc-${s.id}`} value={desc} disabled={!admin} onChange={(e) => setDesc(e.target.value)} placeholder="MySeed Academy: students and parents" />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-system-channels>
          {CHANNELS.map((c) => (
            <label key={c.key} className="flex items-start gap-2 rounded-lg border p-2.5">
              <Switch checked={channels[c.key]} disabled={!admin} onCheckedChange={(v) => setChannels({ ...channels, [c.key]: v })} aria-label={`${c.label} for ${s.name}`} />
              <span className="text-sm">
                {c.label}
                <span className="block text-xs text-muted-foreground">{c.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {channels.calls && <CallEngine s={s} admin={admin} />}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border p-3" data-system-bot>
            <p className="flex items-center gap-2 text-sm font-medium">
              <BotIcon className="size-4 text-muted-foreground" /> Telegram bot
            </p>
            {s.bot ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>@{s.bot}</span>
                <span className="text-xs text-muted-foreground">Its messages become {s.name} tickets; replies go back through it.</span>
                {admin && (
                  <Button size="sm" variant="outline" className="ml-auto" disabled={!!busy} onClick={() => run("bot", () => A.disconnectSystemBotAction(s.id), "Bot disconnected")}>
                    Disconnect
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">Without its own bot, this system&apos;s customers use the default bot (Telegram tab). Make a bot with @BotFather and paste its token.</p>
                {admin && (
                  <div className="flex gap-2">
                    <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC..." aria-label={`Bot token for ${s.name}`} />
                    <Button size="sm" disabled={!!busy || !token.trim()} onClick={() => run("bot", () => A.connectSystemBotAction(s.id, token), "Bot connected").then(() => setToken(""))}>
                      {busy === "bot" && <Loader2Icon className="animate-spin" />} Connect
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-2 rounded-lg border p-3" data-system-webhook>
            <p className="flex items-center gap-2 text-sm font-medium">
              <WebhookIcon className="size-4 text-muted-foreground" /> Webhook to this system
            </p>
            <Input value={url} disabled={!admin} onChange={(e) => setUrl(e.target.value)} placeholder="https://academy.example/hooks/support" aria-label={`Webhook for ${s.name}`} />
            <div className="flex flex-wrap gap-3">
              {EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" disabled={!admin} checked={events.includes(e)} onChange={(x) => setEvents(x.target.checked ? [...events, e] : events.filter((y) => y !== e))} />
                  {e}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Signed: X-Myseed-Signature = sha256 HMAC of the body with the secret.
              {s.webhookLast && (
                <span className={cn("ml-1", s.webhookLast.ok ? "text-emerald-600" : "text-destructive")} data-webhook-last>
                  Last: {s.webhookLast.event} answered {s.webhookLast.status || "no answer"}.
                </span>
              )}
            </p>
            {secret && (
              <div className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 font-mono text-xs" data-webhook-secret>
                <span className="min-w-0 flex-1 truncate">{secret}</span>
                <Button size="icon-xs" variant="ghost" aria-label="Copy the secret" onClick={() => copy(secret)}>
                  <CopyIcon />
                </Button>
              </div>
            )}
            {admin && s.webhookSecretSet && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => setSecret((await run("secret", () => A.newWebhookSecretAction(s.id), "New secret made: copy it now")) ?? null)}>
                <KeyRoundIcon /> New secret
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Customer sync for this system&apos;s server: POST {origin}/api/support/v1/customers/sync with X-App-Key and X-App-Secret, body {"{ customers: [{ id, name, email, phone }] }"}.
        </p>
        {admin && (
          <Button size="sm" disabled={!!busy} onClick={save} data-save-system>
            {busy === "save" && <Loader2Icon className="animate-spin" />} Save
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
