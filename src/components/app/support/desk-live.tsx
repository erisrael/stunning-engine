"use client";

// The desk's live stream (Update 1.1, phase 12): the list refreshes when tickets change, and the open ticket shows
// new messages at once, the customer typing, when they read it and whether they are online. Agents' typing and
// reading go back to the customer; agents send files and voice notes.
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileTextIcon, Loader2Icon, MicIcon, PaperclipIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentReadAction, agentTypingAction } from "@/app/actions/support-desk";
import { cn } from "@/lib/utils";

export type TicketLive = { stamp: string; status: string; typing: boolean; read: string | null; online: boolean; lastSeen: string | null };
const Ctx = React.createContext<{ ticket: TicketLive | null; connected: boolean }>({ ticket: null, connected: false });
export const useTicketLive = () => React.useContext(Ctx);

export function DeskLive({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sp = useSearchParams();
  const ticket = sp.get("ticket");
  const [state, setState] = React.useState<{ ticket: TicketLive | null; connected: boolean }>({ ticket: null, connected: false });
  React.useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/support/live${ticket ? `?ticket=${encodeURIComponent(ticket)}` : ""}`);
    let inbox = "";
    let stamp = "";
    let refresh: number | null = null;
    const soon = () => {
      if (refresh) window.clearTimeout(refresh);
      refresh = window.setTimeout(() => router.refresh(), 250);
    };
    es.onopen = () => setState((s) => ({ ...s, connected: true }));
    es.onerror = () => setState((s) => ({ ...s, connected: false }));
    es.onmessage = (e) => {
      const v = JSON.parse(e.data) as { inbox: string; ticket: TicketLive | null };
      setState({ ticket: v.ticket, connected: true });
      if ((inbox && v.inbox !== inbox) || (stamp && v.ticket && v.ticket.stamp !== stamp)) soon();
      inbox = v.inbox;
      stamp = v.ticket?.stamp ?? "";
      if (ticket && v.ticket) void agentReadAction(ticket);
    };
    return () => {
      es.close();
      if (refresh) window.clearTimeout(refresh);
    };
  }, [ticket, router]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

// The customer's state next to the ticket title.
export function CustomerPresence() {
  const { ticket } = useTicketLive();
  if (!ticket) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground" data-customer-presence={ticket.online ? "online" : "offline"}>
      <span className={cn("size-2 rounded-full", ticket.online ? "bg-emerald-500" : "bg-muted-foreground/40")} />
      {ticket.online ? "Customer online" : "Customer offline"}
    </span>
  );
}

export function CustomerTyping() {
  const { ticket } = useTicketLive();
  return ticket?.typing ? (
    <p className="text-xs text-muted-foreground" data-customer-typing>
      Customer is typing…
    </p>
  ) : null;
}

// "Seen" under the agent's last public message once the customer has read the conversation after it.
export function seenBy(read: string | null | undefined, at: string) {
  return !!read && read >= at;
}

// Typing goes to the customer at most every 3 seconds.
export function useAgentTyping(ticketId: string) {
  const last = React.useRef(0);
  return React.useCallback(() => {
    if (Date.now() - last.current < 3000) return;
    last.current = Date.now();
    void agentTypingAction(ticketId);
  }, [ticketId]);
}

export function TranscriptLink({ ticketId }: { ticketId: string }) {
  return (
    <a href={`/api/support/transcript/${ticketId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" data-transcript>
      <FileTextIcon className="size-3.5" /> Transcript
    </a>
  );
}

// Send a file or record a voice note to the customer.
export function AgentAttach({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [rec, setRec] = React.useState<{ r: MediaRecorder; started: number } | null>(null);
  const [secs, setSecs] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!rec) return;
    const i = window.setInterval(() => setSecs(Math.round((Date.now() - rec.started) / 1000)), 500);
    return () => window.clearInterval(i);
  }, [rec]);
  const send = async (blob: Blob, name: string) => {
    if (blob.size > 10 * 1024 * 1024) return void toast.error("The file is larger than 10 MB.");
    setBusy(true);
    const r = await fetch(`/api/support/upload?ticket=${encodeURIComponent(ticketId)}&name=${encodeURIComponent(name)}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    setBusy(false);
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return void toast.error(j.error ?? "Could not send.");
    toast.success(blob.type.startsWith("audio/") ? "Voice note sent" : "File sent");
    router.refresh();
  };
  const record = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((x) => x.stop());
        void send(new Blob(chunks, { type: r.mimeType || "audio/webm" }), `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`);
      };
      r.start();
      setSecs(0);
      setRec({ r, started: Date.now() });
    } catch {
      toast.error("Allow the microphone to record.");
    }
  };
  if (rec)
    return (
      <span className="inline-flex items-center gap-2 text-xs" data-agent-recording>
        <span className="size-2 animate-pulse rounded-full bg-[#D93025]" /> 0:{String(secs).padStart(2, "0")}
        <Button size="xs" variant="outline" onClick={() => (rec.r.stop(), setRec(null))}>
          <SquareIcon /> Stop and send
        </Button>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <input ref={input} type="file" className="hidden" onChange={(e) => (e.target.files?.[0] && void send(e.target.files[0], e.target.files[0].name), (e.target.value = ""))} data-agent-file-input />
      <Button size="icon-xs" variant="ghost" aria-label="Send a file" title="Send a file" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <PaperclipIcon />}
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Record a voice note" title="Record a voice note" disabled={busy} onClick={() => void record()}>
        <MicIcon />
      </Button>
    </span>
  );
}
