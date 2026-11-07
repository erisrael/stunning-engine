"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  InboxIcon,
  Loader2Icon,
  SendIcon,
  LaptopIcon,
  KeyIcon,
  CoinsIcon,
  WrenchIcon,
  CheckCircle2Icon,
  XCircleIcon,
  ArrowUpRightIcon,
  ArrowDownLeftIcon,
  ClockIcon,
  CheckIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/app/primitives";
import { createRequestAction, decideRequestAction } from "@/app/actions/departments";

export type DeptRequestTarget = {
  dept: string;
  title: string;
  task: string;
  intro: string;
  types: { key: string; label: string }[];
};

export type DeptRequestItem = {
  id: string;
  dept: string;
  deptTitle: string;
  code: string;
  title: string;
  description?: string | null;
  statusLabel: string;
  status_category: string;
  request_state: string | null;
  assignee_name: string | null;
  created_at: string;
  due_date: string | null;
  requested_by_name?: string | null;
};

export function DeptRequestsView({
  dept,
  deptTitle,
  canManage,
  targets,
  incoming,
  outgoing,
  people,
}: {
  dept: string;
  deptTitle: string;
  canManage: boolean;
  targets: DeptRequestTarget[];
  incoming: DeptRequestItem[];
  outgoing: DeptRequestItem[];
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"incoming" | "outgoing" | "new">("incoming");
  const [targetDept, setTargetDept] = React.useState(targets[0]?.dept ?? "");
  const selectedTarget = targets.find((t) => t.dept === targetDept);

  const [form, setForm] = React.useState({
    type: selectedTarget?.types[0]?.key ?? "",
    title: "",
    description: "",
    dueDate: "",
    estimatedCost: "",
  });
  const [busy, setBusy] = React.useState(false);

  // Decision Modal for Leads/Heads
  const [decisionModal, setDecisionModal] = React.useState<{
    item: DeptRequestItem;
    action: "accept" | "decline";
  } | null>(null);
  const [assigneeId, setAssigneeId] = React.useState("");
  const [decisionNote, setDecisionNote] = React.useState("");

  React.useEffect(() => {
    setForm((x) => ({ ...x, type: selectedTarget?.types[0]?.key ?? "" }));
  }, [selectedTarget]);

  const applyPreset = (category: string, titlePlaceholder: string) => {
    setForm((prev) => ({
      ...prev,
      title: prev.title || titlePlaceholder,
      description:
        prev.description ||
        `[Category: ${category}]\nJustification / Purpose:\nTechnical Specifications or Breakdown:\nBudget Impact & Timelines:`,
    }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Provide a request title.");
    if (!targetDept) return toast.error("Choose a target department.");

    setBusy(true);
    const res = await createRequestAction(targetDept, {
      title: form.title.trim(),
      description: form.description.trim() ? form.description.trim() : null,
      type: form.type || "request",
      dueDate: form.dueDate || null,
    });
    setBusy(false);

    if (!res.ok) {
      toast.error(res.error || "Failed to create request.");
      return;
    }

    toast.success("Request submitted successfully.");
    setForm({
      type: selectedTarget?.types[0]?.key ?? "",
      title: "",
      description: "",
      dueDate: "",
      estimatedCost: "",
    });
    setActiveTab("outgoing");
    router.refresh();
  };

  const handleDecision = async () => {
    if (!decisionModal) return;
    const { item, action } = decisionModal;

    if (action === "decline" && !decisionNote.trim()) {
      toast.error("Please explain the reason for declining.");
      return;
    }

    setBusy(true);
    const res = await decideRequestAction(dept, item.id, action, {
      assigneeId: assigneeId || null,
      note: decisionNote.trim() || null,
    });
    setBusy(false);

    if (!res.ok) {
      toast.error(res.error || "Action failed.");
      return;
    }

    toast.success(action === "accept" ? "Request accepted." : "Request declined.");
    setDecisionModal(null);
    setDecisionNote("");
    setAssigneeId("");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {/* Top Header / Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant={activeTab === "incoming" ? "default" : "outline"}
            onClick={() => setActiveTab("incoming")}
            className="gap-1.5"
          >
            <ArrowDownLeftIcon className="size-4" />
            Incoming Requests
            {incoming.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs font-semibold">
                {incoming.length}
              </Badge>
            )}
          </Button>
          <Button
            size="sm"
            variant={activeTab === "outgoing" ? "default" : "outline"}
            onClick={() => setActiveTab("outgoing")}
            className="gap-1.5"
          >
            <ArrowUpRightIcon className="size-4" />
            Outgoing Requests
            {outgoing.length > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs font-semibold">
                {outgoing.length}
              </Badge>
            )}
          </Button>
          <Button
            size="sm"
            variant={activeTab === "new" ? "default" : "outline"}
            onClick={() => setActiveTab("new")}
            className="gap-1.5"
          >
            <SendIcon className="size-4" />
            Submit New Request
          </Button>
        </div>
      </div>

      {/* NEW REQUEST FORM */}
      {activeTab === "new" && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">Submit Department Request</CardTitle>
            <CardDescription>
              Request equipment, budget, subscriptions, or cross-department work. Heads and leads review each request.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-3.5">
              {/* Presets */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">Quick Presets</span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    type="button"
                    onClick={() => applyPreset("Hardware / Devices", "Request for New Laptop / Hardware Equipment")}
                  >
                    <LaptopIcon className="size-3.5 mr-1" />
                    Devices &amp; Hardware
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    type="button"
                    onClick={() => applyPreset("Software Subscription", "Subscription Renewal / New Tool License")}
                  >
                    <KeyIcon className="size-3.5 mr-1" />
                    Software &amp; Subscriptions
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    type="button"
                    onClick={() => applyPreset("Budget Allocation", "Budget Allocation Request for Project")}
                  >
                    <CoinsIcon className="size-3.5 mr-1" />
                    Budget Allocation
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    type="button"
                    onClick={() => applyPreset("Equipment Repair", "Equipment Repair / Replacement Request")}
                  >
                    <WrenchIcon className="size-3.5 mr-1" />
                    Repair &amp; Replacement
                  </Button>
                </div>
              </div>

              {/* Target Department */}
              <div className="space-y-1.5">
                <Label>Destination Department</Label>
                <Select value={targetDept} onValueChange={setTargetDept}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select target department" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((t) => (
                      <SelectItem key={t.dept} value={t.dept}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTarget?.intro && (
                  <p className="text-xs text-muted-foreground">{selectedTarget.intro}</p>
                )}
              </div>

              {/* Request Title */}
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Upgrade RAM for dev workstation"
                  required
                />
              </div>

              {/* Type & Due Date */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {selectedTarget && selectedTarget.types.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Request Type</Label>
                    <Select value={form.type} onValueChange={(type) => setForm({ ...form, type })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedTarget.types.map((type) => (
                          <SelectItem key={type.key} value={type.key}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Required By (Due Date)</Label>
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label>Details &amp; Justification</Label>
                <Textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Explain why this request is needed, requirements, and any estimated budget..."
                />
              </div>

              <Button type="submit" disabled={busy} className="gap-2">
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
                Submit Request
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* INCOMING REQUESTS */}
      {activeTab === "incoming" && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Requests submitted by other teams to {deptTitle}. Leads and Heads can review and accept or decline.
          </div>
          {incoming.length === 0 ? (
            <EmptyState
              title="No incoming requests"
              description={`Other departments haven't sent any requests to ${deptTitle} yet.`}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {incoming.map((r) => {
                const isPending = r.request_state === "pending";
                const isAccepted = r.request_state === "accepted";
                const isDeclined = r.request_state === "declined";
                return (
                  <Card key={r.id} className="relative flex flex-col justify-between p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">{r.code}</span>
                        <Badge
                          variant={isAccepted ? "default" : isDeclined ? "destructive" : "outline"}
                          className="text-[11px]"
                        >
                          {isPending ? "Waiting Decision" : isAccepted ? "Accepted" : "Declined"}
                        </Badge>
                      </div>
                      <h4 className="font-semibold text-sm leading-tight text-foreground">{r.title}</h4>
                      {r.description && (
                        <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{r.description}</p>
                      )}
                      <div className="text-[11px] text-muted-foreground space-y-0.5 pt-2 border-t">
                        {r.requested_by_name && <div>Requester: <strong>{r.requested_by_name}</strong></div>}
                        <div>Submitted: {r.created_at.slice(0, 10)}</div>
                        {r.due_date && <div>Due date: {r.due_date}</div>}
                        {r.assignee_name && <div>Assigned to: {r.assignee_name}</div>}
                      </div>
                    </div>

                    {canManage && isPending && (
                      <div className="flex items-center gap-2 pt-3 border-t mt-3">
                        <Button
                          size="xs"
                          variant="outline"
                          className="flex-1 gap-1 text-emerald-600 hover:text-emerald-700"
                          onClick={() => setDecisionModal({ item: r, action: "accept" })}
                        >
                          <CheckCircle2Icon className="size-3.5" />
                          Accept
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="flex-1 gap-1 text-rose-600 hover:text-rose-700"
                          onClick={() => setDecisionModal({ item: r, action: "decline" })}
                        >
                          <XCircleIcon className="size-3.5" />
                          Decline
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* OUTGOING REQUESTS */}
      {activeTab === "outgoing" && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Requests sent by {deptTitle} to other departments.
          </div>
          {outgoing.length === 0 ? (
            <EmptyState
              title="No outgoing requests"
              description="Your department has not submitted any requests to other departments yet."
              action={
                <Button size="sm" onClick={() => setActiveTab("new")}>
                  Submit a request
                </Button>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {outgoing.map((r) => {
                const isPending = r.request_state === "pending";
                const isAccepted = r.request_state === "accepted";
                const isDeclined = r.request_state === "declined";
                return (
                  <Card key={r.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{r.code}</span>
                      <Badge
                        variant={isAccepted ? "default" : isDeclined ? "destructive" : "outline"}
                        className="text-[11px]"
                      >
                        {isPending ? "Waiting Decision" : isAccepted ? "Accepted" : "Declined"}
                      </Badge>
                    </div>
                    <h4 className="font-semibold text-sm leading-tight text-foreground">{r.title}</h4>
                    {r.description && (
                      <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{r.description}</p>
                    )}
                    <div className="text-[11px] text-muted-foreground space-y-0.5 pt-2 border-t">
                      <div>Target: <strong>{r.deptTitle}</strong></div>
                      <div>Submitted: {r.created_at.slice(0, 10)}</div>
                      {r.due_date && <div>Needed by: {r.due_date}</div>}
                      {r.assignee_name && <div>Assignee: {r.assignee_name}</div>}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Decision Dialog */}
      {decisionModal && (
        <Dialog open onOpenChange={(open) => !open && setDecisionModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {decisionModal.action === "accept" ? "Accept Request" : "Decline Request"}
              </DialogTitle>
              <DialogDescription>
                {decisionModal.item.code}: {decisionModal.item.title}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-sm">
              {decisionModal.action === "accept" ? (
                <div className="space-y-1.5">
                  <Label>Assign Work To (Optional)</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select team member" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No assignee yet</SelectItem>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Reason for Declining</Label>
                  <Textarea
                    rows={3}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder="Provide justification why this request cannot be fulfilled..."
                    required
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setDecisionModal(null)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant={decisionModal.action === "accept" ? "default" : "destructive"}
                onClick={handleDecision}
                disabled={busy}
              >
                {decisionModal.action === "accept" ? "Confirm Acceptance" : "Decline Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
