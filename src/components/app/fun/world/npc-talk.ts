// Conversations with town folk. Scripted and contextual: what they say depends on who they are (personality and
// role), the hour, the weather, whether they have met you before and how they feel about you (remembered on the
// server), and what you ask: directions (a marker on the map), the time, the weather, their work, a small task (a
// quest), small talk. Free text is understood for those topics; anything else goes to the town's AI when Admin has
// switched it on (a few selected people), otherwise they answer in character. They speak aloud with the browser's
// voices (each person their own voice), with subtitles; the level of their voice moves their jaw (lip-sync). You
// can talk back with the microphone where the browser supports it.

import type { Personality } from "./npc-brain";

export type Topic = "hello" | "about" | "work" | "directions" | "task" | "smalltalk" | "time" | "weather" | "bye" | "free";
export type Memory = { met: number; relation: number; topics: string[]; quest: Quest | null; done: number };
export type Quest = { id: string; text: string; place: string; x: number; z: number; r: number; reward: number };
export type TalkCtx = { name: string; role: string; personality: Personality; hours: number; weather: string; player: string; memory: Memory; places: { label: string; x: number; z: number }[] };
export type Reply = { text: string; emote?: string; mark?: { x: number; z: number; label: string }; quest?: Quest | null; relation?: number };

const pickOf = <T,>(list: T[], seed: number) => list[Math.abs(Math.floor(seed)) % list.length]!;

export const DESTINATIONS: { label: string; x: number; z: number; words: string[] }[] = [
  { label: "the plaza", x: 0, z: 0, words: ["plaza", "fountain", "square", "centre", "center"] },
  { label: "the office tower", x: 0, z: -42, words: ["office", "tower", "hq", "work", "reception"] },
  { label: "the shops on Market Street", x: 60, z: 8, words: ["shop", "shops", "store", "market", "buy", "clothes"] },
  { label: "the car dealer", x: 100, z: 9, words: ["car", "dealer", "vehicle", "garage", "motors"] },
  { label: "the park", x: -70, z: 6, words: ["park", "green", "trees", "pond", "fishing"] },
  { label: "the archery range", x: -100, z: -23, words: ["archery", "bow", "arrow", "range"] },
  { label: "the stadium", x: 160, z: 60, words: ["stadium", "football", "soccer", "match", "penalty"] },
  { label: "Seed Circuit", x: 150, z: -55, words: ["circuit", "race", "racing", "track", "kart"] },
  { label: "the Grand Prix circuit", x: 330, z: -200, words: ["grand prix", "formula", "f2", "gp"] },
  { label: "Seed Strike arena", x: 300, z: 230, words: ["arena", "shooter", "strike", "deathmatch", "lone wolf"] },
  { label: "downtown", x: 80, z: -86, words: ["downtown", "towers", "skyscraper", "city", "bank", "coffee", "bakery", "cinema"] },
  { label: "the library", x: -52, z: -44, words: ["library", "books", "study"] },
  { label: "the industrial yard", x: 101, z: 64, words: ["industrial", "factory", "warehouse", "containers", "yard"] },
  { label: "the homes", x: 0, z: 70, words: ["home", "homes", "house", "houses", "street"] },
  { label: "the wood", x: -112, z: 100, words: ["wood", "forest", "woods"] },
];

const GREET: Record<Personality, (c: TalkCtx) => string> = {
  friendly: (c) => (c.memory.met ? `${c.player}! Good to see you again.` : `Hello! I'm ${c.name}. Welcome to town!`),
  shy: (c) => (c.memory.met > 2 ? `Oh, hi ${c.player}.` : "Oh... hello."),
  talkative: (c) => (c.memory.met ? `${c.player}! You will not believe what happened today.` : `Hi, hi! I'm ${c.name}. I know everyone here, ask me anything!`),
  professional: (c) => (c.memory.met ? `Good ${part(c.hours)}, ${c.player}.` : `Good ${part(c.hours)}. ${c.name}, ${c.role}.`),
  curious: (c) => (c.memory.met ? `${c.player}! Where have you been?` : `Hello! You are new? I'm ${c.name}. What brings you here?`),
  funny: (c) => (c.memory.met ? `Look who it is! The famous ${c.player}.` : `Hi! I'm ${c.name}. I'd shake hands but I just ate a sambusa.`),
  helpful: (c) => (c.memory.met ? `Hello ${c.player}, anything I can help with?` : `Hello! I'm ${c.name}. Lost? I can show you the way.`),
  competitive: (c) => (c.memory.met ? `${c.player}. Ready for a rematch?` : `I'm ${c.name}. Best penalty taker in town. You?`),
  serious: (c) => (c.memory.met ? `${c.player}.` : `Hello. ${c.name}.`),
};
function part(h: number) {
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
function timeText(h: number) {
  const hh = Math.floor(h), mm = Math.floor((h % 1) * 60);
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "in the morning" : hh < 17 ? "in the afternoon" : hh < 21 ? "in the evening" : "at night"}`;
}

export function greet(c: TalkCtx): Reply {
  const extra = c.weather === "Rain" || c.weather === "Storm" ? " Terrible rain, isn't it?" : c.hours >= 21 || c.hours < 5 ? " Out late, aren't we?" : "";
  return { text: GREET[c.personality](c) + (c.personality === "shy" ? "" : extra), emote: c.personality === "shy" ? "" : "wave" };
}

export function options(c: TalkCtx): { label: string; topic: Topic; arg?: string }[] {
  const out: { label: string; topic: Topic; arg?: string }[] = [{ label: "Tell me about yourself", topic: "about" }, { label: "How do I get to...", topic: "directions" }];
  out.push(c.memory.quest ? { label: "About that task...", topic: "task" } : { label: "Can I help you with anything?", topic: "task" });
  out.push({ label: "What's new?", topic: "smalltalk" }, { label: "What time is it?", topic: "time" });
  return out;
}

const ABOUT: Record<string, string[]> = {
  worker: ["I work at the office tower, third floor. Reports, meetings, coffee.", "I'm on the production team. Recording days are the best days."],
  shopper: ["I like to know every shop on Market Street. Threads has the best jackets.", "I come into town most days. Window shopping counts as exercise, right?"],
  student: ["I study at the library most afternoons.", "Exams next week. I'm here to avoid thinking about them."],
  retiree: ["I worked forty years at the railway. Now I feed the ducks.", "I sit by the fountain and watch the town go by."],
  athlete: ["I train every morning in the park, then penalties at the stadium.", "My circuit time is one minute nine. Beat that."],
  keeper: ["I run this shop. Everything here is chosen by hand.", "Business is good when the work points are flowing."],
  guide: ["I help people find their way.", "Ask me where anything is."],
};

const QUESTS: Omit<Quest, "id" | "reward">[] = [
  { text: "Could you check the archery range? Someone left a bow there. Just go and look.", place: "the archery range", x: -100, z: -23, r: 8 },
  { text: "My friend works downtown. Would you take a walk past the towers and wave at the glass one?", place: "downtown", x: 82, z: -70, r: 12 },
  { text: "I heard there's a match at the stadium. Go and see if the floodlights are on?", place: "the stadium", x: 160, z: 60, r: 14 },
  { text: "Would you look at the industrial yard for me? I think the containers moved.", place: "the industrial yard", x: 101, z: 64, r: 10 },
  { text: "Visit the library and tell me if it's open.", place: "the library", x: -52, z: -44, r: 8 },
  { text: "Walk to the wood south-west and listen for the owls.", place: "the wood", x: -112, z: 100, r: 14 },
];

export function answer(c: TalkCtx, topic: Topic, arg = "", seed = Date.now()): Reply {
  switch (topic) {
    case "hello":
      return greet(c);
    case "about":
    case "work":
      return { text: pickOf(ABOUT[c.role] ?? ABOUT.worker!, seed), emote: "talk" };
    case "time":
      return { text: `It's ${timeText(c.hours)}.${c.hours >= 20 ? " Most people are heading home." : c.hours < 9 ? " The office opens soon." : ""}` };
    case "weather":
      return { text: c.weather === "Clear" ? "Not a cloud. Perfect for the park." : c.weather === "Rain" || c.weather === "Storm" ? "Wet! Keep to the shelters and drive slowly, the roads are slippery." : c.weather === "Fog" ? "You can hardly see the towers in this fog." : "Grey, but no rain yet." };
    case "directions": {
      const d = DESTINATIONS.find((x) => x.words.some((w) => arg.toLowerCase().includes(w))) ?? (arg ? null : null);
      if (!d) return { text: `Where to? The plaza, the office, the shops, the park, archery, the stadium, the circuit, downtown, the library...` };
      return { text: `${d.label[0]!.toUpperCase()}${d.label.slice(1)}? ${c.personality === "helpful" ? "Follow the marker I put on your map, it's easy." : "I've marked it on your map."}`, mark: { x: d.x, z: d.z, label: d.label }, emote: "talk" };
    }
    case "task": {
      if (c.memory.quest) return { text: `Did you get to ${c.memory.quest.place} yet? It's on your map.`, mark: { x: c.memory.quest.x, z: c.memory.quest.z, label: c.memory.quest.place } };
      if (c.personality === "shy" && c.memory.met < 2) return { text: "Oh, no, I'm fine, thank you." };
      const q = pickOf(QUESTS, seed + c.name.length);
      const quest: Quest = { ...q, id: `${c.name}-${Math.floor(seed / 1000)}`, reward: 10 };
      return { text: `${q.text} I'll give you ${quest.reward} coins.`, quest, mark: { x: q.x, z: q.z, label: q.place } };
    }
    case "smalltalk":
      return { text: pickOf(SMALL[c.personality], seed), emote: c.personality === "funny" ? "laugh" : "talk" };
    case "bye":
      return { text: c.personality === "shy" ? "Bye..." : c.personality === "funny" ? "Don't trip over the curbs!" : "See you around!", emote: "wave" };
    default:
      return { text: pickOf(SMALL[c.personality], seed) };
  }
}

const SMALL: Record<Personality, string[]> = {
  friendly: ["The new houses on Acacia Street look lovely.", "Have you tried the penalties at the stadium?"],
  shy: ["I like the library. It's quiet.", "The wood is nice in the morning."],
  talkative: ["They say a Grand Prix car did two hundred on the back straight!", "Someone in the industrial yard is building something big. Nobody knows what."],
  professional: ["Quarterly numbers are due on Friday.", "The office lifts are quick, at least."],
  curious: ["Why do you think the towers light up at night?", "Have you seen the circuit's pit garages?"],
  funny: ["I asked the traffic light for advice. It told me to wait.", "The fountain is the only thing in town that works harder than me."],
  helpful: ["Bus stops are on the avenue and Market Street.", "If it rains, the shops and bus shelters keep you dry."],
  competitive: ["Archery tournament, me against you, any time.", "Nobody has beaten my lap at Seed Circuit this week."],
  serious: ["The roads get slippery in the rain. Mind your speed.", "Keep to the crossings."],
};

// Free text: what is it about?
export function understand(text: string): { topic: Topic; arg: string } {
  const t = text.toLowerCase();
  if (/\b(hi|hello|hey|selam|good (morning|afternoon|evening))\b/.test(t) && t.length < 25) return { topic: "hello", arg: "" };
  if (/\b(bye|goodbye|see you|later|ciao)\b/.test(t)) return { topic: "bye", arg: "" };
  if (/\b(where|how do i get|way to|direction|find|go to|take me)\b/.test(t) || DESTINATIONS.some((d) => d.words.some((w) => t.includes(w)) && /\b(where|get|go|find)\b/.test(t))) return { topic: "directions", arg: t };
  if (/\b(time|clock|o'clock|late|early)\b/.test(t)) return { topic: "time", arg: "" };
  if (/\b(weather|rain|sun|cloud|fog|storm|cold|hot)\b/.test(t)) return { topic: "weather", arg: "" };
  if (/\b(task|help you|job for me|quest|favou?r|mission)\b/.test(t)) return { topic: "task", arg: "" };
  if (/\b(who are you|about you|yourself|your name|what do you do|work|job)\b/.test(t)) return { topic: "about", arg: "" };
  if (/\b(news|what'?s new|gossip|how are you)\b/.test(t)) return { topic: "smalltalk", arg: "" };
  return { topic: "free", arg: text };
}

// ------------------------------------------------------------------------------------------------- speaking

let voices: SpeechSynthesisVoice[] = [];
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  const load = () => (voices = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)));
  load();
  window.speechSynthesis.onvoiceschanged = load;
}

export type VoiceProfile = { female: boolean; pitch: number; rate: number; seed: number };
export function voiceFor(personality: Personality, female: boolean, seed: number): VoiceProfile {
  const pitch = (female ? 1.12 : 0.88) + ((seed % 7) - 3) * 0.04 + (personality === "funny" ? 0.08 : personality === "serious" ? -0.08 : 0);
  const rate = 1 + (personality === "talkative" ? 0.12 : personality === "shy" ? -0.12 : personality === "professional" ? 0.04 : 0);
  return { female, pitch, rate, seed };
}

// Say a line aloud; level() is called with 0..1 as the words come (for the jaw), done() at the end.
export function speakLine(text: string, v: VoiceProfile, level: (x: number) => void, done: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) {
    // No voice: still move the mouth for the length of the line.
    const words = text.split(/\s+/).length;
    let i = 0;
    const id = window.setInterval(() => {
      level(i % 2 ? 0.2 : 0.8);
      if (++i > words * 2) (window.clearInterval(id), level(0), done());
    }, 160);
    return () => (window.clearInterval(id), level(0));
  }
  const u = new SpeechSynthesisUtterance(text);
  const pool = voices.filter((x) => (v.female ? /female|zira|susan|samantha|victoria|karen|moira|tessa|fiona|hazel|libby|sonia|aria|jenny/i : /male|david|mark|daniel|alex|fred|george|ryan|guy|thomas/i).test(x.name));
  const list = pool.length ? pool : voices;
  if (list.length) u.voice = list[v.seed % list.length]!;
  u.pitch = Math.max(0.5, Math.min(1.6, v.pitch));
  u.rate = Math.max(0.7, Math.min(1.3, v.rate));
  let talking = true;
  // Syllable-like pulses while speaking; boundary events (each word) give a fresh push.
  const pulse = window.setInterval(() => talking && level(0.35 + Math.random() * 0.6), 110);
  u.onboundary = () => level(1);
  const end = () => {
    talking = false;
    window.clearInterval(pulse);
    level(0);
    done();
  };
  u.onend = end;
  u.onerror = end;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return () => {
    window.speechSynthesis.cancel();
    end();
  };
}

// Listen once with the microphone (Chrome, Edge, Safari); null when the browser cannot.
export function listenOnce(onText: (t: string) => void, onEnd: () => void): (() => void) | null {
  const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
  if (!R) return null;
  const r = new R();
  r.lang = "en-US";
  r.interimResults = false;
  r.maxAlternatives = 1;
  r.onresult = (e) => onText(e.results[0]?.[0]?.transcript ?? "");
  r.onend = onEnd;
  r.onerror = onEnd;
  r.start();
  return () => r.stop();
}
type SpeechRec = { lang: string; interimResults: boolean; maxAlternatives: number; onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };
