import Script from "next/script";
import { SupportWidget } from "./widget";

// The customer's side of customer support, opened by the SDK (public/support-sdk.js) in a frame inside the app, or
// by a mobile app in a web view: /support-widget?key=<app key>&id=&name=&email=&phone=&hash=. The SDK can also send
// who the customer is by postMessage, so it stays out of the address. Inside Telegram (the bot's support app, a
// Mini App): /support-widget?tg=<bot> signs in with Telegram's signed data; &call=1 opens on calling support;
// &call=in (the bot's "is calling you" notice) opens on the ringing call.
export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="h-dvh bg-background">
      {/* Telegram's own script for Mini Apps (ready, full height, theme), only inside Telegram. */}
      {sp.tg && <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />}
      <SupportWidget appKey={sp.key ?? ""} telegram={sp.tg ?? null} startCall={sp.call === "1"} incomingCall={sp.call === "in"} initialUser={sp.id || sp.name || sp.email ? { id: sp.id ?? null, name: sp.name ?? null, email: sp.email ?? null, phone: sp.phone ?? null, hash: sp.hash ?? null } : null} waitForParent={sp.embed === "1"} />
    </div>
  );
}
