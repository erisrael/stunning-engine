"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2Icon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendToNotionAction } from "@/app/actions/tools";

// Sends Markdown to the person's own Notion (connected in Tools, Connections). Without a connection it says how.
export function NotionButton({ title, markdown }: { title: string; markdown: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await sendToNotionAction({ title, markdown });
        setBusy(false);
        if (!r.ok)
          return toast.error(r.error, {
            action: /Connect/.test(r.error) ? { label: "Connect", onClick: () => (window.location.href = "/tools#connections") } : undefined,
          });
        const url = (r.data as { url: string }).url;
        toast.success("Sent to Notion", { action: { label: "Open", onClick: () => window.open(url, "_blank", "noopener") } });
      }}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send to Notion
    </Button>
  );
}

export function NotionHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Not using Notion? Download Markdown or CSV instead, or <Link href="/tools#connections" className="underline">connect it</Link>.
    </p>
  );
}
