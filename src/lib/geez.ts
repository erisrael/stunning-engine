// Latin letters to Ge'ez (Amharic) as people type them in chats: "selam" -> ሰላም, "amesegnalehu" -> አመሰግናለሁ.
// A consonant takes the vowel after it: e (ä) u i a ie/E (é) o; a consonant with no vowel is the sixth form.
// Capitals and pairs give the other consonants: sh ch ny zh ts ph, T C P S H N Z. Digits, spaces and anything else
// stay as they are, and Ge'ez already in the text is kept.
const BASE: Record<string, number> = {
  h: 0x1200, l: 0x1208, H: 0x1210, m: 0x1218, r: 0x1228, s: 0x1230, sh: 0x1238, x: 0x1238, q: 0x1240, b: 0x1260, v: 0x1268,
  t: 0x1270, ch: 0x1278, c: 0x1278, n: 0x1290, ny: 0x1298, N: 0x1298, k: 0x12a8, w: 0x12c8, z: 0x12d8, zh: 0x12e0, Z: 0x12e0,
  y: 0x12e8, d: 0x12f0, j: 0x1300, g: 0x1308, T: 0x1320, C: 0x1328, P: 0x1330, ph: 0x1330, S: 0x1338, ts: 0x1338, f: 0x1348, p: 0x1350,
};
const PAIRS = ["sh", "ch", "ny", "zh", "ts", "ph"];
// Vowel orders: ä u i a é (6th = none) o.
const ORDER: Record<string, number> = { e: 0, u: 1, i: 2, a: 3, ie: 4, E: 4, o: 6 };
// A vowel on its own (አ row).
const ALONE: Record<string, string> = { a: "አ", e: "እ", u: "ኡ", i: "ኢ", ie: "ኤ", E: "ኤ", o: "ኦ" };

function vowelAt(s: string, i: number): [string, number] | null {
  if (s.startsWith("ie", i)) return ["ie", 2];
  const v = s[i];
  return v && v in ORDER ? [v, 1] : null;
}

export function toGeez(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    const pair = input.slice(i, i + 2).toLowerCase();
    let cons: string | null = null;
    let len = 0;
    if (PAIRS.includes(pair)) [cons, len] = [pair, 2];
    else if (ch in BASE) [cons, len] = [ch, 1];
    else if (ch.toLowerCase() in BASE && !"THCPSNZE".includes(ch)) [cons, len] = [ch.toLowerCase(), 1];
    if (cons) {
      const v = vowelAt(input, i + len);
      out += String.fromCodePoint(BASE[cons]! + (v ? ORDER[v[0]]! : 5));
      i += len + (v ? v[1] : 0);
      continue;
    }
    const v = vowelAt(input, i);
    if (v) {
      out += ALONE[v[0]]!;
      i += v[1];
      continue;
    }
    // An apostrophe separates letters that would otherwise join (s'a = ስአ); it is not written.
    if (ch !== "'") out += ch;
    i++;
  }
  return out;
}

// Turns only the word being finished (on space or punctuation) so people see Ge'ez as they type.
export function geezAsYouType(text: string): string {
  return text.replace(/[A-Za-z']+(?=[\s.,!?;:]$)/, (w) => toGeez(w));
}
