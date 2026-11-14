"use client";

// Legacy CMS: the storage view (split from legacy-cms-client.tsx; Update 1.0 u2). Its state lives in
// useLegacyCmsState (state.tsx) and comes through the page's context.
import { RefreshCwIcon, EyeIcon, DatabaseIcon, Trash2Icon, ArchiveIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useLegacyCms } from "../context";

export function StorageView() {
  const { isAdmin, setActiveMainView, setDataSourceMode, setCategory, records, storageStatus, loading, syncingCategory, snapshots, snapshotsLoading, setCreateSnapshotModalOpen, handleOpenSnapshotViewer, handleDeleteSnapshot, handleScrapeCategory, handleDeleteCategoryData } = useLegacyCms();
  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <DatabaseIcon className="size-4 text-purple-600" /> Scraped Archives &amp; Storage Management
            </CardTitle>
            <CardDescription className="text-xs">
              Manage individual scraped datasets, browse saved records, perform targeted multi-page deep scrapes, or clear cached data.
            </CardDescription>
          </div>

          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteCategoryData("all")}
              disabled={loading}
              className="h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 gap-1.5"
            >
              <Trash2Icon className="size-3.5" /> Clear All Datasets
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {storageStatus.map((cat) => {
              const isSyncing = syncingCategory === cat.category;
              return (
                <div
                  key={cat.category}
                  className="rounded-xl border bg-card p-4 space-y-3 shadow-sm hover:border-border/80 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground capitalize">
                        {cat.name}
                      </h4>
                      <span className="text-[11px] font-mono text-muted-foreground">{cat.path}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      ~{cat.totalPagesEstimate} CMS Pages
                    </Badge>
                  </div>

                  <div className="space-y-1">
                    <p className="text-2xl font-bold tracking-tight text-foreground">
                      {cat.count.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">records</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Last scraped: {cat.lastSyncedAt ? new Date(cat.lastSyncedAt).toLocaleString() : "Never"}
                    </p>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-1.5 border-t">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => {
                        setCategory(cat.category);
                        setActiveMainView("subpages");
                        setDataSourceMode("scraped");
                      }}
                    >
                      <EyeIcon className="size-3 mr-1" /> Browse
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2 gap-1 text-emerald-700 dark:text-emerald-300"
                        disabled={isSyncing}
                        onClick={() => handleScrapeCategory(cat.category, 0)}
                      >
                        <RefreshCwIcon className={cn("size-2.5", isSyncing && "animate-spin")} />
                        {isSyncing ? "Scraping..." : "Scrape All"}
                      </Button>

                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteCategoryData(cat.category)}
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Versioned Archive Snapshots */}
          <div className="pt-6 border-t space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <ArchiveIcon className="size-4 text-purple-600" />
                  Historical Version Snapshots ({snapshots.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Point-in-time versioned backups of scraped Noor CMS records that can be inspected, searched, or exported.
                </p>
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={() => setCreateSnapshotModalOpen(true)}
              >
                <PlusIcon className="size-3.5" /> Create Snapshot Version
              </Button>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="text-xs">Version Name</TableHead>
                    <TableHead className="text-xs">Scope / Category</TableHead>
                    <TableHead className="text-xs">Records</TableHead>
                    <TableHead className="text-xs">Created By</TableHead>
                    <TableHead className="text-xs">Timestamp</TableHead>
                    <TableHead className="text-right text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshotsLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                        <RefreshCwIcon className="size-4 animate-spin mx-auto mb-1 text-primary" />
                        Loading snapshots...
                      </TableCell>
                    </TableRow>
                  ) : snapshots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                        No version snapshots saved yet. Click &quot;Create Snapshot Version&quot; to snapshot current data.
                      </TableCell>
                    </TableRow>
                  ) : (
                    snapshots.map((snap) => (
                      <TableRow key={snap.id} className="text-xs hover:bg-muted/30">
                        <TableCell className="font-semibold text-foreground">{snap.versionName}</TableCell>
                        <TableCell className="capitalize">
                          <Badge variant="outline" className="text-[10px]">
                            {snap.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{snap.recordCount.toLocaleString()}</TableCell>
                        <TableCell>{snap.createdBy || "System"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(snap.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2 gap-1 text-primary"
                              onClick={() => handleOpenSnapshotViewer(snap.id)}
                            >
                              <EyeIcon className="size-3" /> View Data
                            </Button>
                            {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteSnapshot(snap.id, snap.versionName)}
                              >
                                <Trash2Icon className="size-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
