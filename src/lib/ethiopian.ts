// The Ethiopian calendar (Phase 16.4): 12 months of 30 days and Pagume (5 days, 6 in the year before a Gregorian
// leap year), the year starting on 11 September (12 September before a Gregorian leap year), seven or eight
// years behind the Gregorian year. Converted through the Julian day number, with Amharic month names.

export const ET_MONTHS = ["መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ"];
export const ET_MONTHS_LATIN = ["Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit", "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"];

const ET_EPOCH = 1723856;

function gregorianToJdn(y: number, m: number, d: number) {
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return d + Math.floor((153 * m2 + 2) / 5) + 365 * y2 + Math.floor(y2 / 4) - Math.floor(y2 / 100) + Math.floor(y2 / 400) - 32045;
}
function jdnToGregorian(j: number) {
  const a = j + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return { year: 100 * b + d - 4800 + Math.floor(m / 10), month: m + 3 - 12 * Math.floor(m / 10), day: e - Math.floor((153 * m + 2) / 5) + 1 };
}

export function toEthiopian(y: number, m: number, d: number) {
  const jdn = gregorianToJdn(y, m, d);
  const r = (jdn - ET_EPOCH) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return { year: 4 * Math.floor((jdn - ET_EPOCH) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460), month: Math.floor(n / 30) + 1, day: (n % 30) + 1 };
}

export function fromEthiopian(year: number, month: number, day: number) {
  const jdn = ET_EPOCH + 365 + 365 * (year - 1) + Math.floor(year / 4) + 30 * month + day - 31;
  return jdnToGregorian(jdn);
}

// "ጥቅምት 24, 2019" (or "Tikimt 24, 2019" in Latin letters).
export function formatEthiopian(date: Date | string, opts: { latin?: boolean } = {}) {
  const d = typeof date === "string" ? new Date(date.length === 10 ? `${date}T12:00:00Z` : date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const e = toEthiopian(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${(opts.latin ? ET_MONTHS_LATIN : ET_MONTHS)[e.month - 1]} ${e.day}, ${e.year}`;
}
