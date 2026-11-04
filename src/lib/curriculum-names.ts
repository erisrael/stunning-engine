// Names in the curriculum: what counts as a placeholder, how to clean a typed title and a camera code, and how a backup
// from the Recording team's old catalog is tidied before it goes in. Shared by the server, the pages and the tests.

const WORDS_ONLY = /^(?:part|par|unit|chapter|lesson|last part|ክፍል|ምዕራፍ)\s*\d*\s*[:.\-–]?$/i;
const PLACEHOLDERS = new Set(["", "topic name", "to be determined", "tbd", "<empty>", "empty", "repeated", "reshoot", "unknown", "overview & fundamentals", "title of the unit", "untitled"]);

// Trailing dots mean the old catalog's title was cut short ("Simple Present ......").
export const stripDots = (t: string) => t.replace(/[\s.…]+$/u, "").trim();

export function isPlaceholderTitle(title: string | null | undefined) {
  const t = stripDots(String(title ?? "")).replace(/\s+/g, " ").toLowerCase();
  return PLACEHOLDERS.has(t) || WORDS_ONLY.test(t);
}

// "Part 3: Forces" -> "Forces". Numbers live in the number field, not in the name.
export function cleanName(raw: string, kind: "unit" | "part") {
  const words = kind === "unit" ? "unit|chapter|ምዕራፍ" : "part|par|lesson|ክፍል";
  const t = raw.replace(/\s+/g, " ").trim();
  return t.replace(new RegExp(`^(?:${words})\\s*\\d*\\s*[:.\\-–]\\s*`, "i"), "").trim() || t;
}

const CODE = /^(?:[A-Z]{1,3}\d{2,}|\d{3,}|\.\.\d+|0Z4A\d+)$/;

// One clean camera code string. Only sure fixes are made: spacing, capitals, "AND" to "&", the letter O typed for a
// zero after C ("CO173"). A word after a code becomes a note. Anything else is kept and listed for a person to look at.
export function cleanCameraCode(raw: string | null | undefined): { code: string; note: string | null; doubtful: boolean } {
  const parts = String(raw ?? "")
    .toUpperCase()
    .replace(/\s+AND\s+/g, " & ")
    .split("&")
    .map((p) => p.trim())
    .filter(Boolean);
  const codes: string[] = [];
  const notes: string[] = [];
  let doubtful = false;
  for (const p of parts) {
    const m = /^(\S+)\s+(.+)$/.exec(p);
    const first = (m ? m[1]! : p).replace(/^CO(?=\d)/, "C0");
    if (CODE.test(first)) {
      codes.push(first);
      if (m) notes.push(m[2]!.charAt(0) + m[2]!.slice(1).toLowerCase());
    } else if (first === "UNKNOWN") codes.push("UNKNOWN");
    else if (!codes.length && !m) {
      codes.push(first);
      doubtful = true;
    } else if (codes.length) notes.push(p.charAt(0) + p.slice(1).toLowerCase());
    else {
      codes.push(p);
      doubtful = true;
    }
  }
  return { code: codes.join(" & "), note: notes.join("; ") || null, doubtful };
}

export type BackupVideo = { id: string; cameraCode?: string; title?: string; description?: string };
export type BackupPart = { id: string; title: string; videos?: BackupVideo[]; progress?: unknown; itemCode?: string };
export type BackupUnit = { id: string; title: string; parts: BackupPart[] };
export type BackupFix = { where: string; what: string };

const UNIT_INSIDE = /\s+(Unit\s*\d+\s*[:.\-–]\s*.+)$/i;
const STRAY = /^(\p{L})\s+((?:unit|chapter)\s*\d+.*)$/iu;

// Tidies one subject's units: a stray letter that belongs to the unit before ("...Medieva" / "l Unit 5: ..."), two units
// typed as one ("Unit 9: A Unit 10: B"), a part with no name that has a named video, and camera codes.
export function tidyUnits(units: BackupUnit[], where: string, fixes: BackupFix[]): BackupUnit[] {
  const out: BackupUnit[] = [];
  for (const raw of units) {
    let title = raw.title.replace(/\s+/g, " ").trim();
    const stray = STRAY.exec(title);
    if (stray && out.length) {
      out[out.length - 1]!.title += stray[1];
      title = stray[2]!;
      fixes.push({ where, what: `Put the stray "${stray[1]}" back on "${out[out.length - 1]!.title}"` });
    }
    const unit: BackupUnit = { ...raw, title, parts: tidyParts(raw.parts ?? [], `${where}, ${title}`, fixes) };
    out.push(unit);
    const merged = UNIT_INSIDE.exec(title);
    if (merged && merged.index > 0) {
      unit.title = title.slice(0, merged.index).trim();
      out.push({ id: `${raw.id}-split`, title: merged[1]!, parts: [] });
      fixes.push({ where, what: `Split "${title}" into two units` });
    }
  }
  return out;
}

function tidyParts(parts: BackupPart[], where: string, fixes: BackupFix[]): BackupPart[] {
  return parts.map((p) => {
    const videos = (p.videos ?? []).map((v) => {
      const c = cleanCameraCode(v.cameraCode);
      if (c.code !== (v.cameraCode ?? "")) fixes.push({ where, what: `Camera code "${v.cameraCode}" is now "${c.code}"` });
      if (c.doubtful) fixes.push({ where, what: `Check the camera code "${c.code}"` });
      const title = isPlaceholderTitle(v.title) ? "" : (v.title ?? "").trim();
      const description = [v.description?.trim(), c.note].filter(Boolean).join(". ");
      return { ...v, cameraCode: c.code, title, description };
    });
    const named = cleanName(p.title, "part");
    if (!isPlaceholderTitle(named)) return { ...p, videos };
    const from = videos.map((v) => stripDots(v.title ?? "")).find((t) => t && !isPlaceholderTitle(t));
    if (!from) return { ...p, videos };
    const number = /\d+/.exec(p.title)?.[0];
    fixes.push({ where, what: `Named the unnamed ${number ? `part ${number}` : "part"} "${from}" from its video` });
    return { ...p, title: number ? `Part ${number}: ${from}` : from, videos };
  });
}

// The whole backup, tidied, with the list of what changed. Ids stay, so importing again updates the same rows.
export function tidyBackup<T extends Record<string, { name: string; subjects: { name: string; units: BackupUnit[] }[] }>>(data: T): { data: T; fixes: BackupFix[] } {
  const fixes: BackupFix[] = [];
  const out = {} as Record<string, unknown>;
  for (const [key, g] of Object.entries(data)) {
    out[key] = { ...g, subjects: g.subjects.map((s) => ({ ...s, units: tidyUnits(s.units ?? [], `${g.name}, ${s.name}`, fixes) })) };
  }
  return { data: out as T, fixes };
}

// Edit distance, for names that look like a typing slip of another name.
export function editDistance(a: string, b: string) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = cur;
    }
  }
  return prev[b.length]!;
}
