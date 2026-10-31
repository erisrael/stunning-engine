// Which backups to keep: the newest of each of the last N days, N weeks and N months that have a backup
// (7, 4 and 12 by default), and always the very newest. Everything else can be deleted.

export type Keep = { daily: number; weekly: number; monthly: number };
export const DEFAULT_KEEP: Keep = { daily: 7, weekly: 4, monthly: 12 };

const BACKUP_NAME = /^myseed-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.json\.gz(\.enc)?$/;

export function isBackupName(name: string) {
  return BACKUP_NAME.test(name);
}

// The time in the name (UTC), so the rule works the same on the disk, Google Drive and S3.
export function backupTime(name: string): Date | null {
  const m = BACKUP_NAME.exec(name);
  return m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!)) : null;
}

export function backupName(at: Date, encrypted: boolean) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `myseed-${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}-${p(at.getUTCHours())}${p(at.getUTCMinutes())}.json.gz${encrypted ? ".enc" : ""}`;
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  return `${y}-W${Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)}`;
}

export function backupsToKeep(names: string[], keep: Keep = DEFAULT_KEEP): Set<string> {
  const dated = names
    .map((n) => ({ n, t: backupTime(n) }))
    .filter((x): x is { n: string; t: Date } => !!x.t)
    .sort((a, b) => b.t.getTime() - a.t.getTime());
  const out = new Set<string>();
  if (dated[0]) out.add(dated[0].n);
  const take = (key: (d: Date) => string, count: number) => {
    const seen = new Set<string>();
    for (const x of dated) {
      const k = key(x.t);
      if (seen.has(k)) continue;
      if (seen.size >= count) break;
      seen.add(k);
      out.add(x.n);
    }
  };
  take((d) => d.toISOString().slice(0, 10), keep.daily);
  take(isoWeek, keep.weekly);
  take((d) => d.toISOString().slice(0, 7), keep.monthly);
  return out;
}
