// How many SMS parts a text needs, as carriers count them (3GPP TS 23.038): GSM-7 text fits 160 characters in
// one part and 153 per part when split; anything outside GSM-7 (Amharic, emoji, most accents) goes as UCS-2, 70 in
// one part and 67 per part. GSM-7 extension characters (such as { } [ ] ~ \ | ^ and the euro sign) count twice.

const BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const EXTENDED = "\f^{}\\[~]|€";
const basic = new Set([...BASIC]);
const extended = new Set([...EXTENDED]);

export type SmsCount = { encoding: "GSM-7" | "UCS-2"; characters: number; units: number; segments: number; perSegment: number; remaining: number };

export function smsCount(text: string): SmsCount {
  const chars = [...text];
  const gsm = chars.every((c) => basic.has(c) || extended.has(c));
  if (gsm) {
    const units = chars.reduce((n, c) => n + (extended.has(c) ? 2 : 1), 0);
    const single = units <= 160;
    const perSegment = single ? 160 : 153;
    const segments = units === 0 ? 0 : single ? 1 : Math.ceil(units / 153);
    return { encoding: "GSM-7", characters: chars.length, units, segments, perSegment, remaining: segments ? segments * perSegment - units : 160 };
  }
  // UCS-2 counts UTF-16 code units: a character outside the basic plane (most emoji) takes two.
  const units = text.length;
  const single = units <= 70;
  const perSegment = single ? 70 : 67;
  const segments = single ? 1 : Math.ceil(units / 67);
  return { encoding: "UCS-2", characters: chars.length, units, segments, perSegment, remaining: segments * perSegment - units };
}
