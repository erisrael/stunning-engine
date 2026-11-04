"use server";

import { requireViewer } from "@/server/auth";
import { all } from "@/server/db";

// The person's own approved runs from one file, in order, for the browser to do one after another.
export async function listApprovedInBatch(batchId: string) {
  const viewer = await requireViewer();
  const rows = await all<{ id: string }>("SELECT id FROM assistant_runs WHERE batch_id = ? AND user_id = ? AND status = 'approved' ORDER BY requested_at", batchId, viewer.id);
  return rows.map((r) => r.id);
}
