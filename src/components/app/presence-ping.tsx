"use client";

// Tells the server this person has the app open (every minute, and at once when the page is hidden or shown again),
// for the live roster on Admin's home. Sends nothing else.
import * as React from "react";
import { pingPresenceAction } from "@/app/actions/presence";

export function PresencePing() {
  React.useEffect(() => {
    const ping = () => void pingPresenceAction(document.visibilityState === "visible").catch(() => null);
    ping();
    const t = setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
  return null;
}
