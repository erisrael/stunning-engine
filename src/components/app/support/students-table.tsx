"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  SearchIcon,
  PhoneCallIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  EyeIcon,
  FilterIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listLegacyCmsRecordsAction } from "@/app/actions/legacy-cms";
import type { LegacyCmsRecord } from "@/server/legacy-cms";
import { cn } from "@/lib/utils";

export function StudentsTable() {
  const [records, setRecords] = React.useState<LegacyCmsRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [search, setSearch] = React.useState("");
  const [gradeFilter, setGradeFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [loading, setLoading] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<LegacyCmsRecord | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const loadStudents = async (query = search) => {
    setLoading(true);
    const res = await listLegacyCmsRecordsAction("students", { q: query, limit: 100 });
    setLoading(false);
    if (res.ok) {
      setRecords(res.data.rows);
      setTotal(res.data.total);
    }
  };

  React.useEffect(() => {
    loadStudents("");
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    loadStudents(val);
  };

  const copyText = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    toast.success(`Copied: ${txt}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filtered = React.useMemo(() => {
    return records.filter((r) => {
      const g = String(r.data.grade || "").toLowerCase();
      const st = String(r.data.status || "").toLowerCase();

      if (gradeFilter !== "all" && !g.includes(gradeFilter.toLowerCase())) return false;
      if (statusFilter !== "all" && !st.includes(statusFilter.toLowerCase())) return false;
      return true;
    });
  }, [records, gradeFilter, statusFilter]);

  const exportCsv = () => {
    if (filtered.length === 0) return toast.error("No students to export");
    const headers = ["ID", "Student Name", "Grade", "Parent Name", "Parent Phone", "Email", "Status", "Courses"];
    const rows = filtered.map((r) => [
      r.externalId,
      `"${String(r.data.name || "").replace(/"/g, '""')}"`,
      `"${String(r.data.grade || "").replace(/"/g, '""')}"`,
      `"${String(r.data.parent_name || "").replace(/"/g, '""')}"`,
      `"${String(r.data.phone || "").replace(/"/g, '""')}"`,
      `"${String(r.data.email || "").replace(/"/g, '""')}"`,
      `"${String(r.data.status || "").replace(/"/g, '""')}"`,
      `"${String(r.data.courses || "").replace(/"/g, '""')}"`,
    ]);
    const blob = new Blob([[headers.join(","), ...rows.map((r) => r.join(","))].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-directory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Exported students directory");
  };

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <GraduationCapIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
              Students & Parents Directory
            </CardTitle>
            <CardDescription className="text-xs">
              Complete student lookup for customer support agents. One-click parent calling and subscription verification.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => loadStudents(search)} className="gap-1.5 text-xs">
              <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-1.5 text-xs">
              <DownloadIcon className="size-3.5" />
              Export
            </Button>
            <Button asChild variant="secondary" size="sm" className="gap-1.5 text-xs">
              <Link href="/legacy-cms">
                <ExternalLinkIcon className="size-3.5" />
                Open Legacy CMS
              </Link>
            </Button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <div className="relative min-w-56 flex-1 sm:w-72">
            <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by student, parent name, phone, or ID..."
              value={search}
              onChange={handleSearch}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <Select value={gradeFilter} onValueChange={setGradeFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All Grades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Grades</SelectItem>
              <SelectItem value="Grade 7">Grade 7</SelectItem>
              <SelectItem value="Grade 8">Grade 8</SelectItem>
              <SelectItem value="Grade 9">Grade 9</SelectItem>
              <SelectItem value="Grade 10">Grade 10</SelectItem>
              <SelectItem value="Grade 11">Grade 11</SelectItem>
              <SelectItem value="Grade 12">Grade 12</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <div className="overflow-x-auto border-t">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="text-xs">Student</TableHead>
              <TableHead className="text-xs">Grade</TableHead>
              <TableHead className="text-xs">Parent / Guardian</TableHead>
              <TableHead className="text-xs">Parent Phone</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Courses / Subjects</TableHead>
              <TableHead className="text-right text-xs">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-xs text-muted-foreground">
                  <RefreshCwIcon className="mx-auto size-4 animate-spin text-primary mb-2" />
                  Loading student directory...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-28 text-center text-xs text-muted-foreground">
                  No students found matching your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const phone = String(r.data.phone || "");
                const status = String(r.data.status || "Active");
                const isActive = /active|verified/i.test(status);
                const isPending = /pending/i.test(status);

                return (
                  <TableRow key={r.id} className="hover:bg-muted/30 text-xs">
                    <TableCell className="font-semibold text-foreground">
                      {String(r.data.name || r.title)}
                      <div className="font-mono text-[11px] font-normal text-muted-foreground">
                        {r.externalId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-[11px]">
                        {String(r.data.grade || "Grade —")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {String(r.data.parent_name || "—")}
                    </TableCell>
                    <TableCell>
                      {phone ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px]">
                          <span>{phone}</span>
                          <button
                            type="button"
                            onClick={() => copyText(phone, `ph-${r.id}`)}
                            className="text-muted-foreground hover:text-foreground"
                            title="Copy number"
                          >
                            {copiedKey === `ph-${r.id}` ? (
                              <CheckIcon className="size-3 text-emerald-600" />
                            ) : (
                              <CopyIcon className="size-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] font-semibold",
                          isActive && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                          isPending && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                          !isActive && !isPending && "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        )}
                      >
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground text-[11px]">
                      {String(r.data.courses || "All Grade Curriculum")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {phone && (
                          <Button
                            size="sm"
                            className="h-7 gap-1 bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] px-2.5"
                            asChild
                          >
                            <a href={`tel:${phone}`}>
                              <PhoneCallIcon className="size-3" />
                              Call Parent
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          title="Inspect Student Details"
                          onClick={() => setSelectedRecord(r)}
                        >
                          <EyeIcon className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between border-t bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <span>Showing {filtered.length} of {total} students</span>
        <span>Synced with Noor Ethiopia CMS</span>
      </div>

      {/* Record Inspector Dialog */}
      <Dialog open={!!selectedRecord} onOpenChange={(o) => !o && setSelectedRecord(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <GraduationCapIcon className="size-4 text-emerald-600" />
              {selectedRecord?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Student ID: <code className="font-mono text-foreground font-semibold">{selectedRecord?.externalId}</code>
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-xs">
              {Object.entries(selectedRecord.data).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1 last:border-0 last:pb-0">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                    {k.replace(/_/g, " ")}:
                  </span>
                  <span className="font-medium text-foreground text-right">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            {Boolean(selectedRecord?.data?.phone) && (
              <Button
                size="sm"
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                asChild
              >
                <a href={`tel:${String(selectedRecord?.data?.phone)}`}>
                  <PhoneCallIcon className="size-3.5" /> Call Parent
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setSelectedRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
