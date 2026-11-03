"use client";

// The player with the studio's actions (saved decks, meetings, share links).
import * as A from "@/app/actions/decks";
import { DeckPlayer, PresenterView } from "./deck-player";

type P = Omit<Parameters<typeof DeckPlayer>[0], "actions"> & { presenter?: boolean };

export function Deck(p: P) {
  if (p.presenter) return <PresenterView scope={p.scope} slides={p.slides} />;
  return <DeckPlayer {...p} actions={{ save: A.saveDeckAction, remove: A.deleteDeckAction, endMeeting: A.endMeetingAction, share: A.shareDeckAction, remote: A.createRemoteAction }} />;
}

export function SharedDeck(p: Pick<P, "title" | "slides" | "theme">) {
  return <DeckPlayer scope="shared" title={p.title} slides={p.slides} theme={p.theme} back="/" readOnly />;
}
