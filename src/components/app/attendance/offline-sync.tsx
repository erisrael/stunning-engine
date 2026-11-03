"use client";

// Sends check-ins saved on this phone without signal (the offline page at the entrance QR, or the check-in pad when
// the network dropped) once the phone is online and the person opens the app (Phase 19).
import * as React from "react";
import { toast } from "sonner";
import { offlineCheckinAction } from "@/app/actions/attendance-capture";
import type { EventKind } from "@/lib/attendance";

const KEY = "myseed.offline-checkins";
type Saved = { kind: EventKind; at: string; code?: string | null; id: string };

export function saveOfflineCheckin(item: Omit<Saved, "id">) {
  try {
    const q = JSON.parse(localStorage.getItem(KEY) || "[]") as Saved[];
    q.push({ ...item, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` });
    localStorage.setItem(KEY, JSON.stringify(q));
    return true;
  } catch {
    return false;
  }
}

export function OfflineCheckinSync() {
  React.useEffect(() => {
    let running = false;
    const flush = async () => {
      if (running || !navigator.onLine) return;
      let q: Saved[] = [];
      try {
        q = JSON.parse(localStorage.getItem(KEY) || "[]") as Saved[];
      } catch {}
      if (!q.length) return;
      running = true;
      const left: Saved[] = [];
      let sent = 0;
      for (const item of q) {
        try {
          const r = await offlineCheckinAction({ kind: item.kind, at: item.at, code: item.code ?? null, clientId: item.id });
          if (r.ok) sent++;
          else toast.error(`A saved check-in was not taken: ${r.error}`);
        } catch {
          left.push(item);
        }
      }
      try {
        localStorage.setItem(KEY, JSON.stringify(left));
      } catch {}
      running = false;
      if (sent) toast.success(`${sent} saved ${sent === 1 ? "check-in was" : "check-ins were"} sent. HR reviews them.`);
    };
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);
  return null;
}
