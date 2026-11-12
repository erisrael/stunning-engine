// Amharic in the assistant (Update 1.0, phase 5): people write in Ge'ez script ("ፈቃድ እፈልጋለሁ") or in Latin
// letters ("fikad efelgalehu"). Both are recognised, the reply comes back in Amharic, and the words are mapped to the
// assistant's English keywords so the same flows and pages are found. The glossary below is the shared list of
// terms; the phrase test set lives in tests/server/assistant-amharic.test.ts.

const GEEZ = /[ሀ-፿]/;

// Common Amharic words typed in Latin letters (several spellings each).
const LATIN_AM = new Set(
  "ye amet ahun wetahu gebahu demoze wechi teyake qal kechayu lela endet lay mewsed mezgeb yaz fikad ketero kerets selam salam tena yistilign endet indet endemin new nw nech ale alew alle yelem yellem ishi eshi awo aw amesegnalehu ameseginalehu amesegnalew betam min mn man yet yetu yet-new sint sintu efelgalehu efelegalehu ifelgalehu efelgalew asayegn asayeny kifet kifeteh kifetilign hid lemn lemin le ena wede ke bezih zare nege tilant sira siraye sirae fikad fqad fikade ketema kifya kfya demoz dimoz meweta megbat megbiya mewcha mewucha seat se'at sewoch sew ser serategna serategnoch tegbar tegbaroch teguadna mastaweqia mastawekia tiyake tiyakewoch kifil kifiloch astedader astedadari meregagecha mared marred fetena timhirt temari wolaj ftsm fetsim ameleket akrib lak lakilign mezgeb mezgebu"
    .split(" "),
);

// Ge'ez and Latin Amharic words and the English keywords they mean in the app.
export const AM_GLOSSARY: { am: string[]; en: string }[] = [
  { am: ["ፈቃድ", "እረፍት", "ዕረፍት", "fikad", "fqad", "fikade", "erft", "ereft"], en: "leave" },
  { am: ["መግቢያ", "ገባሁ", "መግባት", "megbiya", "megbat", "gebahu"], en: "check in" },
  { am: ["መውጫ", "ወጣሁ", "መውጣት", "mewcha", "mewucha", "meweta", "wetahu"], en: "check out" },
  { am: ["መገኘት", "ሰዓት", "አቴንዳንስ", "seat", "se'at", "megegnet"], en: "attendance" },
  { am: ["ሥራ", "ስራ", "sira"], en: "work" },
  { am: ["ሥራዬ", "ስራዬ", "ሥራዬን", "ስራዬን", "siraye", "sirae", "sirayen"], en: "my work" },
  { am: ["ቀጣይ", "ቀጣዩ", "ቀጣዩን", "kechayu", "kechay"], en: "next task" },
  { am: ["ስልክ", "silk"], en: "phone number" },
  { am: ["ምን አለ", "min ale", "min addis"], en: "today" },
  { am: ["ተግባር", "ተግባሮች", "ተግባራት", "tegbar", "tegbaroch"], en: "task" },
  { am: ["ፍጠር", "ፍጠሪ", "ፍጠሩ", "አዲስ", "ftsm", "fetsim", "fter", "addis"], en: "create" },
  { am: ["ጀምር", "ጀምሪ", "jemir", "jemr"], en: "start" },
  { am: ["ጨርስ", "ጨረስኩ", "cheres", "cheresku"], en: "done" },
  { am: ["ላክ", "ላኪ", "ላኩ", "lak", "laki", "lakilign"], en: "send" },
  { am: ["መድብ", "ስጥ", "medib", "sit"], en: "assign" },
  { am: ["አጽድቅ", "ማጽደቂያ", "ማጽደቅ", "atsidik", "matsdek"], en: "approve" },
  { am: ["ደመወዝ", "ክፍያ", "demoz", "dimoz", "kifya", "kfya"], en: "pay" },
  { am: ["ወጪ", "ደረሰኝ", "wechi", "dereseny"], en: "claim" },
  { am: ["ሠራተኛ", "ሰራተኛ", "ሠራተኞች", "ሰራተኞች", "serategna", "serategnoch"], en: "staff" },
  { am: ["ሰዎች", "sewoch"], en: "people" },
  { am: ["ማስታወቂያ", "mastaweqia", "mastawekia"], en: "announcement" },
  { am: ["ጥያቄ", "ጥያቄዎች", "tiyake", "tiyakewoch"], en: "request" },
  { am: ["ቀጠሮ", "ስቱዲዮ", "ቀረጻ", "ketero", "studio", "kerets"], en: "studio session" },
  { am: ["መልእክት", "መልዕክት", "ጭውውት", "melekt", "chewewit"], en: "chat" },
  { am: ["ኢሜይል", "ኢሜል", "imeil", "email"], en: "email" },
  { am: ["ማሳወቂያ", "masawekia"], en: "notifications" },
  { am: ["ፋይናንስ", "ሂሳብ", "finance", "hisab"], en: "finance" },
  { am: ["ቡድን", "ቡድኔ", "budin", "budine"], en: "team" },
  { am: ["ሪፖርት", "report", "riport"], en: "reports" },
  { am: ["እርዳታ", "መመሪያ", "erdata", "memeria"], en: "help" },
  { am: ["ክፈት", "ክፈትልኝ", "አሳየኝ", "ሂድ", "ውሰደኝ", "kifet", "kifetilign", "asayegn", "asayeny", "hid", "wesedegn"], en: "open" },
  { am: ["የት", "yet", "yetu"], en: "where" },
  { am: ["ማድረግ", "ትችላለህ", "ትችያለሽ", "madreg", "tichilaleh"], en: "can you do" },
  { am: ["ዛሬ", "zare"], en: "today" },
  { am: ["ቤት", "መነሻ", "menesha"], en: "home" },
  { am: ["ርክክብ", "rikikib"], en: "handovers" },
  { am: ["የሰው ኃይል", "ሰው ኃይል", "hayl"], en: "hr" },
  { am: ["መለያ", "meleya"], en: "account" },
  { am: ["ቀን መቁጠሪያ", "mekuteria"], en: "calendar" },
  { am: ["ሥርዓተ ትምህርት", "sirate timhirt"], en: "curriculum" },
  { am: ["አጠቃላይ", "atekalay"], en: "overview" },
  { am: ["የይለፍ", "password", "yeyilef"], en: "password account" },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9'ሀ-፿]+/g, " ").trim();

// Latin spellings from the glossary that are not also English words.
const ENGLISH_TOO = new Set(["email", "studio", "report", "finance", "password", "seat", "min", "lak", "le", "new", "man", "hid", "sit", "lay", "ale", "yet", "aw", "ser", "sew"]);
const LATIN_GLOSS = new Set(AM_GLOSSARY.flatMap((g) => g.am).filter((w) => /^[a-z']+$/.test(w) && !ENGLISH_TOO.has(w)));
const isAmWord = (w: string) => !ENGLISH_TOO.has(w) && (LATIN_AM.has(w) || LATIN_GLOSS.has(w));

// Ge'ez script, or Amharic words in Latin letters ("selam fikad efelgalehu"): two of them, or a short phrase of only them.
export function detectAmharic(text: string): "geez" | "latin" | null {
  if (GEEZ.test(text)) return "geez";
  const words = norm(text).split(" ").filter(Boolean);
  if (!words.length) return null;
  const pairs = ["yet new", "min ale", "sint new", "endet new", "min new", "yet ale"].filter((x) => ` ${words.join(" ")} `.includes(` ${x} `)).length;
  const hits = pairs * 2 + words.filter((w) => isAmWord(w) || [...LATIN_GLOSS].some((a) => a.length >= 4 && w.startsWith(a) && w.length - a.length <= 4)).length;
  return hits >= 2 || (hits >= 1 && hits * 2 >= words.length) ? "latin" : null;
}

// Amharic adds endings that change a word's last letter (ደመወዝ, ደመወዜን "my salary"; ሪፖርት, ሪፖርቶችን): letters are
// compared by their consonant (each Ge'ez letter is one of eight vowel forms of a consonant).
const skeleton = (s: string) => [...s].map((ch) => { const c = ch.codePointAt(0)!; return c >= 0x1200 && c <= 0x137f ? String.fromCodePoint(c - ((c - 0x1200) % 8)) : ch; }).join("");

// The English keywords for what was written in Amharic, added after the text, so the matcher finds the same flows.
// Latin spellings also match with an ending ("siraye", "demoze", "tegbaroch").
export function amharicToKeywords(text: string): string {
  const t = norm(text);
  const sk = skeleton(t);
  const words = t.split(" ");
  // A leading የ ("of") is part of the word in Ge'ez (የዓመት, የሠራተኞች): the word after it is checked too.
  const skWords = sk.split(" ").filter(Boolean);
  const extra = new Set<string>();
  for (const g of AM_GLOSSARY)
    if (
      g.am.some((a) =>
        a.includes(" ")
          ? (GEEZ.test(a) ? sk.includes(skeleton(a)) : t.includes(a))
          : GEEZ.test(a)
            ? skWords.some((w) => { const k = skeleton(a); return w === k || (w.length >= 2 && (w.startsWith(k) || (w.startsWith("የ") && w.slice(1).startsWith(k) && k.length >= 2)) && [...w].length - [...k].length <= ([...k].length >= 4 ? 3 : 2)); })
            : words.some((w) => w === a || (a.length >= 4 && w.startsWith(a) && w.length - a.length <= 4)),
      )
    )
      extra.add(g.en);
  return extra.size ? `${text} ${[...extra].join(" ")}` : text;
}
