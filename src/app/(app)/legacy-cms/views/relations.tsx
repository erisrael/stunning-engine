"use client";

// Legacy CMS: the relations view (split from legacy-cms-client.tsx; Update 1.0 u2). Its state lives in
// useLegacyCmsState (state.tsx) and comes through the page's context.
import { RefreshCwIcon, SearchIcon, PhoneCallIcon, CopyIcon, CheckIcon, UsersIcon, FileSpreadsheetIcon, HelpCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilamentPagination } from "@/components/app/legacy-cms/filament-pagination";
import { cn } from "@/lib/utils";
import { useLegacyCms } from "../context";

export function RelationsView() {
  const { currentPage, pageSize, copiedKey, relations, relationsSummary, relSearch, setRelSearch, relPhoneOnly, setRelPhoneOnly, relPage, setRelPage, relPageSize, setRelPageSize, relSyncLoading, handleSyncAndLoadRelations, handleOpenReportModal, copyText, exportToExcel, filteredRelations, totalRelPages, paginatedRelations } = useLegacyCms();
  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <UsersIcon className="size-4 text-emerald-600" /> Student &rarr; Parent Contact Directory
            </CardTitle>
            <CardDescription className="text-xs">
              Joined relationships linking students directly to their parents verified phone contact details.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={relSyncLoading}
              onClick={handleSyncAndLoadRelations}
            >
              <RefreshCwIcon className={cn("size-3.5", relSyncLoading && "animate-spin")} />
              {relSyncLoading ? "Syncing Directory..." : "Load / Rebuild Data"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportToExcel(
                  "student-parent-directory",
                  ["Student Name", "Grade", "City", "Parent Name", "Parent Phone", "Subscription Status"],
                  relations.map((r) => [
                    r.studentName,
                    r.grade || "—",
                    r.city || "—",
                    r.parentName || "—",
                    r.parentPhone || "—",
                    r.subscriptionStatus || "—",
                  ])
                )
              }
              className="h-8 text-xs gap-1.5"
            >
              <FileSpreadsheetIcon className="size-3.5 text-emerald-600" /> Export Directory
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Directory summary metrics */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <span className="text-xs text-muted-foreground">Total Students</span>
              <p className="text-lg font-bold text-foreground">{relationsSummary.totalStudents.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <span className="text-xs text-muted-foreground">Linked Parents</span>
              <p className="text-lg font-bold text-emerald-600">{relationsSummary.linkedParents.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <span className="text-xs text-muted-foreground">With Phone Numbers</span>
              <p className="text-lg font-bold text-blue-600">{relationsSummary.withPhone.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <span className="text-xs text-muted-foreground">Active Subscriptions</span>
              <p className="text-lg font-bold text-indigo-600">{relationsSummary.activeSubscriptions.toLocaleString()}</p>
            </div>
          </div>

          {/* Directory Search & Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by student, parent, phone, city..."
                value={relSearch}
                onChange={(e) => {
                  setRelSearch(e.target.value);
                  setRelPage(1);
                }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={relPhoneOnly}
                  onChange={(e) => {
                    setRelPhoneOnly(e.target.checked);
                    setRelPage(1);
                  }}
                  className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                />
                Phone Verified Only
              </label>
            </div>
          </div>

          {/* Table */}
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-xs">Student Name</TableHead>
                  <TableHead className="text-xs">Grade</TableHead>
                  <TableHead className="text-xs">City</TableHead>
                  <TableHead className="text-xs">Parent Name</TableHead>
                  <TableHead className="text-xs">Phone Contact</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-right text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRelations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-xs text-muted-foreground space-y-3">
                      <UsersIcon className="size-8 mx-auto text-muted-foreground/50 mb-1" />
                      <p className="font-medium text-foreground">No student-parent relationships loaded yet.</p>
                      <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                        Load student and parent contact pairs directly from the database or synchronize with Noor CMS.
                      </p>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 mx-auto"
                        disabled={relSyncLoading}
                        onClick={handleSyncAndLoadRelations}
                      >
                        <RefreshCwIcon className={cn("size-3.5", relSyncLoading && "animate-spin")} />
                        {relSyncLoading ? "Syncing Directory..." : "Load / Sync Contact Directory"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRelations.map((rel) => (
                    <TableRow
                      key={rel.studentId}
                      className="text-xs hover:bg-muted/30 cursor-context-menu"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleOpenReportModal(
                          {
                            id: rel.studentId,
                            external_id: rel.studentId,
                            title: rel.studentName,
                            data: {
                              name: rel.studentName,
                              phone: rel.parentPhone,
                              grade: rel.grade,
                              parent: rel.parentName,
                            },
                          },
                          "students"
                        );
                      }}
                    >
                      <TableCell className="font-semibold text-foreground">{rel.studentName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{rel.grade || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{rel.city || "—"}</TableCell>
                      <TableCell className="font-medium text-foreground">{rel.parentName || "—"}</TableCell>
                      <TableCell>
                        {rel.parentPhone ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`tel:${rel.parentPhone}`}
                              className="font-mono text-emerald-600 hover:underline flex items-center gap-1 text-[11px]"
                            >
                              <PhoneCallIcon className="size-3" />
                              {rel.parentPhone}
                            </a>
                            <button
                              type="button"
                              onClick={() => copyText(rel.parentPhone!, rel.studentId)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {copiedKey === rel.studentId ? <CheckIcon className="size-3 text-emerald-600" /> : <CopyIcon className="size-3" />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px]",
                            rel.subscriptionStatus === "active" && "bg-emerald-500/10 text-emerald-600",
                            rel.subscriptionStatus === "expired" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {rel.subscriptionStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() =>
                            handleOpenReportModal(
                              {
                                id: rel.studentId,
                                external_id: rel.studentId,
                                title: rel.studentName,
                                data: {
                                  name: rel.studentName,
                                  phone: rel.parentPhone,
                                  grade: rel.grade,
                                  parent: rel.parentName,
                                },
                              },
                              "students"
                            )
                          }
                        >
                          <HelpCircleIcon className="size-3 text-muted-foreground mr-1" />
                          Report
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Filament Pagination for Student-Parent Directory */}
          <FilamentPagination
            from={filteredRelations.length === 0 ? 0 : (relPage - 1) * (relPageSize || filteredRelations.length) + 1}
            to={relPageSize === 0 ? filteredRelations.length : Math.min(relPage * relPageSize, filteredRelations.length)}
            totalResults={filteredRelations.length}
            currentPage={relPage}
            totalPages={totalRelPages}
            pageSize={relPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            allowAll={true}
            onPageChange={(p) => setRelPage(p)}
            onPageSizeChange={(s) => {
              setRelPageSize(s);
              setRelPage(1);
            }}
            sourceLabel="Student Parent Directory"
          />
        </CardContent>
      </Card>
    </>
  );
}
