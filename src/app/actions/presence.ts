"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";

// The open app says it is here (every minute) and whether its page is in view; Admin's live roster reads it.
export async function pingPresenceAction(visible: boolean) {
  return wrap(
    async () => {
      const viewer = await requireViewer();
      // Previewing as someone else never marks them present.
      if (viewer.previewBy) return;
      await (await import("@/server/live-dashboard")).pingPresence(viewer, !!visible);
    },
    { revalidate: false },
  );
}
