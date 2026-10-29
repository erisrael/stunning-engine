"use client";

// Turns browser and phone push notifications on or off for this device.
// On iPhone and iPad, push works once the app is added to the Home Screen (iOS 16.4 or later).

import * as React from "react";
import { toast } from "sonner";
import { BellOffIcon, BellRingIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pushSetupAction, subscribePushAction, unsubscribePushAction } from "@/app/actions/chat";

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

type State = "unsupported" | "loading" | "off" | "on" | "blocked";

export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = React.useState<State>("loading");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    void registerServiceWorker()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return toast.error("Notifications were not allowed in this browser.");
      }
      const setup = await pushSetupAction();
      if (!setup.ok) return toast.error(setup.error);
      const reg = await registerServiceWorker();
      if (!reg) return toast.error("This browser cannot receive push notifications.");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(setup.data!.publicKey) as BufferSource });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await subscribePushAction(json);
      if (!r.ok) return toast.error(r.error);
      setState("on");
      toast.success("Notifications are on for this device");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not turn on notifications.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Notifications are off for this device");
    } finally {
      setBusy(false);
    }
  };

  if (state === "unsupported")
    return compact ? null : <p className="text-xs text-muted-foreground">This browser cannot receive push notifications. On iPhone, add the app to your Home Screen first.</p>;
  if (state === "blocked")
    return compact ? (
      <Button size="icon" variant="ghost" className="rounded-full" title="Notifications are blocked in this browser's site settings" disabled>
        <BellOffIcon />
      </Button>
    ) : (
      <p className="text-xs text-muted-foreground">Notifications are blocked for this site. Allow them in the browser&apos;s site settings, then reload.</p>
    );
  if (compact)
    return (
      <Button
        size="icon"
        variant="ghost"
        className="rounded-full"
        disabled={busy || state === "loading"}
        onClick={state === "on" ? turnOff : turnOn}
        aria-label={state === "on" ? "Turn off push notifications" : "Turn on push notifications"}
        title={state === "on" ? "Push notifications are on for this device" : "Get messages and alerts as push notifications"}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : state === "on" ? <BellRingIcon className="text-primary" /> : <BellOffIcon />}
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={state === "on" ? "outline" : "default"} disabled={busy || state === "loading"} onClick={state === "on" ? turnOff : turnOn}>
        {busy ? <Loader2Icon className="animate-spin" /> : state === "on" ? <BellOffIcon /> : <BellRingIcon />}
        {state === "on" ? "Turn off on this device" : "Turn on push notifications"}
      </Button>
      <span className="text-xs text-muted-foreground">{state === "on" ? "On for this device." : "Alerts and chat messages appear even when the app is closed."}</span>
    </div>
  );
}
