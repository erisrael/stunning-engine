"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { FlagIcon, MessageSquareHeartIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/app/status-pill";
import { sendFeedbackAction } from "@/app/actions/support";
import { ReportDialog } from "@/app/(app)/chat/chat-plus";
import { AttachPicker, FileLinks, pastedFiles, useAttachments } from "@/components/app/attach-picker";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function FeedbackForm({ categories, onSent, page }: { categories: Record<string, string>; onSent?: () => void; page?: string }) {
  const router = useRouter();
  const [category, setCategory] = React.useState("idea");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const att = useAttachments();
  return (
    <div className="space-y-3" data-feedback-form>
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="w-full" aria-label="Kind of feedback">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(categories).map(([k, v]) => (
            <SelectItem key={k} value={k}>
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Long notes scroll inside the box instead of pushing the form off the screen. */}
      <Textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onPaste={(e) => {
          const f = pastedFiles(e);
          if (f.length) {
            e.preventDefault();
            void att.add(f);
          }
        }}
        rows={5}
        className="max-h-[40vh] min-h-28 resize-y overflow-y-auto [field-sizing:fixed]"
        placeholder="What would make the app better, what went wrong, or what you liked. Steps to repeat a problem help a lot."
        aria-label="Your feedback"
      />
      <AttachPicker files={att.files} add={(f) => void att.add(f)} remove={att.remove} />
      <Button
        disabled={busy || (message.trim().length < 3 && !att.files.length)}
        onClick={async () => {
          setBusy(true);
          const r = await sendFeedbackAction({ category, message, page: page ?? null, files: att.payload() });
          setBusy(false);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Thank you. Admin reads every message and you are told about replies.");
          setMessage("");
          att.clear();
          onSent?.();
          router.refresh();
        }}
      >
        <SendIcon /> Send to Admin
      </Button>
    </div>
  );
}

// Opened from the account menu on any page; the page it was sent from is kept with it.
export function FeedbackDialog({ open, onOpenChange, categories }: { open: boolean; onOpenChange: (o: boolean) => void; categories: Record<string, string> }) {
  const pathname = usePathname();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareHeartIcon className="size-5" /> Send feedback
          </DialogTitle>
          <DialogDescription>Goes straight to Admin, with any screenshots or documents you attach. Your earlier feedback and replies are on the Feedback page.</DialogDescription>
        </DialogHeader>
        <FeedbackForm categories={categories} page={pathname} onSent={() => onOpenChange(false)} />
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}

export function MyFeedback({ rows, categories, statuses }: { rows: { id: string; category: string; message: string; status: string; reply: string | null; created_at: string; files?: { id: string; name: string; mime: string; size: number }[] }[]; categories: Record<string, string>; statuses: Record<string, string> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What you sent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {rows.map((f) => (
          <div key={f.id} className="rounded-lg border px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {categories[f.category] ?? f.category} · {when(f.created_at)}
              <StatusPill size="xs" className="ml-auto" tone={f.status === "done" ? "done" : f.status === "new" ? "paused" : "neutral"} label={statuses[f.status] ?? f.status} />
            </div>
            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap">{f.message}</p>
            <FileLinks files={f.files ?? []} base="/api/feedback-files" />
            {f.reply && <p className="mt-1 rounded bg-muted px-2 py-1 text-xs">Admin: {f.reply}</p>}
          </div>
        ))}
        {!rows.length && <p className="text-muted-foreground">Nothing sent yet.</p>}
      </CardContent>
    </Card>
  );
}

export function ReportSomething() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <FlagIcon /> Report a problem
      </Button>
      {open && <ReportDialog target={{ targetType: "other", targetLabel: null }} onClose={() => setOpen(false)} />}
    </>
  );
}
