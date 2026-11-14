"use client";

// Legacy CMS: the revenue view (split from legacy-cms-client.tsx; Update 1.0 u2). Its state lives in
// useLegacyCmsState (state.tsx) and comes through the page's context.
import { toast } from "sonner";
import { RefreshCwIcon, SearchIcon, EyeIcon, DollarSignIcon, FileSpreadsheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilamentPagination } from "@/components/app/legacy-cms/filament-pagination";
import { cn } from "@/lib/utils";
import { useLegacyCms } from "../context";

export function RevenueView() {
  const { category, currentPage, pageSize, synchronizeCms, loading, setLoading, revenueData, revStatusFilter, setRevStatusFilter, revStart, setRevStart, revEnd, setRevEnd, revSearch, setRevSearch, revPage, setRevPage, revPageSize, setRevPageSize, refreshAllViews, handleOpenReceipt, exportToExcel, filteredInvoices, totalRevPages, paginatedInvoices } = useLegacyCms();
  return (
    <>
      <div className="flex flex-wrap gap-3"><label className="text-xs">Invoice date from<Input type="date" value={revStart} onChange={e=>{setRevStart(e.target.value);setRevPage(1);}}/></label><label className="text-xs">Invoice date to<Input type="date" value={revEnd} onChange={e=>{setRevEnd(e.target.value);setRevPage(1);}}/></label></div>
      <Button variant="outline" disabled={loading} onClick={async()=>{setLoading(true);try{const r=await synchronizeCms({category:"invoices",deep:true});if(!r.ok)toast.error(r.error||r.message);else{await refreshAllViews();toast.success("Finance data refreshed from live Noor.");}}finally{setLoading(false);}}}><RefreshCwIcon className="mr-2 size-4"/>Refresh invoices from live Noor</Button>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSignIcon className="size-4 text-emerald-600" /> Finance Revenue &amp; Verification Queue
            </CardTitle>
            <CardDescription className="text-xs">
              Reconcile payments across Telebirr, CBE Birr, and Bank Transfer slips needing Finance verification.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportToExcel(
                "finance-revenue-invoices",
                ["Invoice ID", "Student", "Amount (ETB)", "Payment Method", "Status", "Date", "Needs Approval"],
                revenueData.invoices.map((inv) => [
                  inv.id,
                  inv.student,
                  inv.amount,
                  inv.paymentMethod,
                  inv.status,
                  inv.date,
                  inv.needsApproval ? "YES" : "NO",
                ])
              )
            }
            className="h-8 text-xs gap-1.5"
          >
            <FileSpreadsheetIcon className="size-3.5 text-emerald-600" /> Export Revenue Invoices
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Revenue metrics */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <span className="text-xs text-muted-foreground">Total Verified Revenue</span>
              <p className="text-xl font-bold text-foreground">
                ETB {revenueData.summary.totalRevenue.toLocaleString()}
              </p>
              <p className="text-[11px] text-muted-foreground">{revenueData.summary.totalPaidCount} paid invoices</p>
            </div>
            <div className="rounded-lg border bg-amber-500/[0.08] border-amber-500/20 p-3 space-y-1">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Pending Approval Slips</span>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400">
                ETB {revenueData.summary.pendingApprovalRevenue.toLocaleString()}
              </p>
              <p className="text-[11px] text-amber-600/80">{revenueData.summary.pendingApprovalCount} bank receipts awaiting review</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <span className="text-xs text-muted-foreground">Average Invoice Value</span>
              <p className="text-xl font-bold text-foreground">
                ETB {revenueData.summary.averageInvoiceValue.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
              <span className="text-xs text-muted-foreground">Top Payment Channel</span>
              <p className="text-lg font-bold text-emerald-600">
                {revenueData.byPaymentMethod[0]?.method || "Bank Transfer"}
              </p>
            </div>
          </div>

          {/* Invoices Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search invoices by student, #ID, bank reference..."
                value={revSearch}
                onChange={(e) => {
                  setRevSearch(e.target.value);
                  setRevPage(1);
                }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={revStatusFilter}
                onChange={(e) => {
                  setRevStatusFilter(e.target.value);
                  setRevPage(1);
                }}
                className="h-8 rounded-lg border bg-background px-2.5 text-xs text-foreground"
              >
                <option value="all">All Statuses</option>
                <option value="needs_approval">Needs Verification</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>

          {/* Invoices List with Approval & Review Action */}
          <div className="border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="text-xs">Invoice #</TableHead>
                  <TableHead className="text-xs">Student</TableHead>
                  <TableHead className="text-xs">Method</TableHead>
                  <TableHead className="text-xs">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-right text-xs">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                      No invoices match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedInvoices.map((inv) => (
                    <TableRow key={inv.id} className="text-xs hover:bg-muted/30">
                      <TableCell className="font-mono text-[11px] font-semibold">#{inv.id}</TableCell>
                      <TableCell className="font-medium text-foreground">{inv.student}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {inv.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold text-foreground">
                        ETB {inv.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[10px]",
                            inv.status === "paid" && "bg-emerald-500/10 text-emerald-600",
                            inv.status === "pending" && "bg-amber-500/10 text-amber-600",
                            inv.needsApproval && "bg-rose-500/10 text-rose-600 animate-pulse"
                          )}
                        >
                          {inv.needsApproval ? "Needs Review" : inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">{inv.date}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5 gap-1.5 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30"
                          onClick={() => handleOpenReceipt(inv)}
                        >
                          <EyeIcon className="size-3" />
                          Review Receipt &amp; Slip
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Filament Pagination for Invoices Queue */}
          <FilamentPagination
            from={filteredInvoices.length === 0 ? 0 : (revPage - 1) * (revPageSize || filteredInvoices.length) + 1}
            to={revPageSize === 0 ? filteredInvoices.length : Math.min(revPage * revPageSize, filteredInvoices.length)}
            totalResults={filteredInvoices.length}
            currentPage={revPage}
            totalPages={totalRevPages}
            pageSize={revPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
            allowAll={true}
            onPageChange={(p) => setRevPage(p)}
            onPageSizeChange={(s) => {
              setRevPageSize(s);
              setRevPage(1);
            }}
            sourceLabel="Invoices Queue"
          />
        </CardContent>
      </Card>
    </>
  );
}
