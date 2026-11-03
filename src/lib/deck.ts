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
  | { kind: "text"; text: string };

// A slide: its title, what it shows, and the plain sentence of what it says, why, and the next action (fixed rules).
export type Slide = { key: string; group: string; title: string; body: SlideBody; say: string; why?: string; next?: string; note?: string };

export type DeckTheme = { bigText: boolean; transition: "fade" | "slide" | "zoom" | "none"; seconds: number };
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
};

export type MeetingAction = { text: string; assigneeId: string | null; due: string | null; dept?: string | null };
