import { SupportApp } from "./support-app";

// The support app on the web, for customers outside Telegram and outside the MySeed app: sign in with Telegram
// (Telegram's free Login Widget; the same conversations as in the bot) or continue as a guest with a phone number,
// which is matched to the students' and parents' records for the agent. Then the same app as inside Telegram.
export const dynamic = "force-dynamic";
export const metadata = { title: "Support", description: "Talk to our support team: chat, call and follow your requests." };

export default function Page() {
  return (
    <div className="h-dvh bg-background">
      <SupportApp />
    </div>
  );
}
