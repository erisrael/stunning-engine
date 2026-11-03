import { openShare } from "@/server/decks";
import { SharedDeck } from "@/components/app/deck/deck-client";

// A presentation shared by link (Phase 12c): a read-only copy of the slides as they were when shared, until the
// link's end date. No sign-in needed.
export const dynamic = "force-dynamic";
export const metadata = { title: "Presentation", robots: { index: false } };

export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) {
  const s = await openShare((await params).token);
  if (!s)
    return (
      <div className="flex h-dvh items-center justify-center p-6 text-center text-muted-foreground">
        <p>This presentation link has ended or was stopped. Ask the person who shared it for a new one.</p>
      </div>
    );
  return <SharedDeck title={s.name} slides={s.slides} theme={s.theme} />;
}
