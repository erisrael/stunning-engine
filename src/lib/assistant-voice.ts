// Spoken (or typed) commands the assistant carries out at once, beyond opening pages: Fun mode (music, games, the
// pet, points), the look of the app (UI style, light or dark, accent), reading the page aloud, reminders and
// hands-free listening. Pure: parsed here, carried out in components/app/assistant.tsx.
import { UI_STYLES } from "./ui-styles";

export const WAKE_WORDS = ["hey seed", "hey myseed", "hey my seed", "ok seed", "okay seed", "hi seed", "hey c'd", "hey sid"];
// Genres and moods "play <x>" means music for, even without the word music.
const GENRES = /\b(jazz|lo-?fi|chill|piano|classical|rock|pop|hip ?hop|rap|afrobeats?|amapiano|ethiopian|reggae|edm|house|ambient|r&b|rnb|soul|gospel|worship|study|focus|workout|instrumental|acoustic|blues|country|metal|kpop|k-pop|anime|soundtrack|relaxing)\b/;

export const FUN_GAME_WORDS: [RegExp, string][] = [
  [/\bseed town\b|\b3d (world|game)\b|\bthe town\b|\boffice world\b/, "world"],
  [/\bchess (lesson|lessons|puzzle|puzzles|learn|training)|learn(ing)? chess|teach me chess/, "chess-learn"],
  [/\bchess\b/, "chess"],
  [/\bsudoku\b/, "sudoku"],
  [/\b2048\b/, "2048"],
  [/\bsnake\b/, "snake"],
  [/\bmemory\b|\bpairs\b/, "memory"],
  [/\bmine ?sweeper\b|\bmines\b/, "minesweeper"],
  [/\btic ?tac ?toe\b|\bnoughts\b/, "tictactoe"],
  [/\bword (guess|game)\b|\bwordle\b/, "wordguess"],
  [/\btyping\b/, "typing"],
  [/\breaction\b/, "reaction"],
];

// What each style answers to besides its name.
const STYLE_WORDS: Record<string, string[]> = {
  studio: ["studio", "professional", "default", "normal", "business"],
  zen: ["zen", "minimal", "minimalist", "simple", "clean"],
  classic: ["classic", "classic desk", "old school", "oldschool", "retro", "windows 95", "90s", "vintage"],
  sakura: ["sakura", "sakura pop", "anime", "kawaii", "cute", "pastel"],
  sunset: ["sunset", "sunset city", "neon", "city", "synthwave", "vice", "miami"],
  tactical: ["tactical", "hud", "shooter", "esports", "sharp"],
  comic: ["comic", "comic pop", "comics", "comic book", "cartoon", "pow"],
};
const ACCENT_WORDS: Record<string, string[]> = {
  violet: ["violet", "purple"],
  blue: ["blue"],
  green: ["green"],
  teal: ["teal", "turquoise"],
  orange: ["orange"],
  pink: ["pink"],
  slate: ["slate", "grey", "gray"],
};

export type VoiceAction =
  | { kind: "fun"; cmd: { open?: boolean | "focus" | "music" | "games" | "pet" | "boost"; focus?: number | true; close?: boolean; game?: string; music?: { action: "play" | "pause" | "toggle" | "next" | "prev" | "stop"; q?: string } }; say: string }
  | { kind: "style"; style: string; say: string }
  | { kind: "mode"; mode: "light" | "dark" | "system"; say: string }
  | { kind: "accent"; accent: string; say: string }
  | { kind: "read"; say: string }
  | { kind: "quiet"; say: string }
  | { kind: "timer"; minutes: number; what: string; say: string }
  | { kind: "handsfree"; on: boolean; say: string }
  | { kind: "voicehelp"; say: string };

const findStyle = (w: string) => Object.entries(STYLE_WORDS).find(([, words]) => words.some((x) => w === x || w.includes(x)))?.[0];

export function voiceAction(text: string): VoiceAction | null {
  const t = text.toLowerCase().replace(/[.!?,]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;

  // Hands-free listening.
  if (/^(start |turn on |switch on )?hands[- ]?free( mode)?( on)?$|^(always |keep )listen(ing)?$|^listen for (my voice|hey seed)$/.test(t)) return { kind: "handsfree", on: true, say: 'Hands-free is on. Say "Hey Seed" and then what you need.' };
  if (/^(stop |turn off |switch off )?hands[- ]?free( mode)?( off)?$|^stop listening$/.test(t) && !/^(start|turn on|switch on)/.test(t)) return { kind: "handsfree", on: false, say: "Hands-free is off." };
  if (/^(what can i say|voice commands|what (voice )?commands)$/.test(t)) return { kind: "voicehelp", say: "" };

  // Speech.
  if (/^(stop talking|be quiet|quiet|shush|silence|stop reading)$/.test(t)) return { kind: "quiet", say: "" };
  if (/^(read|read out|read aloud|read me)( this| the)?( page| screen)?( aloud| out loud)?$/.test(t)) return { kind: "read", say: "Reading the page." };

  // Reminders: "remind me in 20 minutes to call Abebe", "break in 45 minutes", "set a timer for 10 minutes".
  const rem = t.match(/^(?:remind me|set a (?:timer|reminder)|timer|break)(?: for| in)? (\d{1,3}) ?(min|mins|minute|minutes|hour|hours)(?: to (.+))?$/) ?? t.match(/^remind me to (.+) in (\d{1,3}) ?(min|mins|minute|minutes|hour|hours)$/);
  if (rem) {
    const [n, unit, what] = rem[0].startsWith("remind me to") ? [rem[2]!, rem[3]!, rem[1]!] : [rem[1]!, rem[2]!, rem[3] ?? "take a break"];
    const minutes = Math.min(600, Number(n) * (unit.startsWith("hour") ? 60 : 1));
    if (minutes > 0) return { kind: "timer", minutes, what, say: `I will remind you in ${minutes} minute${minutes === 1 ? "" : "s"} to ${what}.` };
  }

  // Look: dark or light, the UI style and the accent.
  if (/^(turn on |switch to |use |go )?(dark|night)( mode| theme)?( on)?$|^lights off$/.test(t)) return { kind: "mode", mode: "dark", say: "Dark mode." };
  if (/^(turn on |switch to |use |go )?(light|day)( mode| theme)?( on)?$|^lights on$/.test(t)) return { kind: "mode", mode: "light", say: "Light mode." };
  if (/^(follow|match) (the )?(system|device)( theme)?$|^(system|auto) (mode|theme)$/.test(t)) return { kind: "mode", mode: "system", say: "Following the device." };
  const st = t.match(/^(?:switch to|change to|use|set|apply|make it|i want|give me)(?: the| a| an)? (.+?)(?: ui)?(?: style| theme| look| mode| design)$/) ?? t.match(/^(.+?) (?:ui )?(?:style|theme|look)(?: please)?$/);
  if (st) {
    const k = findStyle(st[1]!);
    if (k) return { kind: "style", style: k, say: `${UI_STYLES.find((s) => s.key === k)!.label} style on.` };
  }
  const ac = t.match(/^(?:make it|change the accent to|accent|set the accent to|use) ?(.+?)(?: accent| colour| color)?$/);
  if (ac && /accent|colou?r|make it/.test(t)) {
    const k = Object.entries(ACCENT_WORDS).find(([, w]) => w.includes(ac[1]!.trim()))?.[0];
    if (k) return { kind: "accent", accent: k, say: `Accent colour ${k}.` };
  }

  // Focus mode: "start focus mode", "focus for 45 minutes", "help me focus".
  const fo = t.match(/^(?:start (?:a )?focus(?: mode| session)?|focus mode|help me focus|i need to focus|let'?s focus|focus)(?: for (\d{1,3}) ?(?:min|mins|minutes))?$/);
  if (fo) {
    const n = fo[1] ? Math.max(5, Math.min(180, Number(fo[1]))) : null;
    return { kind: "fun", cmd: { focus: n ?? true }, say: n ? `Focus for ${n} minutes. You've got this.` : "Focus mode on. You've got this." };
  }
  if (/^(open|show) (the )?focus( mode)?$/.test(t)) return { kind: "fun", cmd: { open: "focus" }, say: "Here's focus mode." };

  // Fun mode.
  if (/^(open |show |start )?(the )?fun( mode| window)?$|^i('?m| am) bored$|^(let'?s )?have (some )?fun$|^take a break$/.test(t)) return { kind: "fun", cmd: { open: true }, say: "Here's Fun mode. Enjoy your break!" };
  if (/^(close|hide) (the )?fun( mode| window)?$/.test(t)) return { kind: "fun", cmd: { close: true }, say: "Closed." };
  if (/^(show |open |see |how is |check on )?(my )?pet$|^feed (my )?pet$|^(how'?s|how is) my pet$/.test(t)) return { kind: "fun", cmd: { open: "pet" }, say: "Here's your pet." };
  if (/^(my points|how many points( do i have)?|show (my )?points|leaderboard|show the leaderboard|who'?s (on )?top|(open |show )?boost)$/.test(t)) return { kind: "fun", cmd: { open: "boost" }, say: "Here are your points and the week's board." };
  if (/^(open |show )?(the )?games?$|^(let'?s )?play a game$|^games$/.test(t)) return { kind: "fun", cmd: { open: "games" }, say: "Pick a game." };
  const gm = t.match(/^(?:let'?s |can we |i want to |open |start |launch |teach me |show me )?(?:play |a game of |game of |open )*(.+?)(?: game)?$/);
  if (gm && /^(let'?s |can we |i want to |open |start |launch |play |teach me |show me )/.test(t)) {
    const g = FUN_GAME_WORDS.find(([re]) => re.test(t))?.[1];
    if (g) return { kind: "fun", cmd: { game: g }, say: g === "chess-learn" ? "Let's learn some chess." : `Opening ${g === "tictactoe" ? "tic-tac-toe" : g === "wordguess" ? "word guess" : g}.` };
  }

  // Music.
  if (/^(pause|stop)( the)? (music|song|playing)$|^pause$/.test(t)) return { kind: "fun", cmd: { music: { action: "pause" } }, say: "" };
  if (/^(resume|continue|unpause)( the)?( music| song)?$|^play( the)? music$|^play$/.test(t)) return { kind: "fun", cmd: { music: { action: "toggle" } }, say: "" };
  if (/^(next|skip)( song| track| this)?$|^play (the )?next( song)?$/.test(t)) return { kind: "fun", cmd: { music: { action: "next" } }, say: "" };
  if (/^(previous|last|go back)( song| track)$|^play (the )?previous( song)?$/.test(t)) return { kind: "fun", cmd: { music: { action: "prev" } }, say: "" };
  if (/^(turn off|stop) (all )?(the )?music( completely)?$/.test(t)) return { kind: "fun", cmd: { music: { action: "stop" } }, say: "Music off." };
  if (/^(open |show )?(the )?music( player)?$/.test(t)) return { kind: "fun", cmd: { open: "music" }, say: "Here's the music." };
  const mu = t.match(/^(?:play|put on|i want to hear|let'?s hear)(?: me)?(?: some| a little)? (.+?)(?: music| songs?| playlist| tunes)?$/);
  if (mu && (/music|songs?|playlist|tunes/.test(t) || GENRES.test(mu[1]!) || /^(put on|i want to hear|let'?s hear)/.test(t) || /^play (some|a little) /.test(t))) {
    const q = mu[1]!.replace(/^(some|a little) /, "").trim();
    if (q && !FUN_GAME_WORDS.some(([re]) => re.test(q))) return { kind: "fun", cmd: { music: { action: "play", q } }, say: `Playing ${q}.` };
  }
  return null;
}

export const VOICE_HELP = [
  '"Hey Seed" (hands-free), then what you need',
  '"Open handovers", "go back", "scroll down"',
  '"Play some jazz", "pause the music", "next song"',
  '"Let\'s play chess", "open sudoku", "teach me chess"',
  '"Show my pet", "my points", "open fun mode"',
  '"Switch to comic style", "dark mode", "make it green accent"',
  '"Read this page", "stop talking"',
  '"Remind me in 20 minutes to call the studio"',
];
