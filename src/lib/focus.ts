// Focus mode: a short quiz finds the person's focus persona; each persona has music to start with (free music
// searches on Audius, and YouTube picks that play inside the app: streams checked to exist, or a search when search
// is set up) and a suggested timer.

export type Persona = {
  key: string;
  label: string;
  about: string;
  minutes: number;
  breakMinutes: number;
  music: { label: string; q: string }[];
  youtube: { label: string; video?: string; search: string }[];
};

export const PERSONAS: Persona[] = [
  { key: "calm-coder", label: "Calm Coder", about: "Soft beats, no words, steady and long.", minutes: 50, breakMinutes: 10, music: [{ label: "Lofi beats", q: "lofi" }, { label: "Chillhop", q: "chillhop" }, { label: "Jazzhop", q: "jazzhop" }], youtube: [{ label: "Lofi hip hop radio", video: "jfKfPfyJRdk", search: "lofi hip hop radio" }, { label: "Chillhop radio", video: "5yx6BWlEVcY", search: "chillhop radio" }, { label: "1 A.M. study session", video: "lTRiuFIWV54", search: "lofi study session" }] },
  { key: "deep-diver", label: "Deep Diver", about: "Ambient sound that fades away so the work fills the room.", minutes: 90, breakMinutes: 15, music: [{ label: "Ambient", q: "ambient" }, { label: "Drone", q: "ambient drone" }, { label: "Space", q: "space ambient" }], youtube: [{ label: "Dark ambient radio", video: "S_MOd40zlYU", search: "dark ambient radio" }, { label: "Sleep ambient", video: "xORCbIptqcc", search: "deep focus ambient music" }, { label: "Brown noise", search: "brown noise 10 hours" }] },
  { key: "energy-sprinter", label: "Energy Sprinter", about: "Short, fast bursts with music that keeps you moving.", minutes: 25, breakMinutes: 5, music: [{ label: "Electronic", q: "electronic" }, { label: "Synthwave", q: "synthwave" }, { label: "Upbeat", q: "upbeat" }], youtube: [{ label: "Synthwave radio", video: "4xDzrJKXOOY", search: "synthwave radio" }, { label: "Upbeat focus", search: "upbeat focus music" }] },
  { key: "classical-thinker", label: "Classical Thinker", about: "Piano and strings for clear thinking and careful work.", minutes: 45, breakMinutes: 10, music: [{ label: "Piano", q: "piano" }, { label: "Classical", q: "classical" }, { label: "Strings", q: "strings" }], youtube: [{ label: "Jazz piano radio", video: "Dx5qFachd3A", search: "relaxing piano focus" }, { label: "Classical for studying", search: "classical music for studying" }] },
  { key: "afro-groover", label: "Afro Groover", about: "Warm rhythms from home: Ethiopian jazz, afrobeats and amapiano.", minutes: 40, breakMinutes: 8, music: [{ label: "Ethiopian", q: "ethiopian" }, { label: "Afrobeats", q: "afrobeats" }, { label: "Amapiano", q: "amapiano" }], youtube: [{ label: "Ethio-jazz", search: "ethiopian jazz mulatu" }, { label: "Afro chill", search: "afro chill mix" }, { label: "Morning coffee lofi", video: "1fueZCTYkpA", search: "morning coffee lofi" }] },
  { key: "nature-listener", label: "Nature Listener", about: "Rain, birds and soft guitar: calm without music in the way.", minutes: 30, breakMinutes: 5, music: [{ label: "Acoustic", q: "acoustic" }, { label: "Nature", q: "nature sounds" }, { label: "Meditation", q: "meditation" }], youtube: [{ label: "Rain on the window", video: "mPZkdNFkNps", search: "rain sounds for focus" }, { label: "Forest birds", search: "forest birds ambience" }] },
  { key: "jazz-cafe", label: "Jazz Café", about: "A busy café hum and jazz in the background.", minutes: 40, breakMinutes: 10, music: [{ label: "Jazz", q: "jazz" }, { label: "Bossa nova", q: "bossa nova" }, { label: "Soul", q: "soul" }], youtube: [{ label: "Jazz lofi radio", video: "HuFYqnbVbzY", search: "jazz lofi radio" }, { label: "Jazz piano café", video: "Dx5qFachd3A", search: "coffee shop jazz ambience" }] },
  { key: "gamer-flow", label: "Gamer Flow", about: "Game soundtracks: made to keep you focused for hours.", minutes: 50, breakMinutes: 10, music: [{ label: "Chiptune", q: "chiptune" }, { label: "Soundtrack", q: "soundtrack" }, { label: "Orchestral", q: "epic orchestral" }], youtube: [{ label: "Synthwave radio", video: "4xDzrJKXOOY", search: "synthwave radio" }, { label: "Game music for focus", search: "video game music for studying" }] },
];

// Four questions; each answer leans to some personas.
export const QUIZ: { q: string; answers: { label: string; lean: string[] }[] }[] = [
  { q: "When you focus best, the room is…", answers: [{ label: "Quiet, almost silent", lean: ["deep-diver", "nature-listener"] }, { label: "Soft background beats", lean: ["calm-coder", "jazz-cafe"] }, { label: "Full of energy", lean: ["energy-sprinter", "gamer-flow"] }, { label: "Like a café", lean: ["jazz-cafe", "afro-groover"] }] },
  { q: "Words in songs…", answers: [{ label: "Distract me: none please", lean: ["deep-diver", "classical-thinker", "calm-coder"] }, { label: "Are fine in another language", lean: ["afro-groover", "jazz-cafe"] }, { label: "Keep me going", lean: ["energy-sprinter", "afro-groover"] }] },
  { q: "You enjoy most…", answers: [{ label: "Piano and strings", lean: ["classical-thinker"] }, { label: "Beats and synths", lean: ["calm-coder", "energy-sprinter"] }, { label: "Ethiopian and African music", lean: ["afro-groover"] }, { label: "Nature and rain", lean: ["nature-listener"] }, { label: "Game soundtracks", lean: ["gamer-flow"] }, { label: "Jazz", lean: ["jazz-cafe"] }] },
  { q: "Your work sessions are…", answers: [{ label: "Short sprints", lean: ["energy-sprinter", "nature-listener"] }, { label: "About an hour", lean: ["calm-coder", "classical-thinker", "gamer-flow"] }, { label: "Long and deep", lean: ["deep-diver"] }] },
];

export function personaFrom(picks: number[]): Persona {
  const score = new Map<string, number>();
  picks.forEach((a, i) => QUIZ[i]?.answers[a]?.lean.forEach((k, j) => score.set(k, (score.get(k) ?? 0) + (j === 0 ? 2 : 1))));
  const best = [...score.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "calm-coder";
  return PERSONAS.find((p) => p.key === best)!;
}

// A YouTube playlist or video from a link or an id: { list } for playlists, { video } for one video.
export function parseYouTube(text: string): { list?: string; video?: string } | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$|(^|\.)youtube-nocookie\.com$/.test(u.hostname)) {
      const list = u.searchParams.get("list");
      if (list && /^[A-Za-z0-9_-]{2,64}$/.test(list)) return { list };
      const v = u.hostname.endsWith("youtu.be") ? u.pathname.slice(1) : (u.searchParams.get("v") ?? u.pathname.match(/\/(embed|live|shorts)\/([A-Za-z0-9_-]{11})/)?.[2]);
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return { video: v };
    }
    return null;
  } catch {
    if (/^(PL|UU|LL|FL|OL|RD)[A-Za-z0-9_-]{0,62}$/.test(t)) return { list: t };
    if (/^[A-Za-z0-9_-]{11}$/.test(t)) return { video: t };
    return null;
  }
}
export const ytEmbed = (y: { list?: string; video?: string }) => (y.list ? `https://www.youtube.com/embed/videoseries?list=${y.list}&autoplay=1` : `https://www.youtube.com/embed/${y.video}?autoplay=1`);
