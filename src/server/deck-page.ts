// What a deck page needs: the slides (since the deck's last meeting when it has one), saved and ready decks, people
// for actions and weekly email, and whether this person can share.
import type { AppUser } from "./users";
import * as d from "./decks";
import { userDirectory } from "./users";

export async function deckPage(user: AppUser, scope: string, deckId: string | null) {
  const decks = await d.listDecks(user, scope);
  const deck = deckId ? (decks.find((x) => x.id === deckId) ?? null) : null;
  const { title, slides } = await d.slidesFor(user, scope, { since: deck?.lastMeetingAt ?? null });
  const people = (await userDirectory()).map((u) => ({ id: u.id, name: u.name }));
  let canShare = false;
  try {
    if (scope === "company") canShare = d.seesCompanyDeck(user);
    else {
      const { workAccess } = await import("./dept-config");
      const a = await workAccess(user, scope.slice(5));
      canShare = a.rights.projects || a.rights.configure || a.rights.seeAll;
    }
  } catch {}
  return { title, slides, decks, deckId: deck?.id ?? null, ready: d.readyDecks(scope, slides.map((s) => s.key)), people, canShare };
}
