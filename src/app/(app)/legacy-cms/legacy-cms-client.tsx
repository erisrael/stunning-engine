"use client";

// Legacy CMS page: the connection header, the tab bar and the dialogs. The state is useLegacyCmsState (state.tsx);
// each tab is a view under ./views, sharing the state by context (Update 1.0 u2: split from one 2,900-line file).
import { LEGACY_CMS_CATEGORIES } from "@/lib/legacy-cms";
import { toast } from "sonner";
import { DownloadIcon, RefreshCwIcon, SearchIcon, Settings2Icon, ExternalLinkIcon, UsersIcon, FileTextIcon, CreditCardIcon, CheckCircle2Icon, AlertCircleIcon, LockIcon, DatabaseIcon, ArchiveIcon, ShieldCheckIcon, TrendingUpIcon, DollarSignIcon, FileSpreadsheetIcon, CheckCircleIcon, ArrowUpRightIcon, LayersIcon, ZoomInIcon, ZoomOutIcon, RotateCwIcon, QrCodeIcon, SendIcon, ShieldIcon, SquareIcon, Unlink2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { saveLegacyCmsConfigAction, saveCmsRoleVisibilityAction, loginLegacyCmsAction, stopLegacyCmsSyncAction, disconnectLegacyCmsAction } from "@/app/actions/legacy-cms";
import { SearchableRecipientCombobox } from "@/components/app/questions/searchable-recipient-combobox";
import { QuestionRoutingConfigDialog } from "@/components/app/questions/question-routing-dialog";
import { cn } from "@/lib/utils";
import { useLegacyCmsState, type LegacyCmsProps } from "./state";
import { LegacyCmsContext } from "./context";
import { RelationsView } from "./views/relations";
import { StorageView } from "./views/storage";

export function LegacyCmsClient(props: LegacyCmsProps) {
  const state = useLegacyCmsState(props);
  const { config, isAdmin, cmsRoles, view, activeMainView, setActiveMainView, showChrome, dataSourceMode, category, records, search, liveError, cmsProgress, setCmsProgress, syncCancelled, eligibleRecipients, routingConfigOpen, setRoutingConfigOpen, loading, setLoading, settingsOpen, setSettingsOpen, relations, receiptModalOpen, setReceiptModalOpen, receiptLoading, activeReceiptInvoice, receiptZoom, setReceiptZoom, receiptRotation, setReceiptRotation, detectedQrCode, approvalNotes, setApprovalNotes, reportModalOpen, setReportModalOpen, reportSubmitting, reportData, setReportData, createSnapshotModalOpen, setCreateSnapshotModalOpen, newSnapshotName, setNewSnapshotName, newSnapshotCategory, setNewSnapshotCategory, newSnapshotDesc, setNewSnapshotDesc, viewSnapshotData, viewSnapshotModalOpen, setViewSnapshotModalOpen, snapshotSearch, setSnapshotSearch, snapshotCategory, setSnapshotCategory, snapshotFrom, setSnapshotFrom, snapshotTo, setSnapshotTo, snapshotPage, setSnapshotPage, snapshotSize, setSnapshotSize, filteredSnapshotRecords, handleCreateSnapshot, feedbackResolveModalOpen, setFeedbackResolveModalOpen, activeFeedbackItem, feedbackResolveStatus, setFeedbackResolveStatus, feedbackResolveNotes, setFeedbackResolveNotes, handleResolveFeedback, authStatus, checkingAuth, cfg, setCfg, loggingIn, setLoggingIn, roleVisibility, setRoleVisibility, handleCheckAuthStatus, handleFetchLivePage, scanQrCodeFromImage, handleApproveInvoice, handleSendReportQuestion, exportToExcel } = state;
  return (
    <LegacyCmsContext.Provider value={state}>
      <div className="space-y-4">
        {cmsProgress && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3 text-sm"><span><RefreshCwIcon className="mr-2 inline size-4 animate-spin"/>{cmsProgress}</span><Button variant="outline" size="sm" onClick={()=>{syncCancelled.current=true;setCmsProgress("Cancelling after the current page…");}}>Cancel refresh</Button></div>}
        {dataSourceMode==="live" && liveError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><span>{liveError} Completed scan pages are kept for retry.</span><Button variant="outline" size="sm" onClick={()=>handleFetchLivePage(category,1,search)}>Retry query</Button></div>}

        {/* Main Top Navigation Tabs */}
        <Tabs
          value={activeMainView}
          onValueChange={(v) => setActiveMainView(v as any)}
          className="space-y-4"
        >
          <div className={cn("flex items-center justify-between border-b pb-2", view && "hidden")}>
            <TabsList className={cn("bg-muted/50 p-1", view && "hidden")}>
              <TabsTrigger value="relations" className="text-xs gap-1.5">
                <UsersIcon className="size-3.5 text-emerald-600" /> Student &rarr; Parent Directory
              </TabsTrigger>
              <TabsTrigger value="storage" className="text-xs gap-1.5">
                <DatabaseIcon className="size-3.5 text-purple-600" /> Storage &amp; Archives
              </TabsTrigger>
            </TabsList>
          </div>

          {/* =========================================================================
              VIEW 1: SUBPAGES TABLES (LIVE CMS SYNC OR LOCAL SCRAPED CACHE)
              ========================================================================= */}

          {/* =========================================================================
              VIEW 2: STUDENT TO PARENT DIRECTORY
              ========================================================================= */}
          <TabsContent value="relations" className="space-y-4 m-0">
            <RelationsView />
          </TabsContent>

          {/* =========================================================================
              VIEW 3: FINANCE REVENUE & INVOICE APPROVAL QUEUE
              ========================================================================= */}

          {/* =========================================================================
              VIEW 4: GROWTH & INSIGHTS DASHBOARD
              ========================================================================= */}

          {/* =========================================================================
              VIEW 5: STORAGE & SCRAPED ARCHIVES MANAGEMENT
              ========================================================================= */}
          <TabsContent value="storage" className="space-y-4 m-0">
            <StorageView />
          </TabsContent>
        </Tabs>

        {/* =========================================================================
            MODAL 1: RECEIPT IMAGE & SLIP PREVIEW WITH ZOOM & QR CODE DETECTION
            ========================================================================= */}
        {isAdmin && <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>Noor CMS settings</DialogTitle><DialogDescription>Configure the shared connection, synchronization and role access. User-specific credentials are configured in Admin.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">CMS address<Input type="url" value={cfg.baseUrl} onChange={e=>setCfg({...cfg,baseUrl:e.target.value})}/></label><label className="text-sm">Shared username<Input value={cfg.username} onChange={e=>setCfg({...cfg,username:e.target.value})}/></label><label className="text-sm">New password<Input type="password" autoComplete="new-password" placeholder={config.hasPassword?"Saved password — leave blank to keep":"Enter password"} value={cfg.password} onChange={e=>setCfg({...cfg,password:e.target.value})}/></label><label className="text-sm">Sync interval (minutes)<Input type="number" min="5" value={cfg.syncIntervalMinutes} onChange={e=>setCfg({...cfg,syncIntervalMinutes:Number(e.target.value)})}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.autoSync} onChange={e=>setCfg({...cfg,autoSync:e.target.checked})}/>Automatic synchronization</label></div>
          <div className="flex flex-wrap gap-2"><Button disabled={loading} onClick={async()=>{setLoading(true);try{const r=await saveLegacyCmsConfigAction({...cfg,password:cfg.password||undefined,sessionCookie:undefined});if(r.ok){setCfg(c=>({...c,password:""}));toast.success("CMS settings saved");}else toast.error(r.error);}finally{setLoading(false);}}}>Save connection settings</Button><Button variant="outline" disabled={loggingIn} onClick={async()=>{setLoggingIn(true);try{const r=await loginLegacyCmsAction();if(r.ok){toast.success(r.message);await handleCheckAuthStatus(false);}else toast.error(r.message);}finally{setLoggingIn(false);}}}>Reconnect saved account</Button><Button variant="outline" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={async()=>{if(confirm("Disconnect Noor CMS? This will clear active session tokens.")){const r=await disconnectLegacyCmsAction();if(r.ok){toast.success(r.message);await handleCheckAuthStatus(false);}else toast.error(r.message);}}}>Disconnect session</Button><Button variant="outline" asChild><a href="/admin?tab=legacy-cms">Per-user credentials & tab access</a></Button></div>
          <fieldset className="space-y-3 border-t pt-3"><legend className="font-medium">CMS tables by role</legend>{(cmsRoles.length?cmsRoles:Object.keys(roleVisibility).map(key=>({key,label:key}))).map(role=><div key={role.key} className="rounded-lg border p-3"><h3 className="mb-2 text-sm font-medium">{role.label}</h3><div className="flex flex-wrap gap-3">{LEGACY_CMS_CATEGORIES.map(c=><label key={c.key} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={(roleVisibility[role.key]||[]).includes(c.key)} onChange={e=>setRoleVisibility(v=>({...v,[role.key]:e.target.checked?[...(v[role.key]||[]),c.key]:(v[role.key]||[]).filter(k=>k!==c.key)}))}/>{c.label}</label>)}</div></div>)}</fieldset><Button disabled={loading} onClick={async()=>{setLoading(true);try{const r=await saveCmsRoleVisibilityAction(roleVisibility);if(r.ok)toast.success("Role table access saved");else toast.error(r.error);}finally{setLoading(false);}}}>Save role table access</Button>
          <DialogFooter><Button variant="outline" onClick={()=>setSettingsOpen(false)}>Close</Button></DialogFooter>
        </DialogContent></Dialog>}
        <Dialog open={receiptModalOpen} onOpenChange={setReceiptModalOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
            <DialogHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-base flex items-center gap-2">
                  <CreditCardIcon className="size-4 text-emerald-600" />
                  Receipt Slip Verification — Invoice #{activeReceiptInvoice?.id}
                </DialogTitle>
                {activeReceiptInvoice?.pdfUrl && (
                  <a
                    href={`/api/legacy-cms/image-proxy?url=${encodeURIComponent(activeReceiptInvoice.pdfUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <DownloadIcon className="size-3" /> Download CMS PDF
                  </a>
                )}
              </div>
              <DialogDescription className="text-xs">
                Review payment confirmation slip for {activeReceiptInvoice?.studentName}. Verify bank reference and QR code.
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              {/* Invoice metadata pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/40 p-3 rounded-xl text-xs">
                <div>
                  <span className="text-muted-foreground block text-[11px]">Amount</span>
                  <strong className="text-sm text-foreground">{activeReceiptInvoice?.amount}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Payment Method</span>
                  <span className="font-semibold capitalize">{activeReceiptInvoice?.paymentMethod}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Date</span>
                  <span>{activeReceiptInvoice?.date}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Bank Reference</span>
                  <span className="font-mono">{activeReceiptInvoice?.bankReference || "—"}</span>
                </div>
              </div>

              {/* QR Code Detected Notification */}
              {detectedQrCode && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-2">
                    <QrCodeIcon className="size-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>QR Code Detected:</strong> {detectedQrCode}
                    </span>
                  </div>
                  {detectedQrCode.startsWith("http") && (
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                      onClick={() => window.open(detectedQrCode, "_blank", "noopener,noreferrer")}
                    >
                      Open Verification Link <ArrowUpRightIcon className="size-3" />
                    </Button>
                  )}
                </div>
              )}

              {/* Receipt Image Controls & Zoom */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <FileTextIcon className="size-3.5" /> Uploaded Payment Receipt Slip
                  </span>

                  <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title="Zoom Out"
                      onClick={() => setReceiptZoom((z) => Math.max(0.5, z - 0.25))}
                    >
                      <ZoomOutIcon className="size-3.5" />
                    </Button>
                    <span className="text-[11px] font-mono px-1.5">{Math.round(receiptZoom * 100)}%</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title="Zoom In"
                      onClick={() => setReceiptZoom((z) => Math.min(3, z + 0.25))}
                    >
                      <ZoomInIcon className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      title="Rotate 90 degrees"
                      onClick={() => setReceiptRotation((r) => (r + 90) % 360)}
                    >
                      <RotateCwIcon className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] px-2"
                      onClick={() => {
                        setReceiptZoom(1);
                        setReceiptRotation(0);
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>

                {/* Image Preview Container */}
                <div className="border rounded-xl bg-muted/20 min-h-[300px] max-h-[460px] overflow-auto flex items-center justify-center p-4">
                  {receiptLoading ? (
                    <div className="text-center py-12 text-xs text-muted-foreground">
                      <RefreshCwIcon className="size-5 animate-spin mx-auto mb-2 text-primary" />
                      Pulling receipt image from Noor CMS...
                    </div>
                  ) : !activeReceiptInvoice?.imageUrl && activeReceiptInvoice?.pdfUrl ? (
                    <iframe title="Invoice PDF preview" src={`/api/legacy-cms/image-proxy?url=${encodeURIComponent(activeReceiptInvoice.pdfUrl)}`} className="h-[460px] w-full rounded-lg border"/>
                  ) : activeReceiptInvoice?.imageUrl ? (
                    <div className="flex flex-col items-center gap-3">
                      <div
                        style={{
                          transform: `scale(${receiptZoom}) rotate(${receiptRotation}deg)`,
                          transformOrigin: "center center",
                          transition: "transform 0.15s ease-out",
                        }}
                        className="flex items-center justify-center"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/legacy-cms/image-proxy?url=${encodeURIComponent(activeReceiptInvoice.imageUrl)}`}
                          alt={`Receipt slip for invoice #${activeReceiptInvoice.id}`}
                          onLoad={(e) => scanQrCodeFromImage(e.currentTarget)}
                          crossOrigin="anonymous"
                          className="max-h-[380px] max-w-full rounded-lg shadow-md object-contain border"
                          onError={() => toast.error("Receipt could not be loaded. Reconnect Noor CMS and retry.")}
                        />
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] gap-1"
                          onClick={() => window.open(`/api/legacy-cms/image-proxy?url=${encodeURIComponent(activeReceiptInvoice.imageUrl!)}`, "_blank")}
                        >
                          <ExternalLinkIcon className="size-3" /> Open in New Tab
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[11px] gap-1"
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = `/api/legacy-cms/image-proxy?url=${encodeURIComponent(activeReceiptInvoice.imageUrl!)}`;
                            a.download = `receipt-invoice-${activeReceiptInvoice.id}.jpg`;
                            a.click();
                          }}
                        >
                          <DownloadIcon className="size-3" /> Download Slip
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-xs text-muted-foreground space-y-2">
                      <FileTextIcon className="size-8 mx-auto text-muted-foreground/60" />
                      <p>No separate image attachment uploaded for this manual receipt.</p>
                      {activeReceiptInvoice?.pdfUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => window.open(`/api/legacy-cms/image-proxy?url=${encodeURIComponent(activeReceiptInvoice.pdfUrl!)}`, "_blank")}
                        >
                          Download PDF Invoice
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Approval Notes */}
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="appr-notes" className="text-xs">Finance Approval Notes (Internal Record)</Label>
                <Input
                  id="appr-notes"
                  placeholder="e.g. Verified with Commercial Bank of Ethiopia transaction ledger"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setReceiptModalOpen(false)}>
                Close
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                onClick={() => handleApproveInvoice(activeReceiptInvoice!.id)}
                disabled={loading}
              >
                <CheckCircleIcon className="size-3.5" />
                Record local receipt verification
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* =========================================================================
            MODAL 2: REPORT ISSUE TO QUESTIONS SECTION
            ========================================================================= */}
        <Dialog open={reportModalOpen} onOpenChange={setReportModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <SendIcon className="size-4 text-primary" /> Report Issue to Questions
              </DialogTitle>
              <DialogDescription className="text-xs">
                File a tracked question or issue ticket for {reportData.itemTitle} directly into the internal Questions section.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rep-owner" className="text-xs font-semibold">Assign Recipient / Staff Member</Label>
                  {isAdmin && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => setRoutingConfigOpen(true)}
                    >
                      <ShieldIcon className="size-3 mr-1 text-emerald-500" />
                      Routing Rules
                    </Button>
                  )}
                </div>
                <SearchableRecipientCombobox
                  users={eligibleRecipients}
                  value={reportData.ownerId}
                  onChange={(val) => setReportData({ ...reportData, ownerId: val })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="rep-details" className="text-xs font-semibold">Question / Issue Summary</Label>
                <textarea
                  id="rep-details"
                  rows={6}
                  value={reportData.details}
                  onChange={(e) => setReportData({ ...reportData, details: e.target.value })}
                  className="w-full rounded-lg border bg-background p-2.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setReportModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSendReportQuestion}
                disabled={reportSubmitting}
                className="gap-1.5"
              >
                <SendIcon className="size-3.5" />
                {reportSubmitting ? "Sending..." : "Submit Question"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <QuestionRoutingConfigDialog
          open={routingConfigOpen}
          onOpenChange={setRoutingConfigOpen}
        />

        {/* =========================================================================
            MODAL 3: CREATE ARCHIVE VERSION SNAPSHOT
            ========================================================================= */}
        <Dialog open={createSnapshotModalOpen} onOpenChange={setCreateSnapshotModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <ArchiveIcon className="size-4 text-purple-600" /> Create Archive Version Snapshot
              </DialogTitle>
              <DialogDescription className="text-xs">
                Save current scraped records as a named, immutable version that can be reviewed or exported anytime.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <Label htmlFor="snap-name" className="text-xs font-semibold">Version Identifier / Name</Label>
                <Input
                  id="snap-name"
                  placeholder="e.g. v1.0 (End of Semester Sync)"
                  value={newSnapshotName}
                  onChange={(e) => setNewSnapshotName(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="snap-cat" className="text-xs font-semibold">Dataset Scope</Label>
                <select
                  id="snap-cat"
                  value={newSnapshotCategory}
                  onChange={(e) => setNewSnapshotCategory(e.target.value as any)}
                  className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="all">All Datasets Combined</option>
                  <option value="students">Students Only</option>
                  <option value="parents">Parents Only</option>
                  <option value="invoices">Invoices Only</option>
                  <option value="subscriptions">Subscriptions Only</option>
                  <option value="subscription-plans">Subscription Plans Only</option>
                  <option value="feedback">Feedbacks Only</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="snap-desc" className="text-xs font-semibold">Notes / Description (Optional)</Label>
                <Input
                  id="snap-desc"
                  placeholder="e.g. Captured before batch reconciliation"
                  value={newSnapshotDesc}
                  onChange={(e) => setNewSnapshotDesc(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreateSnapshotModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
                onClick={handleCreateSnapshot}
                disabled={loading || !newSnapshotName.trim()}
              >
                <ArchiveIcon className="size-3.5" />
                Save Version Snapshot
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* =========================================================================
            MODAL 4: VIEW ARCHIVE VERSION SNAPSHOT DATA
            ========================================================================= */}
        <Dialog open={viewSnapshotModalOpen} onOpenChange={setViewSnapshotModalOpen}>
          <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
            <DialogHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="text-base flex items-center gap-2">
                    <ArchiveIcon className="size-4 text-purple-600" />
                    Snapshot Version: {viewSnapshotData?.versionName}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Captured on {viewSnapshotData ? new Date(viewSnapshotData.createdAt).toLocaleString() : ""} by {viewSnapshotData?.createdBy || "System"}. Total {viewSnapshotData?.recordCount} records.
                  </DialogDescription>
                </div>

                {viewSnapshotData?.records && viewSnapshotData.records.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => {
                      const recs = filteredSnapshotRecords;
                      if (!recs.length) return;
                      const headers = ["Category","Identifier","Synced at",...new Set(recs.flatMap(r=>Object.keys(r.data||r)))];
                      exportToExcel(
                        `snapshot-${viewSnapshotData.versionName.replace(/\s+/g, "_")}`,
                        headers,
                        recs.map((r: any) => {
                          const d = r.data || r;
                          return headers.map((h) => h==="Category"?r.category:h==="Identifier"?r.externalId:h==="Synced at"?r.syncedAt:d[h] ?? "");
                        })
                      );
                    }}
                  >
                    <FileSpreadsheetIcon className="size-3.5 text-emerald-600" /> Export Snapshot (.csv)
                  </Button>
                )}
              </div>
            </DialogHeader>

            <div className="flex flex-wrap gap-2"><label className="text-xs">Category<select className="ml-1 rounded border bg-background p-2" value={snapshotCategory} onChange={e=>setSnapshotCategory(e.target.value)}><option value="all">All categories</option>{LEGACY_CMS_CATEGORIES.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</select></label><label className="text-xs">Record date from<Input type="date" value={snapshotFrom} onChange={e=>setSnapshotFrom(e.target.value)}/></label><label className="text-xs">Record date to<Input type="date" value={snapshotTo} onChange={e=>setSnapshotTo(e.target.value)}/></label><label className="text-xs">Rows<select className="ml-1 rounded border bg-background p-2" value={snapshotSize} onChange={e=>setSnapshotSize(Number(e.target.value))}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label></div>
            {/* Snapshot internal search */}
            <div className="py-2">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search within this snapshot..."
                  value={snapshotSearch}
                  onChange={(e) => setSnapshotSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto border rounded-xl">
              <Table>
                <TableHeader className="bg-muted/40 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Identifier / Title</TableHead>
                    <TableHead className="text-xs">Key Data</TableHead>
                    <TableHead className="text-xs">Synced At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const recs = filteredSnapshotRecords;

                    if (recs.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-10 text-xs text-muted-foreground">
                            No records match search in this snapshot.
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return recs.slice((snapshotPage-1)*snapshotSize,snapshotPage*snapshotSize).map((r: any, idx: number) => {
                      const data = r.data || {};
                      return (
                        <TableRow key={r.id || idx} className="text-xs hover:bg-muted/30">
                          <TableCell className="capitalize font-mono text-[11px]">{r.category || viewSnapshotData?.category}</TableCell>
                          <TableCell className="font-semibold text-foreground">{r.title || r.externalId || data.Name || data.Student || "Record"}</TableCell>
                          <TableCell className="font-mono text-[11px] text-muted-foreground max-w-md truncate">
                            <details><summary className="cursor-pointer">View all fields</summary><pre className="max-w-lg whitespace-pre-wrap break-all">{JSON.stringify(data,null,2)}</pre></details>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-[11px]">
                            {r.syncedAt ? new Date(r.syncedAt).toLocaleDateString() : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between text-xs"><span>{filteredSnapshotRecords.length} matching records · page {snapshotPage} of {Math.max(1,Math.ceil(filteredSnapshotRecords.length/snapshotSize))}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={snapshotPage<=1} onClick={()=>setSnapshotPage(p=>p-1)}>Previous</Button><Button size="sm" variant="outline" disabled={snapshotPage*snapshotSize>=filteredSnapshotRecords.length} onClick={()=>setSnapshotPage(p=>p+1)}>Next</Button></div></div>
            <DialogFooter className="pt-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setViewSnapshotModalOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* =========================================================================
            MODAL 5: RESOLVE / TAKE ACTION ON NOOR CMS FEEDBACK
            ========================================================================= */}
        <Dialog open={feedbackResolveModalOpen} onOpenChange={setFeedbackResolveModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <CheckCircleIcon className="size-4 text-emerald-600" />
                Resolve Feedback #{activeFeedbackItem?.ID || activeFeedbackItem?.id || ""}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Update the resolution status and record action notes for this feedback submission.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">User / Title</Label>
                <p className="font-medium text-foreground">
                  {activeFeedbackItem?.Name || activeFeedbackItem?.Student || activeFeedbackItem?.title || "Feedback Submission"}
                </p>
                <p className="text-[11px] text-muted-foreground italic">
                  {activeFeedbackItem?.Message || activeFeedbackItem?.Feedback || activeFeedbackItem?.details || "No message provided."}
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="fb-status" className="text-xs font-semibold">Resolution Status</Label>
                <select
                  id="fb-status"
                  value={feedbackResolveStatus}
                  onChange={(e) => setFeedbackResolveStatus(e.target.value as any)}
                  className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="resolved">Resolved (Action completed)</option>
                  <option value="reviewed">Reviewed / Under investigation</option>
                  <option value="pending">Pending</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="fb-notes" className="text-xs font-semibold">Resolution Notes</Label>
                <textarea
                  id="fb-notes"
                  rows={4}
                  placeholder="Describe actions taken (e.g. Called parent, resolved login password reset, escalated to dev team)..."
                  value={feedbackResolveNotes}
                  onChange={(e) => setFeedbackResolveNotes(e.target.value)}
                  className="w-full rounded-lg border bg-background p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setFeedbackResolveModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                onClick={handleResolveFeedback}
                disabled={loading}
              >
                <CheckCircleIcon className="size-3.5" />
                Confirm Resolution
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </LegacyCmsContext.Provider>
  );
}
