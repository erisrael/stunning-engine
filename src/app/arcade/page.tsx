import { FUN_GAMES } from "@/server/fun";
import { guestArcade, guestHome } from "@/server/fun-world";
import { Arcade } from "./arcade";

// The guest arcade: Seed Town and the arcade games for visitors without an account, in an arcade machine. Nothing
// links out of it; in the Windows app's kiosk mode and the Android app it cannot be left. Admin switches it off
// (Admin, Fun mode, Guest arcade).
export const metadata = { title: "Myseed Arcade", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ArcadePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const a = await guestArcade().catch(() => null);
  const home = a?.world ? await guestHome().catch(() => null) : null;
  const kiosk = sp.kiosk === "1" || sp.app === "android" || sp.app === "desktop";
  // The games Admin has on (Learn chess needs an account: its puzzles come through the server).
  const games = FUN_GAMES.filter((g) => g.key !== "world" && g.key !== "chess-learn" && (a?.games ?? []).includes(g.key)).map((g) => ({ key: g.key as string, label: g.label as string, note: g.note as string }));
  return <Arcade open={!!a} games={games} home={home} kiosk={kiosk} />;
}
