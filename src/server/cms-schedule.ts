import { get, nowIso } from "./db";
import { getLegacyCmsConfig, syncLegacyCms } from "./legacy-cms";
import { acquireLease, releaseLease, runJob } from "./ops";
import { getMeta, setMeta } from "./settings";
import { loadUser } from "./users";

// Separate from the ten-minute housekeeping cycle: this observes the configured
// interval to the nearest minute, and a database lease prevents duplicate workers.
export async function scheduledCmsSync(now = nowIso(), recordJob = false) {
  if (!await get("SELECT key FROM settings WHERE key = 'cfg.legacy_cms'")) return;
  const config = await getLegacyCmsConfig();
  if (!config.autoSync || !config.username || !config.password) return;
  const last = await getMeta("cmsAutoSyncAttempt");
  if (last && Date.parse(now) - Date.parse(last) < config.syncIntervalMinutes * 60_000) return;
  if (!await acquireLease("cms-auto-sync", 2 * 60 * 60_000)) return;
  try {
    const latest = await getMeta("cmsAutoSyncAttempt");
    if (latest && Date.parse(now) - Date.parse(latest) < config.syncIntervalMinutes * 60_000) return;
    const row = await get<{ id: string }>("SELECT u.id FROM users u JOIN role_assignments r ON r.user_id=u.id WHERE u.active=1 AND r.role='admin' ORDER BY u.id LIMIT 1");
    const actor = row && await loadUser(row.id);
    if (!actor) throw new Error("CMS automatic refresh needs an active system administrator.");
    await setMeta("cmsAutoSyncAttempt", now);
    const sync = async () => {
      const result = await syncLegacyCms(actor, { category: "all", deep: true });
      if (!result.ok) throw new Error(result.message);
      return result;
    };
    return recordJob ? await runJob("legacy-cms", sync) : await sync();
  } finally {
    await releaseLease("cms-auto-sync");
  }
}
