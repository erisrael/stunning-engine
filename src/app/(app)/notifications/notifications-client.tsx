"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationList } from "@/components/app/topbar";
import { markNotificationsAction } from "@/app/actions/collab";
import { savePrefsAction } from "@/app/actions/admin";
import { ESSENTIAL_NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES, type NotificationType } from "@/lib/domain";

export function Inbox() {
  const [tab, setTab] = React.useState("all");
  const [key, setKey] = React.useState(0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={setTab} className="max-w-full min-w-0">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {["all", "unread", "mentions", "assignments", "approvals", "alerts"].map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await markNotificationsAction("all");
            setKey((k) => k + 1);
            toast.success("All marked read");
          }}
        >
          Mark all read
        </Button>
      </div>
      <div className="rounded-xl border bg-card px-2">
        <NotificationList key={`${tab}-${key}`} tab={tab} />
      </div>
    </div>
  );
}

export function Preferences({ muted }: { muted: string[] }) {
  const [m, setM] = React.useState<string[]>(muted);
  const toggle = async (t: NotificationType, on: boolean) => {
    const next = on ? m.filter((x) => x !== t) : [...m, t];
    setM(next);
    const r = await savePrefsAction({ mutedNotificationTypes: next });
    if (!r.ok) toast.error(r.error);
  };
  return (
    <ul className="divide-y">
      {NOTIFICATION_TYPES.map((t) => {
        const essential = ESSENTIAL_NOTIFICATION_TYPES.includes(t);
        return (
          <li key={t} className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm">{NOTIFICATION_TYPE_LABELS[t]}</p>
              {essential && <p className="text-xs text-muted-foreground">Essential workflow notice; always delivered</p>}
            </div>
            <Switch checked={essential || !m.includes(t)} disabled={essential} onCheckedChange={(v) => toggle(t, v)} aria-label={NOTIFICATION_TYPE_LABELS[t]} />
          </li>
        );
      })}
    </ul>
  );
}
