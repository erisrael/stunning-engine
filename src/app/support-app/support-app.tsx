"use client";
import * as React from "react";
import { Loader2Icon, MessageCircleIcon, PhoneIcon, ShieldCheckIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SupportWidget, type Session } from "../support-widget/widget";
import { useLook } from "../support-widget/look";

type Info = { enabled: boolean; bot: string | null; guest: boolean };
type Saved = { kind: "telegram"; data: Record<string, unknown> } | { kind: "guest"; device: string; name: string; phone: string };
const KEY = "myseed-support-app";
const read = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
const save = (v: Saved | null) => {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {}
};
const device = () => {
  try {
    const d = localStorage.getItem("myseed-support-device") ?? `d${crypto.randomUUID().replace(/-/g, "")}`;
    localStorage.setItem("myseed-support-device", d);
    return d;
  } catch {
    return `d${crypto.randomUUID().replace(/-/g, "")}`;
  }
};

async function signIn(body: unknown): Promise<{ key: string; session: Session }> {
  const r = await fetch("/api/support/web-login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as { key?: string; session?: Session; error?: string };
  if (!r.ok || !j.key || !j.session) throw new Error(j.error ?? "Sign-in failed.");
  return { key: j.key, session: j.session };
}

// Telegram's Login Widget: its script draws the button and calls back with the signed data.
function TelegramLogin({ bot, onAuth }: { bot: string; onAuth: (d: Record<string, unknown>) => void }) {
  const box = React.useRef<HTMLDivElement>(null);
  const cb = React.useRef(onAuth);
  cb.current = onAuth;
  React.useEffect(() => {
    const w = window as unknown as { onMyseedTelegramAuth?: (u: Record<string, unknown>) => void };
    w.onMyseedTelegramAuth = (u) => cb.current(u);
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.dataset.telegramLogin = bot;
    s.dataset.size = "large";
    s.dataset.radius = "12";
    s.dataset.onauth = "onMyseedTelegramAuth(user)";
    s.dataset.requestAccess = "write";
    box.current?.replaceChildren(s);
    return () => {
      delete w.onMyseedTelegramAuth;
    };
  }, [bot]);
  return <div ref={box} className="flex min-h-12 justify-center" data-telegram-login />;
}

export function SupportApp() {
  const [info, setInfo] = React.useState<Info | null>(null);
  const [signed, setSigned] = React.useState<{ key: string; session: Session } | null>(null);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [guest, setGuest] = React.useState({ name: "", phone: "" });
  const [asGuest, setAsGuest] = React.useState(false);
  useLook(null, false);

  React.useEffect(() => {
    (async () => {
      const i = (await fetch("/api/support/web-login", { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as Info | null;
      setInfo(i ?? { enabled: false, bot: null, guest: false });
      const saved = read();
      if (saved && i?.enabled) {
        try {
          setSigned(await signIn(saved.kind === "telegram" ? { telegram: saved.data } : { guest: { device: saved.device, name: saved.name, phone: saved.phone } }));
        } catch (e) {
          save(null);
          setError(e instanceof Error ? e.message : null);
        }
      }
      setBusy(false);
    })();
  }, []);

  const go = async (v: Saved) => {
    setBusy(true);
    setError(null);
    try {
      setSigned(await signIn(v.kind === "telegram" ? { telegram: v.data } : { guest: { device: v.device, name: v.name, phone: v.phone } }));
      save(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  if (signed)
    return (
      <SupportWidget
        appKey={signed.key}
        preset={signed}
        initialUser={null}
        waitForParent={false}
        onSignOut={() => {
          save(null);
          setSigned(null);
        }}
      />
    );
  if (busy && !info)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (info && !info.enabled) return <p className="p-6 text-center text-sm text-muted-foreground">Support is not available right now.</p>;
  return (
    <main className="mx-auto flex h-full max-w-md flex-col justify-center gap-6 overflow-y-auto px-5 py-8" data-support-signin>
      <div className="space-y-3 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
          <MessageCircleIcon className="size-7" />
        </span>
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-sm text-muted-foreground">Chat with our team, call us, and follow your requests. ድጋፍ ቡድናችንን ያነጋግሩ።</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
        <span className="flex flex-col items-center gap-1 rounded-xl border bg-card p-2"><MessageCircleIcon className="size-4 text-primary" />Chat</span>
        <span className="flex flex-col items-center gap-1 rounded-xl border bg-card p-2"><PhoneIcon className="size-4 text-primary" />Calls</span>
        <span className="flex flex-col items-center gap-1 rounded-xl border bg-card p-2"><ShieldCheckIcon className="size-4 text-primary" />Private</span>
      </div>
      {error && <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{error}</p>}
      {!asGuest ? (
        <div className="space-y-4">
          {info?.bot && (
            <section className="space-y-2 rounded-2xl border bg-card p-4 text-center shadow-xs">
              <p className="text-sm font-medium">Sign in with Telegram</p>
              <p className="text-xs text-muted-foreground">Your conversations with our Telegram bot are here too.</p>
              <TelegramLogin bot={info.bot} onAuth={(data) => void go({ kind: "telegram", data })} />
            </section>
          )}
          <Button variant="outline" className="h-11 w-full rounded-xl" onClick={() => setAsGuest(true)} data-guest-start>
            <UserIcon /> Continue as a guest
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs"
          onSubmit={(e) => {
            e.preventDefault();
            void go({ kind: "guest", device: device(), name: guest.name.trim(), phone: guest.phone.trim() });
          }}
          data-guest-form
        >
          <p className="text-sm font-medium">Continue as a guest</p>
          <p className="text-xs text-muted-foreground">Your phone number helps us find your student or parent account. We do not share it.</p>
          <div className="space-y-1">
            <Label htmlFor="g-name">Your name</Label>
            <Input id="g-name" autoComplete="name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} required minLength={2} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="g-phone">Phone number</Label>
            <Input id="g-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="09…" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} required />
          </div>
          <div className="flex gap-2">
            <Button type="submit" className="h-11 flex-1 rounded-xl" disabled={busy} data-guest-submit>
              {busy ? <Loader2Icon className="animate-spin" /> : null} Start
            </Button>
            <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={() => setAsGuest(false)}>
              Back
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
