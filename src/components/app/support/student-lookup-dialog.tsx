"use client";

import * as React from "react";
import { toast } from "sonner";
import { BookOpenIcon, CheckIcon, CopyIcon, Loader2Icon, PhoneCallIcon, PhoneIcon, SearchIcon, UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchStudentParentAction } from "@/app/actions/external-api";
import type { ExternalStudent } from "@/server/external-api";

export function StudentLookupDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<ExternalStudent[]>([]);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [copiedPhone, setCopiedPhone] = React.useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setHasSearched(true);
    const res = await searchStudentParentAction(query);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Failed to search student registry");
      return;
    }
    setResults(res.data ?? []);
  };

  const copy = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhone(phone);
    toast.success("Phone number copied to clipboard");
    setTimeout(() => setCopiedPhone(null), 2500);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="text-xs h-8">
            <PhoneCallIcon className="size-3.5 mr-1.5 text-primary" />
            Lookup Parent Phone
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PhoneCallIcon className="size-4 text-primary" />
            Student & Parent Contact Lookup
          </DialogTitle>
          <DialogDescription className="text-xs">
            Search the Academy database by student name, ID, or phone number to retrieve verified parent contact details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
            className="flex gap-2"
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by student name, ID (e.g. STU-1082) or phone..."
              autoFocus
              className="text-xs h-9"
            />
            <Button type="submit" size="sm" disabled={busy || !query.trim()} className="h-9">
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SearchIcon className="size-4" />}
            </Button>
          </form>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {busy && (
              <div className="flex items-center justify-center p-6 text-xs text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin mr-2" /> Searching academy records...
              </div>
            )}

            {!busy && hasSearched && results.length === 0 && (
              <p className="text-xs text-center p-6 text-muted-foreground">
                No students or parents found matching &quot;{query}&quot;.
              </p>
            )}

            {!busy &&
              results.map((s) => (
                <div key={s.studentId} className="rounded-lg border p-3 text-xs space-y-2 bg-card hover:bg-muted/10 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                        <UserIcon className="size-3.5 text-primary" />
                        {s.studentName}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        ID: {s.studentId} · {s.grade} · Status: <span className="font-medium text-foreground">{s.enrollmentStatus}</span>
                      </span>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/40 p-2.5 space-y-1.5 border">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground font-medium">Parent / Guardian:</span>
                      <span className="font-semibold text-foreground">{s.parentName}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t">
                      <span className="text-muted-foreground font-medium flex items-center gap-1">
                        <PhoneIcon className="size-3 text-primary" /> Primary Mobile:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-foreground">{s.parentPhone}</span>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          title="Copy phone"
                          onClick={() => copy(s.parentPhone)}
                        >
                          {copiedPhone === s.parentPhone ? <CheckIcon className="size-3 text-[#188038]" /> : <CopyIcon className="size-3" />}
                        </Button>
                        <a
                          href={`tel:${s.parentPhone}`}
                          className="inline-flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:opacity-90"
                        >
                          Call
                        </a>
                      </div>
                    </div>
                    {s.secondaryPhone && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-muted-foreground">Secondary Phone:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-foreground">{s.secondaryPhone}</span>
                          <a href={`tel:${s.secondaryPhone}`} className="text-primary hover:underline text-[11px]">
                            Call
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {s.activeCourses && s.activeCourses.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <BookOpenIcon className="size-3" /> Courses:
                      </span>
                      {s.activeCourses.map((c, i) => (
                        <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-medium">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

