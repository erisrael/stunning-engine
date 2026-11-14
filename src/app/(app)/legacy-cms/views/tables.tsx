"use client";

// Legacy CMS: the Tables and live sync view (split from legacy-cms-client.tsx; Update 1.0 u2). Its state lives in
// useLegacyCmsState (state.tsx) and comes through the page's context.
import { cmsField } from "@/lib/cms-filters";
import { RefreshCwIcon, SearchIcon, EyeIcon, CalendarIcon, DatabaseIcon, FileSpreadsheetIcon, CheckCircleIcon, HelpCircleIcon, RadioIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilamentPagination } from "@/components/app/legacy-cms/filament-pagination";
import { cn } from "@/lib/utils";
import { CATEGORY_PATHS } from "../shared";
import { useLegacyCms } from "../context";

export function TablesView() {
  const { allowedCategories, dataSourceMode, setDataSourceMode, columnFilter, setColumnFilter, columnQuery, setColumnQuery, category, setCategory, records, total, search, setSearch, statusFilter, setStatusFilter, gradeFilter, setGradeFilter, paymentMethodFilter, setPaymentMethodFilter, dateFilter, setDateFilter, customStartDate, setCustomStartDate, customEndDate, setCustomEndDate, currentPage, setCurrentPage, pageSize, setPageSize, remoteFilters, remoteValues, setRemoteValues, liveRequestId, liveScanProgress, setLiveScanProgress, livePartial, liveDataset, livePage, livePageSize, setLivePageSize, liveRecords, setLiveRecords, liveHeaders, liveLoading, setLiveLoading, paymentMethods, syncingCategory, deepSyncLimit, setDeepSyncLimit, setFeedbackResolveModalOpen, setActiveFeedbackItem, handleFetchLivePage, handleScrapeCategory, handleOpenReceipt, handleOpenReportModal, exportToExcel, filteredRecords, filteredLiveRecords, displayedLiveRecords, shownLiveTotal, shownLivePages, shownLiveFrom, shownLiveTo, paginatedScrapedRecords, totalScrapedPages, dynamicColumns } = useLegacyCms();
  return (
    <>
      {/* Subpage Category Switcher & Data Source Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-2.5 rounded-xl border">
        {/* Category selection */}
        <div className="flex flex-wrap items-center gap-1.5">
          {allowedCategories.map((catKey) => {
            const isSelected = category === catKey;
            const path = CATEGORY_PATHS[catKey];
            return (
              <Button
                key={catKey}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setColumnQuery("");setColumnFilter("");setRemoteValues({});setStatusFilter("all");setGradeFilter("all");setPaymentMethodFilter("all");setSearch("");
                  setCategory(catKey);
                  setCurrentPage(1);
                  if (dataSourceMode === "live") {
                    handleFetchLivePage(catKey, 1, search);
                  }
                }}
                className={cn(
                  "h-8 text-xs capitalize gap-1.5",
                  isSelected && "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
              >
                {catKey.replace(/-/g, " ")}
              </Button>
            );
          })}
        </div>

        {/* Mode Switch: Live vs Scraped Cache */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-background border rounded-lg p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDataSourceMode("scraped")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1",
                dataSourceMode === "scraped"
                  ? "bg-muted text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <DatabaseIcon className="size-3" /> Scraped Cache ({total})
            </button>
            <button
              type="button"
              onClick={() => setDataSourceMode("live")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1",
                dataSourceMode === "live"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <RadioIcon className="size-3 text-emerald-400" /> Live CMS Direct
            </button>
          </div>

          {/* Individual Deep Scrape Button for this specific category with Page Limit Option */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-0.5 rounded-lg border border-border/60">
            <select
              aria-label="Pages to scrape"
              value={deepSyncLimit}
              onChange={(e) => setDeepSyncLimit(Number(e.target.value))}
              disabled={syncingCategory === category}
              className="h-7 rounded border-0 bg-transparent px-2 text-[11px] font-medium text-foreground cursor-pointer focus:outline-none"
            >
              <option value="0">All pages</option>
              <option value="10">10 Pages (~100)</option>
              <option value="25">25 Pages (~250)</option>
              <option value="50">50 Pages (~500)</option>
              <option value="100">100 Pages (~1,000)</option>
              <option value="250">250 Pages (~2,500)</option>
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleScrapeCategory(category, deepSyncLimit)}
              disabled={syncingCategory === category}
              className="h-7 text-xs gap-1.5 bg-background border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 px-2.5"
            >
              <RefreshCwIcon className={cn("size-3", syncingCategory === category && "animate-spin")} />
              {syncingCategory === category ? "Scraping..." : `Deep Scrape ${category.replace(/-/g, " ")}`}
            </Button>
          </div>
        </div>
      </div>

      {/* Filtering Bar & Date Filter Pills */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search input with live search button */}
          <div className="flex items-center gap-1.5 flex-1 min-w-[240px] max-w-md">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder={
                  dataSourceMode === "live"
                    ? `Search ${category} on live Noor CMS (Press Enter)...`
                    : `Search in scraped ${category}...`
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dataSourceMode === "live") {
                    handleFetchLivePage(category, 1, search);
                  }
                }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            {dataSourceMode === "live" && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs px-2.5 bg-muted/40 hover:bg-muted font-medium"
                onClick={() => handleFetchLivePage(category, 1, search)}
                disabled={liveLoading}
              >
                Search
              </Button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs">Filter column<select className="h-8 rounded-md border bg-background px-2" value={columnFilter} onChange={e=>{setColumnQuery("");setColumnFilter(e.target.value);}}><option value="">Choose a column</option>{(dataSourceMode==="live"?liveHeaders:dynamicColumns).map(h=><option key={h} value={h}>{h}</option>)}</select></label>
          <Input aria-label="Column contains" placeholder="Column contains…" disabled={!columnFilter} value={columnQuery} onChange={e=>setColumnQuery(e.target.value)} className="h-8 w-44 text-xs"/>
          <Button variant="ghost" size="sm" onClick={()=>{setColumnQuery("");setColumnFilter("");setRemoteValues({});setStatusFilter("all");setGradeFilter("all");setPaymentMethodFilter("all");setDateFilter("all");setSearch("");}}>Clear filters</Button>
          <label className="flex items-center gap-2 text-xs">
            Payment method
            <select aria-label="Payment method" className="h-8 rounded-md border bg-background px-2" value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)}>
              <option value="all">All methods</option>
              {paymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>
          {dataSourceMode === "live" && remoteFilters.filter(f => f.kind !== "date").map(filter => <label key={filter.key} className="flex items-center gap-2 text-xs capitalize">
            {filter.label}
            <select className="h-8 rounded-md border bg-background px-2" value={remoteValues[filter.key] ?? ""} onChange={e => setRemoteValues(v => ({ ...v, [filter.key]: e.target.value }))}>
              {filter.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>)}
          {dataSourceMode === "scraped" && <>
            <label className="flex items-center gap-2 text-xs">Status
              <select aria-label="Status" className="h-8 rounded-md border bg-background px-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                {[...new Set(records.map(r => cmsField(r.data, ["status", "payment status", "subscription status"])).filter(Boolean))].sort().map(v => <option key={v}>{v}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs">Grade
              <select aria-label="Grade" className="h-8 rounded-md border bg-background px-2" value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
                <option value="all">All grades</option>
                {[...new Set(records.map(r => cmsField(r.data, ["grade", "grades", "plan"])).filter(Boolean))].sort().map(v => <option key={v}>{v}</option>)}
              </select>
            </label>
          </>}
          {dataSourceMode === "live" && <p className="w-full text-xs text-muted-foreground">All filters apply across the matching CMS records. Date and payment filters load all matching pages before showing results.</p>}
          {/* Date Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
              <CalendarIcon className="size-3" /> Date:
            </span>
            {[
              { key: "all", label: "All Time" },
              { key: "today", label: "Today" },
              { key: "yesterday", label: "Yesterday" },
              { key: "week", label: "This Week" },
              { key: "month", label: "This Month" },
              { key: "30days", label: "Last 30 Days" },
              { key: "custom", label: "Custom Range" },
            ].map((df) => (
              <Button
                key={df.key}
                variant={dateFilter === df.key ? "default" : "outline"}
                size="sm"
                onClick={() => setDateFilter(df.key as any)}
                className={cn(
                  "h-7 text-[11px] px-2.5",
                  dateFilter === df.key && "bg-primary text-primary-foreground font-semibold"
                )}
              >
                {df.label}
              </Button>
            ))}
          </div>

          {/* Export to Excel */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (dataSourceMode === "live") {
                exportToExcel(
                  `noor-cms-live-${category}-page-${livePage}`,
                  liveHeaders,
                  filteredLiveRecords.map((r) => liveHeaders.map((h) => r[h] || ""))
                );
              } else {
                exportToExcel(
                  `noor-cms-scraped-${category}`,
                  ["ID", "Title", ...dynamicColumns],
                  filteredRecords.map((r) => [r.externalId, r.title, ...dynamicColumns.map((col) => (r.data as any)[col] || "")])
                );
              }
            }}
            className="h-8 text-xs gap-1.5"
          >
            <FileSpreadsheetIcon className="size-3.5 text-emerald-600" />
            Export to Excel
          </Button>
        </div>

        {/* Custom Date Range Pickers if "custom" is selected */}
        {dateFilter === "custom" && (
          <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-2 rounded-lg text-xs">
            <span className="text-muted-foreground font-medium">Filter Range:</span>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="date-start" className="text-[11px]">From:</Label>
              <Input
                id="date-start"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-7 text-xs w-36"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="date-end" className="text-[11px]">To:</Label>
              <Input
                id="date-end"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-7 text-xs w-36"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
                className="h-7 text-[11px] text-muted-foreground"
              >
                Reset
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Mode Banner & Live CMS Query Status */}
      {dataSourceMode === "live" ? (
        <div className="bg-blue-500/[0.07] border border-blue-500/20 rounded-lg px-3 py-2 text-xs flex items-center justify-between text-blue-800 dark:text-blue-300">
          <span className="flex items-center gap-2">
            <RadioIcon className="size-3.5 animate-pulse text-blue-600" />
            <span>
              Showing <strong>{shownLiveFrom}</strong> to <strong>{shownLiveTo}</strong> of <strong>{shownLiveTotal.toLocaleString()}</strong> live results from{" "}
              <code>{CATEGORY_PATHS[category]}</code>
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { liveDataset.current = null; livePartial.current=null; handleFetchLivePage(category, 1, search); }}
              disabled={liveLoading}
              className="h-6 text-[11px] px-2 bg-background"
            >
              <RefreshCwIcon className={cn("size-2.5 mr-1", liveLoading && "animate-spin")} />
              Refresh Page
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            Showing <strong>{paginatedScrapedRecords.length}</strong> of <strong>{filteredRecords.length.toLocaleString()}</strong> filtered records (Storage total: {total.toLocaleString()})
          </span>
          <span className="text-[11px]">
            Tip: Right-click any row to report an issue to Questions.
          </span>
        </div>
      )}

      {/* Table Container */}
      <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
        {dataSourceMode === "live" ? (
          /* LIVE CMS TABLE */
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                {liveHeaders.map((h) => (
                  <TableHead key={h} className="text-xs font-semibold">
                    {h}
                  </TableHead>
                ))}
                <TableHead className="text-right text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liveLoading ? (
                <TableRow>
                  <TableCell colSpan={Math.max(1, liveHeaders.length + 1)} className="text-center py-12 text-xs text-muted-foreground">
                    <RefreshCwIcon className="size-5 animate-spin mx-auto mb-2 text-primary" />
                    {liveScanProgress || "Fetching live data from cms.noorethiopia.com..."}
                    {liveScanProgress && <Button variant="outline" size="sm" className="ml-3" onClick={() => { liveRequestId.current++; setLiveLoading(false); setLiveScanProgress(""); setLiveRecords([]); }}>Cancel</Button>}
                  </TableCell>
                </TableRow>
              ) : filteredLiveRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={Math.max(1, liveHeaders.length + 1)} className="text-center py-12 text-xs text-muted-foreground">
                    {liveRecords.length > 0 ? "No records on this page match your active filters." : "No live records found on this page."}
                  </TableCell>
                </TableRow>
              ) : (
                displayedLiveRecords.map((r, idx) => (
                  <TableRow
                    key={idx}
                    className="text-xs hover:bg-muted/30 cursor-context-menu"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      handleOpenReportModal(r, category);
                    }}
                  >
                    {liveHeaders.map((h) => (
                      <TableCell key={h} className="text-xs py-2.5">
                        {r[h] || "—"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {category === "invoices" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30"
                            onClick={() => handleOpenReceipt(r)}
                          >
                            <EyeIcon className="size-2.5 mr-1" />
                            Receipt
                          </Button>
                        )}
                        {category === "feedback" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] px-2 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30"
                            onClick={() => {
                              setActiveFeedbackItem(r);
                              setFeedbackResolveModalOpen(true);
                            }}
                          >
                            <CheckCircleIcon className="size-2.5 mr-1" />
                            Resolve
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => handleOpenReportModal(r, category)}
                        >
                          <HelpCircleIcon className="size-3 text-muted-foreground mr-1" />
                          Report
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : (
          /* SCRAPED CACHE TABLE */
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="text-xs font-semibold w-24">ID</TableHead>
                <TableHead className="text-xs font-semibold">Title / Name</TableHead>
                {dynamicColumns.map((col) => (
                  <TableHead key={col} className="text-xs font-semibold">
                    {col}
                  </TableHead>
                ))}
                <TableHead className="text-right text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedScrapedRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={dynamicColumns.length + 3} className="text-center py-12 text-xs text-muted-foreground">
                    No scraped records match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedScrapedRecords.map((r) => {
                  const data = r.data || {};
                  return (
                    <TableRow
                      key={r.id}
                      className="text-xs hover:bg-muted/30 cursor-context-menu"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleOpenReportModal(r, category);
                      }}
                    >
                      <TableCell className="font-mono text-[11px] text-muted-foreground font-semibold">
                        #{r.externalId}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {r.title}
                      </TableCell>
                      {dynamicColumns.map((col) => {
                        const val = data[col];
                        return (
                          <TableCell key={col} className="text-xs text-muted-foreground">
                            {typeof val === "object" ? JSON.stringify(val) : String(val ?? "—")}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {category === "invoices" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30"
                              onClick={() => handleOpenReceipt(r)}
                            >
                              <EyeIcon className="size-2.5 mr-1" />
                              Receipt
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => handleOpenReportModal(r, category)}
                          >
                            <HelpCircleIcon className="size-3 text-muted-foreground mr-1" />
                            Report
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Filament v3 Pagination Navigation Bar */}
      {dataSourceMode === "live" ? (
        <FilamentPagination
          from={shownLiveFrom}
          to={shownLiveTo}
          totalResults={shownLiveTotal}
          currentPage={livePage}
          totalPages={shownLivePages}
          pageSize={livePageSize}
          pageSizeOptions={[5, 10, 25, 50]}
          disabled={liveLoading}
          onPageChange={(p) => handleFetchLivePage(category, p, search, livePageSize)}
          onPageSizeChange={(s) => {
            setLivePageSize(s);
            handleFetchLivePage(category, 1, search, s);
          }}
          sourceLabel={`Live ${CATEGORY_PATHS[category]} (${filteredLiveRecords.length} on page)`}
        />
      ) : (
        <FilamentPagination
          from={filteredRecords.length === 0 ? 0 : (currentPage - 1) * (pageSize || filteredRecords.length) + 1}
          to={pageSize === 0 ? filteredRecords.length : Math.min(currentPage * pageSize, filteredRecords.length)}
          totalResults={filteredRecords.length}
          currentPage={currentPage}
          totalPages={totalScrapedPages}
          pageSize={pageSize}
          pageSizeOptions={[10, 25, 50, 100, 250]}
          allowAll={true}
          onPageChange={(p) => setCurrentPage(p)}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setCurrentPage(1);
          }}
          sourceLabel="Local Scraped Storage"
        />
      )}
    </>
  );
}
