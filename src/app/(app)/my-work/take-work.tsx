"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { itemAction } from "@/app/actions/items";
import type { Stage } from "@/lib/domain";

// A lead takes a part waiting in their stage for themselves; it then shows on their own board above.
export function TakeWork({ items, me }: { items: { id: string; code: string; title: string; place: string; stage: Stage; stageLabel: string }[]; me: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  return (
    <Card data-take-work>
      <CardHeader>
        <CardTitle className="text-base">Waiting with nobody on it ({items.length})</CardTitle>
        <CardDescription>In the stages you lead. Take one to do it yourself; assigning it to your team is on Home.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y text-sm">
        {items.slice(0, 50).map((i) => (
          <div key={i.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{i.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {i.stageLabel} · {i.place} · <span className="font-mono">{i.code}</span>
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === i.id}
              onClick={async () => {
                setBusy(i.id);
                const r = await itemAction(i.id, { action: "assign", stage: i.stage, userId: me, reason: "Took it myself" });
                setBusy(null);
                if (!r.ok) return void toast.error(r.error);
                toast.success("It is on your board");
                router.refresh();
              }}
            >
              <HandIcon /> Take it
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
