import { all, placeholders } from "./db";
import type { ItemListRow } from "./queries";

export type SheetExtra = {
  rawFiles: number;
  master: { version: number; url: string } | null;
  captions: boolean;
  thumbnail: boolean;
  destination: { platform: string; ref: string | null; url: string | null } | null;
  uploadVerified: { done: number; total: number };
  session: string | null;
  handoff: "waiting" | "accepted" | "returned" | null;
  fieldComments: Record<string, number>;
  lastEditor: string | null;
};

export async function sheetExtras(rows: ItemListRow[]): Promise<Record<string, SheetExtra>> {
  const ids = rows.map((r) => r.id);
  const out: Record<string, SheetExtra> = {};
  for (const r of rows)
    out[r.id] = {
      rawFiles: 0,
      master: null,
      captions: false,
      thumbnail: false,
      destination: null,
      uploadVerified: { done: 0, total: 0 },
      session: null,
      handoff: r.stage_status === "awaiting_handoff" ? "waiting" : null,
      fieldComments: {},
      lastEditor: r.last_actor_id,
    };
  for (let i = 0; i < ids.length; i += 400) {
    const c = ids.slice(i, i + 400);
    const ph = placeholders(c.length);
    for (const a of await all<{ item_id: string; kind: string; version_no: number; url: string; status: string }>(
          `SELECT item_id, kind, version_no, url, status FROM assets WHERE item_id IN (${ph}) AND status IN ('current')`,
          ...c,
        )) {
      const e = out[a.item_id];
      if (a.kind === "raw") e.rawFiles++;
      if (a.kind === "master" && (!e.master || a.version_no > e.master.version)) e.master = { version: a.version_no, url: a.url };
      if (a.kind === "captions") e.captions = true;
      if (a.kind === "thumbnail") e.thumbnail = true;
    }
    for (const t of await all<{ item_id: string; platform: string; required: number; external_id: string | null; upload_url: string | null; playback_checked: number; metadata_checked: number }>(
          `SELECT item_id, platform, required, external_id, upload_url, playback_checked, metadata_checked FROM publication_targets WHERE item_id IN (${ph}) ORDER BY required DESC`,
          ...c,
        )) {
      const e = out[t.item_id];
      if (!e.destination && (t.external_id || t.upload_url)) e.destination = { platform: t.platform, ref: t.external_id, url: t.upload_url };
      if (t.required) {
        e.uploadVerified.total++;
        if (t.playback_checked && t.metadata_checked) e.uploadVerified.done++;
      }
    }
    for (const s of await all<{ item_id: string; scheduled_start: string }>(
          `SELECT item_id, MIN(scheduled_start) AS scheduled_start FROM recording_sessions WHERE item_id IN (${ph}) AND status = 'scheduled' GROUP BY item_id`,
          ...c,
        ))
      out[s.item_id].session = s.scheduled_start;
    for (const cm of await all<{ item_id: string; field: string; n: number }>(
          `SELECT item_id, field, COUNT(*) AS n FROM comments WHERE item_id IN (${ph}) AND field IS NOT NULL AND deleted_at IS NULL AND resolved = 0 GROUP BY item_id, field`,
          ...c,
        ))
      out[cm.item_id].fieldComments[cm.field] = cm.n;
    for (const h of await all<{ item_id: string; decision: string }>(
          `SELECT item_id, decision FROM handoff_reviews hr WHERE item_id IN (${ph}) AND kind = 'handoff'
       AND created_at = (SELECT MAX(created_at) FROM handoff_reviews x WHERE x.item_id = hr.item_id AND x.kind = 'handoff')`,
          ...c,
        )) {
      const e = out[h.item_id];
      if (!e.handoff) e.handoff = h.decision === "accepted" ? "accepted" : "returned";
    }
  }
  return out;
}
