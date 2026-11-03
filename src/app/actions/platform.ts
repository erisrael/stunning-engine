"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as P from "@/server/platform";

// Admin, Platform: the read-only query console.
export async function runQueryAction(sql: string) {
  return wrap(async () => P.runQuery(await requireViewer(), sql), { revalidate: false });
}
