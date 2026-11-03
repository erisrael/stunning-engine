// The presentation studio (Phase 12c): slides as plain data, so one player shows them for any department or the
// company, a share link can keep a copy, and they export to PowerPoint and PDF.

export type Tone = "good" | "bad" | "neutral";
export type BigNumber = { label: string; value: number; unit?: string; tone?: Tone; hint?: string };
export type Series = { key: string; label: string };

export type SlideBody =
  | { kind: "numbers"; items: BigNumber[] }
  | { kind: "bars"; data: Record<string, string | number | null>[]; x: string; series: Series[]; stacked?: boolean; unit?: string }
  | { kind: "lines"; data: Record<string, string | number | null>[]; x: string; series: Series[]; unit?: string }
  | { kind: "stages"; items: { label: string; value: number; late?: number; color?: string }[] }
  | { kind: "progress"; items: { label: string; value: number; tag?: string; tone?: Tone }[] }
  | { kind: "list"; items: { text: string; meta?: string }[]; empty?: string }
  | { kind: "table"; columns: string[]; rows: (string | number)[][] }
  | { kind: "text"; text: string }
  // Slides written by hand (Phase 24).
  | { kind: "section"; subtitle?: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "quote"; text: string; by?: string }
  | { kind: "image"; src: string; caption?: string }
  | { kind: "columns"; left: { title: string; text: string }; right: { title: string; text: string } }
  | { kind: "timeline"; items: { date: string; label: string; done?: boolean }[] }
  | { kind: "closing"; text: string; contact?: string };

// A slide: its title, what it shows, and the plain sentence of what it says, why, and the next action (fixed rules).
export type Slide = { key: string; group: string; title: string; body: SlideBody; say: string; why?: string; next?: string; note?: string };

// template: the presentation template's id (empty: the workspace's default).
export type DeckTheme = { bigText: boolean; transition: "fade" | "slide" | "zoom" | "none"; seconds: number; template?: string | null };
export const DEFAULT_THEME: DeckTheme = { bigText: false, transition: "fade", seconds: 15 };

// A deck saved for a team: which slides, in which order, how it looks, the minutes per slide in a meeting, and who
// gets it by email each week.
export type SavedDeck = {
  id: string;
  name: string;
  scope: string;
  slides: string[];
  minutes: Record<string, number>;
  theme: DeckTheme;
  shared: boolean;
  emailTo: string[];
  emailDay: number | null;
  lastMeetingAt: string | null;
  ownerId: string;
  ownerName: string | null;
  // Slides written by hand in this deck.
  custom: Slide[];
};

export const CUSTOM_KINDS = { section: "Section title", bullets: "Bullet points", text: "Text", quote: "Quote", image: "Picture", columns: "Two columns", timeline: "Timeline", numbers: "Big numbers", closing: "Closing" } as const;

// A hand-written slide made safe to keep (lengths, kinds, pictures as data URLs).
export function cleanCustomSlide(x: Partial<Slide>): Slide | null {
  const b = (x.body ?? {}) as Record<string, unknown>;
  const t = (v: unknown, n = 600) => String(v ?? "").slice(0, n);
  const key = /^custom:[\w-]{3,40}$/.test(String(x.key)) ? String(x.key) : `custom:${Math.random().toString(36).slice(2, 10)}`;
  let body: SlideBody | null = null;
  switch (b.kind) {
    case "section":
      body = { kind: "section", subtitle: t(b.subtitle, 200) };
      break;
    case "bullets":
      body = { kind: "bullets", items: (Array.isArray(b.items) ? b.items : []).map((i) => t(i, 300)).filter(Boolean).slice(0, 12) };
      break;
    case "text":
      body = { kind: "text", text: t(b.text, 2000) };
      break;
    case "quote":
      body = { kind: "quote", text: t(b.text, 600), by: t(b.by, 120) };
      break;
    case "image": {
      const src = typeof b.src === "string" && /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/.test(b.src) && b.src.length < 3_000_000 ? b.src : null;
      if (!src) return null;
      body = { kind: "image", src, caption: t(b.caption, 200) };
      break;
    }
    case "columns": {
      const side = (v: unknown) => ({ title: t((v as { title?: string })?.title, 80), text: t((v as { text?: string })?.text, 800) });
      body = { kind: "columns", left: side(b.left), right: side(b.right) };
      break;
    }
    case "timeline":
      body = { kind: "timeline", items: (Array.isArray(b.items) ? b.items : []).slice(0, 10).map((i) => ({ date: t((i as { date?: string }).date, 30), label: t((i as { label?: string }).label, 120), done: !!(i as { done?: boolean }).done })) };
      break;
    case "numbers":
      body = { kind: "numbers", items: (Array.isArray(b.items) ? b.items : []).slice(0, 6).map((i) => ({ label: t((i as BigNumber).label, 60), value: Number((i as BigNumber).value) || 0, unit: t((i as BigNumber).unit, 8) })) };
      break;
    case "closing":
      body = { kind: "closing", text: t(b.text, 200) || "Thank you", contact: t(b.contact, 200) };
      break;
  }
  if (!body) return null;
  return { key, group: "Written in the deck", title: t(x.title, 120) || CUSTOM_KINDS[body.kind as keyof typeof CUSTOM_KINDS] || "Slide", body, say: t(x.say, 400), note: t(x.note, 1000) || undefined };
}

export type MeetingAction = { text: string; assigneeId: string | null; due: string | null; dept?: string | null };
