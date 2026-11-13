"use client";

// A slide-over preview of a ticket: open it from any list to read the last messages, the customer and the calls
// without leaving the page; "Open in desk" goes to the full ticket.
import * as React from "react";
import Link from "next/link";
import { Loader2Icon, PhoneIncomingIcon, PhoneOutgoingIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ticketPreviewAction } from "@/app/actions/support-desk";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/support";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

type Preview = NonNullable<Extract<Awaited<ReturnType<typeof ticketPreviewAction>>, { ok: true }>["data"]>;

const Ctx = React.createContext<(id: string) => void>(() => {});
export const useTicketPreview = () => React.useContext(Ctx);

export function TicketPreviewProvider({ children }: { children: React.ReactNode }) {
  const [id, setId] = React.useState<string | null>(null);
  const [data, setData] = React.useState<Preview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!id) return;
    let live = true;
    setData(null);
    setError(null);
    ticketPreviewAction(id).then((r) => {
      if (!live) return;
      if (r.ok) setData(r.data ?? null);
      else setError(r.error ?? "Could not open the ticket.");
    });
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <Ctx.Provider value={setId}>
      {children}
      <Sheet open={!!id} onOpenChange={(o) => !o && setId(null)}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md" data-ticket-preview>
          <SheetHeader className="border-b">
            <SheetTitle className="pr-8">{data ? `#${data.number} ${data.subject}` : "Ticket"}</SheetTitle>
            <SheetDescription>
              {data ? `${TICKET_STATUS_LABELS[data.status as TicketStatus] ?? data.status} · ${data.priority} · ${data.channel}${data.queue ? ` · ${data.queue}` : ""} · ${data.assignee ?? "Unassigned"}` : "Loading"}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!data && !error && <Loader2Icon className="mx-auto size-5 animate-spin text-muted-foreground" />}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {data && (
              <>
                {data.customer && (
                  <div className="rounded-lg border p-3 text-sm" data-preview-customer>
                    <p className="font-medium">{data.customer.name}</p>
                    <p className="text-xs text-muted-foreground">{[data.customer.email, data.customer.phone, data.customer.app].filter(Boolean).join(" · ") || "No contact details"}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Last messages</p>
                  {data.messages.map((m) => (
                    <div key={m.id} className={cn("rounded-lg px-3 py-2 text-sm", m.kind === "agent" ? "ml-6 bg-primary/10" : m.kind === "customer" ? "mr-6 bg-muted" : "bg-muted/50 text-xs text-muted-foreground")}>
                      <p className="mb-0.5 text-xs text-muted-foreground">
                        {m.author ?? "System"} · {fmtRelative(m.at)}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    </div>
                  ))}
                  {!data.messages.length && <p className="text-sm text-muted-foreground">No messages yet.</p>}
                </div>
                {data.calls.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Calls</p>
                    {data.calls.map((c) => (
                      <p key={c.id} className="flex items-center gap-2 text-sm">
                        {c.direction === "outbound" ? <PhoneOutgoingIcon className="size-3.5 text-muted-foreground" /> : <PhoneIncomingIcon className="size-3.5 text-muted-foreground" />}
                        {c.status} · {c.durationS ? `${Math.floor(c.durationS / 60)}:${String(c.durationS % 60).padStart(2, "0")}` : "–"} · {fmtRelative(c.startedAt)}
                        {c.recorded ? " · recorded" : ""}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          {data && (
            <div className="border-t p-3">
              <Button asChild className="w-full" size="sm">
                <Link href={`/support?tab=desk&ticket=${data.id}`} onClick={() => setId(null)}>
                  Open in desk
                </Link>
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}

// A row's preview button (a small client island in server-rendered lists).
export function PreviewButton({ id, label }: { id: string; label: string }) {
  const open = useTicketPreview();
  return (
    <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => open(id)} aria-label={label} data-preview-ticket={id}>
      Preview
    </Button>
  );
}
