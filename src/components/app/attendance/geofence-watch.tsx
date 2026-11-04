"use client";

// While someone is checked in and their workspace handles leaving the site (Attendance, Capture), the phone reports
// where it is now and then, and the server decides. The person agrees once on this device; they can stop it in
// Settings. Location is only read while checked in, and only while the app is open: phones stop web apps in the
// background, so the last reading counts.

import * as React from "react";
import { toast } from "sonner";
import { MapPinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { geofenceStatusAction, geofenceTickAction } from "@/app/actions/geofence";
import type { GeofenceStatus } from "@/server/geofence";

export const GEO_KEY = "myseed.geofence";
type Consent = "yes" | "no" | null;
export const readConsent = (): Consent => {
  try {
    const v = localStorage.getItem(GEO_KEY);
    return v === "yes" || v === "no" ? v : null;
  } catch {
    return null;
  }
};
export const writeConsent = (v: Consent) => {
  try {
    if (v) localStorage.setItem(GEO_KEY, v);
    else localStorage.removeItem(GEO_KEY);
  } catch {}
  window.dispatchEvent(new Event("myseed-geofence"));
};

function systemNotice(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") new Notification(title, { body, icon: "/icon-192.png", tag: "geofence" });
  } catch {}
}

export function GeofenceWatch() {
  const [status, setStatus] = React.useState<GeofenceStatus | null>(null);
  const [consent, setConsent] = React.useState<Consent>(null);
  const [asking, setAsking] = React.useState(false);
  const last = React.useRef(0);
  const warned = React.useRef<string | null>(null);
  const acted = React.useRef<string | null>(null);

  const refresh = React.useCallback(async () => {
    const r = await geofenceStatusAction().catch(() => null);
    if (r?.ok && r.data) setStatus(r.data);
  }, []);

  React.useEffect(() => {
    setConsent(readConsent());
    void refresh();
    const onChange = () => (setConsent(readConsent()), void refresh());
    window.addEventListener("myseed-geofence", onChange);
    window.addEventListener("myseed-checkin", onChange);
    // Checking in elsewhere (the kiosk, a lead) is noticed within a few minutes.
    const t = setInterval(() => document.visibilityState === "visible" && void refresh(), 3 * 60e3);
    const vis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("myseed-geofence", onChange);
      window.removeEventListener("myseed-checkin", onChange);
      document.removeEventListener("visibilitychange", vis);
      clearInterval(t);
    };
  }, [refresh]);

  const watching = !!status?.watch && consent === "yes" && typeof navigator !== "undefined" && !!navigator.geolocation;

  // Ask once on this device, the first time it matters (checked in, and the workspace uses it).
  React.useEffect(() => {
    if (status?.watch && consent === null) setAsking(true);
  }, [status?.watch, consent]);

  React.useEffect(() => {
    if (!watching || !status) return;
    const every = Math.max(15, status.intervalSec) * 1000;
    const send = async (p: GeolocationPosition) => {
      if (Date.now() - last.current < every - 2000) return;
      last.current = Date.now();
      const r = await geofenceTickAction({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }).catch(() => null);
      if (!r?.ok || !r.data) return;
      const s = r.data;
      if (s.warnedAt && warned.current !== s.warnedAt) {
        warned.current = s.warnedAt;
        const body = s.mode === "notify" ? "Check out or start a break if you are leaving." : s.actsAt ? `Come back before ${new Date(s.actsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, or the app acts for you.` : "";
        toast.warning(`You left ${s.site}`, { description: body, duration: 15000 });
        systemNotice(`You left ${s.site}`, body);
      }
      if (s.acted && acted.current !== s.acted) {
        acted.current = s.acted;
        const t = s.acted === "out" ? "You were checked out" : "Your break started";
        toast(t, { description: `You are away from ${s.site}.` });
        systemNotice(t, `You are away from ${s.site}.`);
      }
      if (!s.acted) acted.current = null;
      if (!s.warnedAt) warned.current = null;
      setStatus(s);
    };
    const id = navigator.geolocation.watchPosition((p) => void send(p), () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 });
    // A position now and then even when the phone does not move (watchPosition only reports changes).
    const t = setInterval(() => navigator.geolocation.getCurrentPosition((p) => void send(p), () => {}, { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 }), every);
    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(t);
    };
  }, [watching, status]);

  if (!asking) return null;
  return (
    <div data-geofence-ask className="no-print fixed inset-x-3 bottom-20 z-[60] mx-auto max-w-md rounded-2xl border bg-popover p-3 text-sm shadow-xl md:bottom-4">
      <p className="flex items-center gap-2 font-medium">
        <MapPinIcon className="size-4 text-primary" /> Check you out when you leave?
      </p>
      <p className="mt-1 text-muted-foreground">
        While you are checked in, your workspace uses this phone&apos;s location to {status?.mode === "notify" ? "remind you to check out" : status?.mode === "checkout" ? "check you out" : "start a break"} if you leave the site. It is only read while you are checked in and the app is open. You can change this in Settings.
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => (writeConsent("no"), setAsking(false))}>
          Not on this phone
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setAsking(false);
            navigator.geolocation?.getCurrentPosition(
              () => writeConsent("yes"),
              () => (writeConsent("no"), toast.error("Location is blocked for this site. Allow it in the browser to use this.")),
              { enableHighAccuracy: true, timeout: 20000 },
            );
          }}
        >
          Allow location
        </Button>
      </div>
    </div>
  );
}
