import Script from "next/script";
import { getSettings } from "@/server/settings";
import { helpHome } from "@/server/support-help";
import { HelpCenter } from "./help-center";

// The customer help center: the same menu as the Telegram bot, help articles with search, and requests customers open
// and follow without an account. Opened from the bot's menu button it runs as a Telegram Mini App.
export const dynamic = "force-dynamic";
export const metadata = { title: "Help center" };

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ c?: string; from?: string }> }) {
  const [home, settings, sp] = await Promise.all([helpHome(), getSettings(), searchParams]);
  return (
    <>
      {/* Telegram's Mini App bridge: present only inside Telegram, harmless elsewhere. */}
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
      <HelpCenter home={home} brand={settings.workspace.name} startCategory={sp.c ?? null} />
    </>
  );
}
