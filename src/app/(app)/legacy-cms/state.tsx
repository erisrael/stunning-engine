"use client";

// Legacy CMS: every piece of state and every handler of the page (split from legacy-cms-client.tsx; Update 1.0 u2).
// The views read them through the context (context.tsx).
import { waitForCmsTask } from "@/lib/cms-task-client";
import type { LiveCmsPageResult } from "@/server/legacy-cms";
import type { CmsRemoteFilter } from "@/lib/cms-livewire";
import { cmsDateMatches, cmsChoiceMatches, cmsField, cmsPresetRange } from "@/lib/cms-filters";
import type { CmsRangeResult } from "@/server/cms-range";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import jsQR from "jsqr";
import { Switch } from "@/components/ui/switch";
import { syncLegacyCmsAction, listLegacyCmsRecordsAction, checkLegacyCmsAuthAction, logoutLegacyCmsAction, getStudentParentRelationsAction, getLegacyCmsRevenueAnalyticsAction, approveLegacyCmsInvoiceAction, getLegacyCmsGrowthAnalyticsAction, fetchLegacyCmsInvoiceReceiptAction, deleteLegacyCmsCategoryDataAction, getLegacyCmsStorageStatusAction, reportUserIssueToQuestionsAction, createLegacyCmsSnapshotAction, listLegacyCmsSnapshotsAction, getLegacyCmsSnapshotAction, deleteLegacyCmsSnapshotAction, resolveLegacyCmsFeedbackAction, syncAndLoadStudentParentRelationsAction } from "@/app/actions/legacy-cms";
import type { LegacyCmsCategory, LegacyCmsConfig, LegacyCmsRecord, CmsRoleVisibility, StudentParentRelation, RevenueAnalytics, GrowthAnalytics, CmsStorageCategoryStatus, LegacyCmsSnapshot } from "@/server/legacy-cms";
import { type QuestionRecipient } from "@/components/app/questions/searchable-recipient-combobox";
import { getEligibleQuestionRecipientsAction } from "@/app/actions/question-routing";

export type LegacyCmsProps = {  config: LegacyCmsConfig;
  initialCategory: LegacyCmsCategory;
  initialRecords: { rows: LegacyCmsRecord[]; total: number };
  stats: {
    studentsCount: number;
    parentsCount: number;
    plansCount: number;
    activeSubscriptionsCount: number;
    invoicesCount: number;
    lastSyncedAt: string | null;
  };
  isAdmin?: boolean;
  allowedCategories?: LegacyCmsCategory[];
  visibility?: CmsRoleVisibility;
  initialRelations?: {
    relations: StudentParentRelation[];
    summary: { totalStudents: number; linkedParents: number; withPhone: number; activeSubscriptions: number };
  };
  initialRevenue?: RevenueAnalytics;
  initialGrowth?: GrowthAnalytics;
  initialStorage?: CmsStorageCategoryStatus[];
  cmsRoles?: {key:string;label:string}[];
  staffUsers?: { id: string; name: string; handle: string; role: string }[];
  // Set by the page's tab bar (Update 1.0): this client then shows only that view, without its own tabs.
  view?: "subpages" | "relations" | "revenue" | "growth" | "storage";
};

export function useLegacyCmsState({
  config,
  initialCategory,
  initialRecords,
  stats,
  isAdmin = true,
  allowedCategories = ["students", "parents", "subscriptions", "invoices", "subscription-plans", "subscription-histories", "feedback"],
  visibility,
  initialRelations,
  initialRevenue,
  initialGrowth,
  initialStorage,
  cmsRoles = [],
  staffUsers = [],
  view,
}: LegacyCmsProps) {
  const router = useRouter();

  // Top-level Navigation Mode: "subpages" | "relations" | "revenue" | "growth" | "storage"
  const [activeMainView, setActiveMainView] = React.useState<"subpages" | "relations" | "revenue" | "growth" | "storage">(view ?? "subpages");
  React.useEffect(() => { if (view) setActiveMainView(view); }, [view]);
  // The connection header belongs with Tables & sync when the page's tab bar drives the view.
  const showChrome = !view || view === "subpages";

  // Subpages Data Source Mode: "scraped" (fast local cache) vs "live" (real-time query against cms.noorethiopia.com)
  const [dataSourceMode, setDataSourceMode] = React.useState<"scraped" | "live">("scraped");

  // Category Tables State
  const [columnFilter,setColumnFilter]=React.useState("");
  const [columnQuery,setColumnQuery]=React.useState("");
  const [analyticsProgress,setAnalyticsProgress]=React.useState("");
  const [category, setCategory] = React.useState<LegacyCmsCategory>(initialCategory);
  const [records, setRecords] = React.useState(initialRecords.rows);
  const [total, setTotal] = React.useState(initialRecords.total);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [gradeFilter, setGradeFilter] = React.useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = React.useState("all");


  // Date Range Filters: "all" | "today" | "yesterday" | "week" | "month" | "30days" | "custom"
  const [dateFilter, setDateFilter] = React.useState<"all" | "today" | "yesterday" | "week" | "month" | "30days" | "custom">("all");
  const [customStartDate, setCustomStartDate] = React.useState<string>("");
  const [customEndDate, setCustomEndDate] = React.useState<string>("");

  // Pagination State for Scraped Cache
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(25);

  // Live CMS Pagination & Search State
  const [remoteFilters, setRemoteFilters] = React.useState<CmsRemoteFilter[]>([]);
  const [remoteValues, setRemoteValues] = React.useState<Record<string, string>>({});
  const liveRequestId = React.useRef(0);
  const [liveScanProgress, setLiveScanProgress] = React.useState("");
  const [liveError,setLiveError] = React.useState("");
  const livePartial = React.useRef<{key:string;records:Record<string,string>[];headers:string[];filters:CmsRemoteFilter[];next:number;pages:number;total?:number}|null>(null);
  const [cmsProgress,setCmsProgress] = React.useState("");
  const syncCancelled = React.useRef(false);
  const syncBusy = React.useRef(false);
  const synchronizeCms = async (opts:{category?:LegacyCmsCategory|"all";maxPages?:number;deep?:boolean;force?:boolean}) => {
    if(syncBusy.current) return {ok:false,error:"A CMS refresh is already running.",message:"A CMS refresh is already running."};
    syncBusy.current=true;syncCancelled.current=false;setCmsProgress("Starting CMS refresh…");
    try {
      return await waitForCmsTask<Awaited<ReturnType<typeof syncLegacyCmsAction>>>({kind:"sync",category:opts.category || "all",maxPages:opts.maxPages},setCmsProgress,()=>syncCancelled.current);
    } catch(error) {const message=error instanceof Error?error.message:"CMS refresh failed";return {ok:false,error:message,message};}
    finally {syncBusy.current=false;setCmsProgress("");}
  };

  const [liveCompleteDataset, setLiveCompleteDataset] = React.useState(false);
  const liveDataset = React.useRef<{ key: string; records: Record<string, string>[]; headers: string[]; filters: CmsRemoteFilter[] } | null>(null);
  const [livePage, setLivePage] = React.useState(1);
  const [livePageSize, setLivePageSize] = React.useState<number>(10);
  const [liveTotalPages, setLiveTotalPages] = React.useState(1);
  const [liveTotalResults, setLiveTotalResults] = React.useState(0);
  const [liveFrom, setLiveFrom] = React.useState(0);
  const [liveTo, setLiveTo] = React.useState(0);
  const [liveRecords, setLiveRecords] = React.useState<Record<string, string>[]>([]);
  const [liveHeaders, setLiveHeaders] = React.useState<string[]>([]);
  const [liveLoading, setLiveLoading] = React.useState(false);

  const paymentMethods = React.useMemo(() => [...new Set(
    (dataSourceMode === "live" ? liveRecords : records.map(r => r.data)).map(r => cmsField(r, ["payment method", "method", "payment channel"])).filter(Boolean)
  )].sort(), [dataSourceMode, records, liveRecords]);

  // Question Recipients Routing State
  const [eligibleRecipients, setEligibleRecipients] = React.useState<QuestionRecipient[]>(staffUsers);
  const [routingConfigOpen, setRoutingConfigOpen] = React.useState(false);

  // Storage & Archives State
  const [storageStatus, setStorageStatus] = React.useState<CmsStorageCategoryStatus[]>(initialStorage || []);

  // Syncing & Progress State
  const [loading, setLoading] = React.useState(false);
  const [syncingCategory, setSyncingCategory] = React.useState<string | null>(null);
  const [deepSyncLimit, setDeepSyncLimit] = React.useState<number>(0); // 0 means ALL pages
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<LegacyCmsRecord | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  // Student-Parent Relations State
  const [relations, setRelations] = React.useState<StudentParentRelation[]>(initialRelations?.relations || []);
  const [relationsSummary, setRelationsSummary] = React.useState(
    initialRelations?.summary || { totalStudents: 0, linkedParents: 0, withPhone: 0, activeSubscriptions: 0 }
  );
  const [relSearch, setRelSearch] = React.useState("");
  const [relGradeFilter, setRelGradeFilter] = React.useState("all");
  const [relPhoneOnly, setRelPhoneOnly] = React.useState(false);
  const [relPage, setRelPage] = React.useState(1);
  const [relPageSize, setRelPageSize] = React.useState(25);

  // Revenue & Invoices State
  const [revenueData, setRevenueData] = React.useState<RevenueAnalytics>(
    initialRevenue || {
      summary: { totalRevenue: 0, totalPaidCount: 0, pendingApprovalRevenue: 0, pendingApprovalCount: 0, averageInvoiceValue: 0 },
      byPaymentMethod: [],
      byStatus: [],
      byMonth: [],
      byPlan: [],
      invoices: [],
    }
  );
  const [revMethodFilter, setRevMethodFilter] = React.useState("all");
  const [revStatusFilter, setRevStatusFilter] = React.useState("all");
  const [revStart,setRevStart]=React.useState(""),[revEnd,setRevEnd]=React.useState("");
  const [revSearch, setRevSearch] = React.useState("");
  const [revPage, setRevPage] = React.useState(1);
  const [revPageSize, setRevPageSize] = React.useState(25);

  // Receipt Modal State with Zoom & QR Detection
  const [receiptModalOpen, setReceiptModalOpen] = React.useState(false);
  const [receiptLoading, setReceiptLoading] = React.useState(false);
  const [activeReceiptInvoice, setActiveReceiptInvoice] = React.useState<{
    id: string;
    studentName?: string;
    amount?: string;
    paymentMethod?: string;
    status?: string;
    date?: string;
    paidBy?: string;
    bankReference?: string;
    imageUrl?: string | null;
    pdfUrl?: string | null;
  } | null>(null);
  const [receiptZoom, setReceiptZoom] = React.useState(1);
  const [receiptRotation, setReceiptRotation] = React.useState(0);
  const [detectedQrCode, setDetectedQrCode] = React.useState<string | null>(null);
  const [isScanningQr, setIsScanningQr] = React.useState(false);
  const [approvalNotes, setApprovalNotes] = React.useState("");

  // Report Issue to Questions Modal State
  const [reportModalOpen, setReportModalOpen] = React.useState(false);
  const [reportSubmitting, setReportSubmitting] = React.useState(false);
  const [reportData, setReportData] = React.useState<{
    category: string;
    itemTitle: string;
    itemId: string;
    ownerId: string;
    priority: string;
    details: string;
    contactPhone?: string;
  }>({
    category: "students",
    itemTitle: "",
    itemId: "",
    ownerId: eligibleRecipients[0]?.id || "",
    priority: "normal",
    details: "",
  });

  // Growth Analytics State
  const [growthData, setGrowthData] = React.useState<GrowthAnalytics>(
    initialGrowth || {
      summary: { totalStudents: 0, totalParents: 0, totalInvoices: 0, activeSubscriptions: 0, conversionRate: 0 },
      gradeDistribution: [],
      cityDemographics: [],
      planPopularity: [],
      genderBreakdown: [],
    }
  );

  // Student Parent Sync & Rebuild State
  const [relSyncLoading, setRelSyncLoading] = React.useState(false);
  const handleSyncAndLoadRelations = async () => {
    if(syncBusy.current) {toast.error("A CMS refresh is already running.");return;}
    setRelSyncLoading(true);
    try {
      syncBusy.current=true;syncCancelled.current=false;
      const res = await waitForCmsTask<Awaited<ReturnType<typeof syncAndLoadStudentParentRelationsAction>>>({kind:"contacts"},setCmsProgress,()=>syncCancelled.current);
      setRelSyncLoading(false);
      if (res.ok && res.data) {
        setRelations(res.data.relations);
        setRelationsSummary(res.data.summary);
        toast.success(`Loaded ${res.data.relations.length} student-parent relationships!`);
      } else {
        toast.error(res.error || "Failed to load directory");
      }
    } catch (e: any) {
      setRelSyncLoading(false);
      toast.error(String(e?.message || e));
    } finally {syncBusy.current=false;setCmsProgress("");}
  };

  // Archive Snapshots & Versioning State
  const [snapshots, setSnapshots] = React.useState<LegacyCmsSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = React.useState(false);
  const [createSnapshotModalOpen, setCreateSnapshotModalOpen] = React.useState(false);
  const [newSnapshotName, setNewSnapshotName] = React.useState("");
  const [newSnapshotCategory, setNewSnapshotCategory] = React.useState<LegacyCmsCategory | "all">("all");
  const [newSnapshotDesc, setNewSnapshotDesc] = React.useState("");
  const [viewSnapshotData, setViewSnapshotData] = React.useState<LegacyCmsSnapshot | null>(null);
  const [viewSnapshotModalOpen, setViewSnapshotModalOpen] = React.useState(false);
  const [snapshotSearch, setSnapshotSearch] = React.useState("");
  const [snapshotCategory,setSnapshotCategory]=React.useState("all"), [snapshotFrom,setSnapshotFrom]=React.useState(""), [snapshotTo,setSnapshotTo]=React.useState("");
  const [snapshotPage,setSnapshotPage]=React.useState(1),[snapshotSize,setSnapshotSize]=React.useState(25);
  const filteredSnapshotRecords=(viewSnapshotData?.records||[]).filter(r=>(snapshotCategory==="all"||r.category===snapshotCategory)&&(!snapshotSearch.trim()||JSON.stringify(r).toLowerCase().includes(snapshotSearch.toLowerCase()))&&cmsDateMatches(r.data||r,"custom",snapshotFrom,snapshotTo));
  React.useEffect(()=>setSnapshotPage(1),[snapshotSearch,snapshotCategory,snapshotFrom,snapshotTo,snapshotSize,viewSnapshotData]);


  const loadSnapshots = async () => {
    setSnapshotsLoading(true);
    const res = await listLegacyCmsSnapshotsAction();
    setSnapshotsLoading(false);
    if (res.ok) {
      setSnapshots(res.snapshots);
    }
  };

  const handleCreateSnapshot = async () => {
    if (!newSnapshotName.trim()) return toast.error("Please enter a version name (e.g. v1.0)");
    setLoading(true);
    const res = await createLegacyCmsSnapshotAction({
      versionName: newSnapshotName,
      category: newSnapshotCategory,
      description: newSnapshotDesc,
    });
    setLoading(false);
    if (res.ok) {
      toast.success(res.message || "Snapshot created!");
      setCreateSnapshotModalOpen(false);
      setNewSnapshotName("");
      setNewSnapshotDesc("");
      loadSnapshots();
    } else {
      toast.error(res.message || "Failed to create snapshot");
    }
  };

  const handleOpenSnapshotViewer = async (id: string) => {
    setLoading(true);
    const res = await getLegacyCmsSnapshotAction(id);
    setLoading(false);
    if (res.ok && res.snapshot) {
      setViewSnapshotData(res.snapshot);
      setViewSnapshotModalOpen(true);
    } else {
      toast.error(res.error || "Could not load snapshot details");
    }
  };

  const handleDeleteSnapshot = async (id: string, name: string) => {
    if (!confirm(`Delete snapshot "${name}"? This cannot be undone.`)) return;
    setLoading(true);
    const res = await deleteLegacyCmsSnapshotAction(id);
    setLoading(false);
    if (res.ok) {
      toast.success("Snapshot deleted");
      loadSnapshots();
    } else {
      toast.error(res.message || "Failed to delete snapshot");
    }
  };

  // Feedback Resolution State
  const [feedbackResolveModalOpen, setFeedbackResolveModalOpen] = React.useState(false);
  const [activeFeedbackItem, setActiveFeedbackItem] = React.useState<any | null>(null);
  const [feedbackResolveStatus, setFeedbackResolveStatus] = React.useState<"resolved" | "reviewed" | "pending">("resolved");
  const [feedbackResolveNotes, setFeedbackResolveNotes] = React.useState("");

  const handleResolveFeedback = async () => {
    if (!activeFeedbackItem) return;
    setLoading(true);
    const id = String(activeFeedbackItem._recordId || activeFeedbackItem.externalId || activeFeedbackItem.external_id || activeFeedbackItem.ID || "");
    if(!/^\d+$/.test(id)){setLoading(false);toast.error("No live feedback identifier is available for this record.");return;}
    const res = await resolveLegacyCmsFeedbackAction(id, {
      status: feedbackResolveStatus,
      notes: feedbackResolveNotes,
    });
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      setFeedbackResolveModalOpen(false);
      liveDataset.current=null;
      if(dataSourceMode==="live") await handleFetchLivePage(category,livePage,search);
      else await refreshAllViews();
    } else {
      toast.error(res.message || "Failed to update feedback");
    }
  };

  // Authentication & Session Status
  const [authStatus, setAuthStatus] = React.useState<{
    status: "checking" | "connected" | "disconnected" | "error";
    username: string;
    message: string;
    ms?: number;
  }>({
    status: "checking",
    username: config.username || "ops@myseed.com",
    message: "Verifying live session...",
  });
  const [checkingAuth, setCheckingAuth] = React.useState(false);

  // Settings & Visibility State
  const [cfg, setCfg] = React.useState({
    baseUrl: config.baseUrl,
    username: config.username === "ops@admin.com" ? "ops@myseed.com" : config.username || "ops@myseed.com",
    password: "",
    sessionCookie: "",
    autoSync: config.autoSync,
    syncIntervalMinutes: config.syncIntervalMinutes,
  });

  const [loggingIn, setLoggingIn] = React.useState(false);
  const [roleVisibility, setRoleVisibility] = React.useState<CmsRoleVisibility>(
    visibility || {
      support: ["students", "parents", "subscriptions"],
      finance: ["invoices", "subscription-plans", "subscription-histories", "subscriptions"],
      admin: ["students", "parents", "subscription-plans", "subscription-histories", "invoices", "subscriptions"],
    }
  );

  const handleCheckAuthStatus = async (showToast = false) => {
    setCheckingAuth(true);
    setAuthStatus((prev) => ({ ...prev, status: "checking", message: "Verifying session with Noor CMS..." }));
    try {
      const res = await waitForCmsTask<Awaited<ReturnType<typeof checkLegacyCmsAuthAction>>>({kind:"auth"});
      setCheckingAuth(false);
      if (res.ok) {
        setAuthStatus({
          status: "connected",
          username: res.username || "ops@myseed.com",
          message: res.message,
          ms: res.ms,
        });
        if (showToast) toast.success(`Noor CMS session verified (${res.ms}ms)`);
      } else {
        setAuthStatus({
          status: res.status as "disconnected" | "error",
          username: res.username || "ops@myseed.com",
          message: res.message,
          ms: res.ms,
        });
        if (showToast) toast.error(res.message);
      }
    } catch (err: any) {
      setCheckingAuth(false);
      if (String(err?.message || err).includes("Server Action")) {
        window.location.reload();
      }
    }
  };

  React.useEffect(() => {
    void handleCheckAuthStatus(false);
    getEligibleQuestionRecipientsAction().then((res) => {
      if (res.ok && res.recipients) {
        setEligibleRecipients(res.recipients);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Live Page directly from Noor CMS
  const handleFetchLivePage = async (cat: LegacyCmsCategory, pageNum: number, searchQ: string, size?: number) => {
    const s = size ?? livePageSize;
    const requestId = ++liveRequestId.current;
    setLiveLoading(true);
    setLiveError("");
    try {
      const needsAll = dateFilter !== "all" || paymentMethodFilter !== "all" || !!columnQuery.trim();
      const key = JSON.stringify([cat, searchQ, remoteValues]);
      // A date range goes to Noor first (Update 1.0): only rows in range are fetched, with Noor's own total.
      const dateRange = dateFilter !== "all" ? cmsPresetRange(dateFilter, customStartDate, customEndDate) : null;
      if (dateRange) {
        const rangeKey = JSON.stringify([cat, searchQ, remoteValues, dateRange]);
        let dataset = liveDataset.current?.key === rangeKey ? liveDataset.current : null;
        if (!dataset) {
          const res = await waitForCmsTask<CmsRangeResult>({ kind: "range", category: cat, ...dateRange, search: searchQ, filters: remoteValues }, (m) => { if (requestId === liveRequestId.current) setLiveScanProgress(m); }, () => requestId !== liveRequestId.current);
          if (requestId !== liveRequestId.current) return;
          dataset = { key: rangeKey, records: res.records, headers: res.headers, filters: res.filters };
          liveDataset.current = dataset;
        }
        setLiveRecords(dataset.records);
        setLiveHeaders(dataset.headers);
        setRemoteFilters(dataset.filters);
        setLivePage(pageNum);
        setLivePageSize(s);
        setLiveCompleteDataset(true);
        setLiveLoading(false);
        setLiveScanProgress("");
        return;
      }
      if (needsAll) {
        let dataset = liveDataset.current?.key === key ? liveDataset.current : null;
        if (!dataset) {
          // One job reads every page in parallel on the server (Update 1.0), instead of one job per page.
          const all = await waitForCmsTask<{ records: Record<string, string>[]; headers: string[]; filters: CmsRemoteFilter[]; total: number }>({ kind: "all", category: cat, search: searchQ, filters: remoteValues }, (m) => { if (requestId === liveRequestId.current) setLiveScanProgress(m); }, () => requestId !== liveRequestId.current);
          if (requestId !== liveRequestId.current) return;
          dataset = { key, records: all.records, headers: all.headers, filters: all.filters };
          liveDataset.current = dataset;
        }
        if (!dataset) {
          const partial = livePartial.current?.key===key ? livePartial.current : {key,records:[],headers:[],filters:[],next:1,pages:1,total:undefined};
          livePartial.current=partial;
          const collected=partial.records;
          let headers=partial.headers, filters=partial.filters;
          let pages=partial.pages, expectedTotal=partial.total;
          for (let p = partial.next; p <= pages; p++) {
            const result = await waitForCmsTask<LiveCmsPageResult>({kind:"live",category:cat,page:p,pageSize:50,search:searchQ,filters:remoteValues},message=>{
              if(requestId===liveRequestId.current) setLiveScanProgress(`${collected.length.toLocaleString()} records loaded • ${message}`);
            },()=>requestId!==liveRequestId.current);
            if (requestId !== liveRequestId.current) return;
            if (!result.ok) throw new Error(result.message || "Live data loading failed. Retry to continue.");
            if (expectedTotal !== undefined && result.totalResults !== expectedTotal) {livePartial.current=null;throw new Error("CMS records changed while loading. Refresh to get a consistent result.");}
            expectedTotal = result.totalResults;
            pages = result.totalPages;
            if (p < pages && !result.records.length) throw new Error("CMS returned an incomplete page. Retry the live query.");
            collected.push(...result.records);
            if (result.headers.length) headers = result.headers;
            filters = result.filters ?? [];
            Object.assign(partial,{headers,filters,next:p+1,pages,total:expectedTotal});
          }
          if (collected.length !== expectedTotal) throw new Error("CMS row count did not match the complete result. Refresh and retry.");
          dataset = { key, records: collected, headers, filters };
          liveDataset.current = dataset;
        }
        setLiveRecords(dataset.records);
        setLiveHeaders(dataset.headers);
        setRemoteFilters(dataset.filters);
        setLivePage(pageNum);
        setLivePageSize(s);
        setLiveCompleteDataset(true);
        setLiveLoading(false);
        setLiveScanProgress("");
        return;
      }
      setLiveCompleteDataset(false);
      const res = await waitForCmsTask<LiveCmsPageResult>({kind:"live",category:cat,page:pageNum,pageSize:s,search:searchQ,filters:remoteValues},message=>{if(requestId===liveRequestId.current)setLiveScanProgress(message);},()=>requestId!==liveRequestId.current);
      if (requestId !== liveRequestId.current) return;
      setLiveLoading(false);
      setLiveScanProgress("");
      if (res.ok) {
        setRemoteFilters(res.filters ?? []);
        if (res.pageSize) setLivePageSize(res.pageSize);
        setLiveRecords(res.records);
        setLiveHeaders(res.headers);
        setLivePage(res.currentPage);
        setLiveTotalPages(res.totalPages);
        setLiveTotalResults(res.totalResults);
        setLiveFrom(res.from);
        setLiveTo(res.to);
      } else {
        setLiveRecords([]);
        toast.error(res.message || "Failed to load live CMS page");
      }
    } catch (err: any) {
      if (requestId !== liveRequestId.current) return;
      setLiveRecords([]);
      setLiveScanProgress("");
      setLiveLoading(false);
      if (String(err?.message || err).includes("Server Action")) window.location.reload();
      else {setLiveError(String(err?.message || err));toast.error(String(err?.message || err));}
    }
  };

  // Switch between Live and Scraped modes
  React.useEffect(() => {
    const timer=setTimeout(()=>{if(dataSourceMode === "live") void handleFetchLivePage(category,1,search,livePageSize);},300);
    return () => { clearTimeout(timer);liveRequestId.current++; };
  }, [category, dataSourceMode, remoteValues, dateFilter, customStartDate, customEndDate, paymentMethodFilter, columnQuery, columnFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (activeMainView === "storage") {
      void loadSnapshots();
    }
  }, [activeMainView]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshLiveAnalytics = async () => {
    try {for(const category of ["students","parents","subscriptions","invoices"] as const){setAnalyticsProgress(`Loading ${category} from Noor…`);const result=await synchronizeCms({category,deep:true});if(!result.ok) throw new Error(result.error || result.message);}
      await refreshAllViews(); toast.success("Analytics rebuilt from live Noor data.");
    } catch(e){toast.error(e instanceof Error?e.message:"Could not refresh analytics");} finally {setAnalyticsProgress("");}
  };
  const refreshAllViews = async () => {
    const [catRes, relRes, revRes, groRes, stoRes] = await Promise.all([
      listLegacyCmsRecordsAction(category, { q: search, limit: 0 }),
      getStudentParentRelationsAction(),
      getLegacyCmsRevenueAnalyticsAction(),
      getLegacyCmsGrowthAnalyticsAction(),
      getLegacyCmsStorageStatusAction(),
    ]);
    if (catRes.ok) {
      setRecords(catRes.data.rows);
      setTotal(catRes.data.total);
    }
    if (relRes.ok) {
      setRelations(relRes.data.relations);
      setRelationsSummary(relRes.data.summary);
    }
    if (revRes.ok) setRevenueData(revRes.data);
    if (groRes.ok) setGrowthData(groRes.data);
    if (stoRes.ok) setStorageStatus(stoRes.data);
    router.refresh();
  };

  const handleLogout = async () => {
    const res = await logoutLegacyCmsAction();
    if (res.ok) {
      toast.success(res.message);
      setAuthStatus({
        status: "disconnected",
        username: config.username || "ops@myseed.com",
        message: "Logged out. Cookie cleared.",
      });
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  // Per-category Single Deep Scrape (option to scrape ALL or specified count)
  const handleScrapeCategory = async (targetCat: LegacyCmsCategory, maxPages = 0) => {
    setSyncingCategory(targetCat);
    const pageDesc = maxPages === 0 ? "ALL available pages" : `first ${maxPages} pages`;
    toast.info(`Scraping ${targetCat} (${pageDesc}) directly from Noor CMS...`);
    const res = await synchronizeCms({
      force: true,
      category: targetCat,
      deep: true,
      maxPages: maxPages > 0 ? maxPages : undefined,
    });
    setSyncingCategory(null);
    if (res.ok) {
      toast.success(res.message);
      await handleCheckAuthStatus(false);
      await refreshAllViews();
    } else {
      toast.error(res.error || res.message || "Scraping failed");
    }
  };

  // Delete scraped category data
  const handleDeleteCategoryData = async (cat: LegacyCmsCategory | "all") => {
    const promptMsg =
      cat === "all"
        ? "Permanently delete ALL scraped CMS datasets? This will clear all cached records."
        : `Permanently delete scraped records for ${cat}?`;
    if (!confirm(promptMsg)) return;

    setLoading(true);
    const res = await deleteLegacyCmsCategoryDataAction(cat);
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      await refreshAllViews();
    } else {
      toast.error(res.message);
    }
  };

  // Review Receipt Modal & QR scanner
  const handleOpenReceipt = async (invRecord: any) => {
    const invId = invRecord.external_id || invRecord.ID || invRecord.id || invRecord.invoice_number;
    setActiveReceiptInvoice({
      id: invId,
      studentName: invRecord.student_name || invRecord.Student || invRecord.title || "Student",
      amount: invRecord.amount || invRecord.Amount || "—",
      paymentMethod: invRecord.payment_method || invRecord["Payment Method"] || "bank",
      status: invRecord.status || invRecord.Status || "pending",
      date: invRecord.date || invRecord.Date || invRecord.created_at || "—",
      bankReference: invRecord.bankReference || invRecord["Bank Reference"] || "—",
      imageUrl: null,
      pdfUrl: null,
    });
    setReceiptZoom(1);
    setReceiptRotation(0);
    setDetectedQrCode(null);
    setApprovalNotes("");
    setReceiptModalOpen(true);
    setReceiptLoading(true);

    try {
      const res = await fetchLegacyCmsInvoiceReceiptAction(invId);
      setReceiptLoading(false);
      if (res.ok) {
        setActiveReceiptInvoice((prev) => ({
          ...prev!,
          studentName: res.studentName || prev?.studentName,
          amount: res.amount || prev?.amount,
          paymentMethod: res.paymentMethod || prev?.paymentMethod,
          status: res.status || prev?.status,
          date: res.date || prev?.date,
          paidBy: res.paidBy || prev?.paidBy,
          bankReference: res.bankReference || prev?.bankReference,
          imageUrl: res.imageUrl,
          pdfUrl: res.pdfUrl,
        }));
      }
    } catch {
      setReceiptLoading(false);
    }
  };

  // QR Code Scanner on Receipt Image
  const scanQrCodeFromImage = (imgElement: HTMLImageElement) => {
    try {
      setIsScanningQr(true);
      const canvas = document.createElement("canvas");
      canvas.width = imgElement.naturalWidth || imgElement.width;
      canvas.height = imgElement.naturalHeight || imgElement.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsScanningQr(false);
        return;
      }
      ctx.drawImage(imgElement, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });
      setIsScanningQr(false);
      if (code && code.data) {
        setDetectedQrCode(code.data);
        toast.success(`QR Code detected on receipt!`);
      } else {
        setDetectedQrCode(null);
      }
    } catch (e) {
      setIsScanningQr(false);
      console.warn("QR scan failed:", e);
    }
  };

  const handleApproveInvoice = async (invoiceId: string) => {
    setLoading(true);
    const res = await approveLegacyCmsInvoiceAction(invoiceId, approvalNotes);
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      setReceiptModalOpen(false);
      await refreshAllViews();
    } else {
      toast.error(res.message || "Failed to verify receipt");
    }
  };

  // Open "Report Issue to Questions" modal
  const handleOpenReportModal = (item: any, cat: string) => {
    const rawData = item.data || item;
    const name = rawData.Name || rawData.name || rawData.Student || rawData.student_name || rawData.title || item.title || "User";
    const phone = rawData.Phone || rawData.phone || rawData.mobile || rawData.parent_phone || "";
    const extId = item.external_id || item.ID || item.id || "";
    const grade = rawData.Grade || rawData.grade || rawData.grades || "";

    setReportData({
      category: cat,
      itemTitle: name,
      itemId: extId,
      ownerId: eligibleRecipients[0]?.id || "",
      priority: "normal",
      contactPhone: phone,
      details: `Report for ${cat.toUpperCase()} #${extId} (${name}):\n- Phone: ${phone || "Not specified"}\n- Grade / Package: ${grade || "—"}\n- Context: Verified from Noor Ethiopia CMS mirror.\n\nIssue Details: `,
    });
    setReportModalOpen(true);
  };

  const handleSendReportQuestion = async () => {
    if (!reportData.ownerId) return toast.error("Please select a recipient from the team.");
    if (!reportData.details.trim()) return toast.error("Please describe the issue.");

    setReportSubmitting(true);
    const res = await reportUserIssueToQuestionsAction({
      ownerId: reportData.ownerId,
      category: reportData.category,
      title: `Issue Report: ${reportData.itemTitle} (#${reportData.itemId})`,
      question: reportData.details,
      context: {
        category: reportData.category,
        itemId: reportData.itemId,
        itemTitle: reportData.itemTitle,
        contactPhone: reportData.contactPhone,
      },
    });
    setReportSubmitting(false);

    if (res.ok) {
      toast.success("Issue successfully reported to Questions section!");
      setReportModalOpen(false);
    } else {
      toast.error(res.error || "Failed to send question");
    }
  };

  const copyText = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    toast.success(`Copied: ${txt}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Generic Export to Excel (.csv format with UTF-8 BOM)
  const exportToExcel = (
    filename: string,
    headers: string[],
    rows: (string | number | boolean | null | undefined)[][]
  ) => {
    if (rows.length === 0) return toast.error("No data to export");
    const sanitize = (val: unknown) => {
      if (val === null || val === undefined) return '""';
      const raw=String(val);
      const s = (/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw).replace(/"/g, '""');
      return `"${s}"`;
    };

    const csvContent =
      "\uFEFF" +
      headers.map(sanitize).join(",") +
      "\r\n" +
      rows.map((row) => row.map(sanitize).join(",")).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}.csv (Excel compatible)`);
  };

  const matchesDateFilter = (data: Record<string, unknown>) =>
    cmsDateMatches(data, dateFilter, customStartDate, customEndDate);

  // Filtered Scraped Records
  const filteredRecords = React.useMemo(() => {
    return records.filter((r) => {
      const data = r.data || {};
      const matchesSearch =
        !search.trim() ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.externalId.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(data).toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter !== "all") {
        const rowStatus = String(data.Status || data.status || data["Payment Status"] || data["Subscription Status"] || "").toLowerCase();
        if (!cmsChoiceMatches(rowStatus, statusFilter)) return false;
      }

      if (gradeFilter !== "all") {
        const rowGrade = String(data.Grade || data.grade || data.Grades || data.grades || data.Plan || data.plan || "").toLowerCase();
        if (!cmsChoiceMatches(rowGrade, gradeFilter)) return false;
      }

      if (!cmsChoiceMatches(cmsField(data, ["payment method", "method", "payment channel"]), paymentMethodFilter)) return false;
      if (columnQuery.trim() && !String(data[columnFilter] ?? "").toLocaleLowerCase().includes(columnQuery.trim().toLocaleLowerCase())) return false;
      if (!matchesDateFilter(data)) return false;

      return true;
    });
  }, [records, search, statusFilter, gradeFilter, paymentMethodFilter, dateFilter, customStartDate, customEndDate, columnQuery, columnFilter]);

  // Filtered Live Records (Enriched direct CMS live filtering with Search, Status, Grade, and Date)
  const filteredLiveRecords = React.useMemo(() => {
    return liveRecords.filter((r) => {
      // Date filter
      if (!cmsChoiceMatches(cmsField(r, ["payment method", "method", "payment channel"]), paymentMethodFilter)) return false;
      if (columnQuery.trim() && !String(r[columnFilter] ?? "").toLocaleLowerCase().includes(columnQuery.trim().toLocaleLowerCase())) return false;
      if (!matchesDateFilter(r)) return false;

      return true;
    });
  }, [liveRecords, search, statusFilter, gradeFilter, paymentMethodFilter, dateFilter, customStartDate, customEndDate, columnQuery, columnFilter]);

  const displayedLiveRecords = liveCompleteDataset ? filteredLiveRecords.slice((livePage - 1) * livePageSize, livePage * livePageSize) : filteredLiveRecords;
  const shownLiveTotal = liveCompleteDataset ? filteredLiveRecords.length : liveTotalResults;
  const shownLivePages = Math.max(1, Math.ceil(shownLiveTotal / livePageSize));
  const shownLiveFrom = liveCompleteDataset ? (shownLiveTotal ? (livePage - 1) * livePageSize + 1 : 0) : liveFrom;
  const shownLiveTo = liveCompleteDataset ? Math.min(livePage * livePageSize, shownLiveTotal) : liveTo;

  React.useEffect(() => { setCurrentPage(1); }, [search, statusFilter, gradeFilter, paymentMethodFilter, dateFilter, customStartDate, customEndDate, pageSize, category]);

  // Paginated Scraped Records
  const paginatedScrapedRecords = React.useMemo(() => {
    if (pageSize === 0) return filteredRecords;
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  const totalScrapedPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredRecords.length / pageSize));

  // Filtered & Paginated Student-Parent Relations
  const filteredRelations = React.useMemo(() => {
    return relations.filter((r) => {
      if (relSearch.trim()) {
        const q = relSearch.toLowerCase();
        const matchesName = r.studentName.toLowerCase().includes(q);
        const matchesParent = (r.parentName || "").toLowerCase().includes(q);
        const matchesPhone = (r.parentPhone || "").includes(q);
        const matchesCity = (r.city || "").toLowerCase().includes(q);
        if (!matchesName && !matchesParent && !matchesPhone && !matchesCity) return false;
      }
      if (relGradeFilter !== "all" && r.grade !== relGradeFilter) return false;
      if (relPhoneOnly && !r.parentPhone) return false;
      return true;
    });
  }, [relations, relSearch, relGradeFilter, relPhoneOnly]);

  const totalRelPages = relPageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredRelations.length / relPageSize));
  const paginatedRelations = React.useMemo(() => {
    if (relPageSize === 0) return filteredRelations;
    const start = (relPage - 1) * relPageSize;
    return filteredRelations.slice(start, start + relPageSize);
  }, [filteredRelations, relPage, relPageSize]);

  React.useEffect(()=>{
    if(activeMainView!=="revenue")return;
    let canceled=false;
    const timer=setTimeout(()=>{void getLegacyCmsRevenueAnalyticsAction({search:revSearch,method:revMethodFilter,status:revStatusFilter,startDate:revStart,endDate:revEnd}).then(r=>{if(!canceled&&r.ok)setRevenueData(r.data);});},300);
    return ()=>{canceled=true;clearTimeout(timer);};
  },[activeMainView,revSearch,revMethodFilter,revStatusFilter,revStart,revEnd]);
  // Filtered & Paginated Revenue Invoices
  const filteredInvoices = React.useMemo(() => {
    return revenueData.invoices.filter((inv) => {
      if(!cmsDateMatches({Date:inv.date},"custom",revStart,revEnd)) return false;
      if (revSearch.trim()) {
        const q = revSearch.toLowerCase();
        if (
          !inv.id.toLowerCase().includes(q) &&
          !inv.student.toLowerCase().includes(q) &&
          !(inv.reason || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (revMethodFilter !== "all" && inv.paymentMethod.toLowerCase() !== revMethodFilter.toLowerCase()) {
        return false;
      }
      if (revStatusFilter !== "all") {
        if (revStatusFilter === "needs_approval" && !inv.needsApproval) return false;
        if (revStatusFilter !== "needs_approval" && inv.status.toLowerCase() !== revStatusFilter.toLowerCase()) return false;
      }
      return true;
    });
  }, [revenueData.invoices, revSearch, revMethodFilter, revStatusFilter,revStart,revEnd]);

  const totalRevPages = revPageSize === 0 ? 1 : Math.max(1, Math.ceil(filteredInvoices.length / revPageSize));
  const paginatedInvoices = React.useMemo(() => {
    if (revPageSize === 0) return filteredInvoices;
    const start = (revPage - 1) * revPageSize;
    return filteredInvoices.slice(start, start + revPageSize);
  }, [filteredInvoices, revPage, revPageSize]);

  // Determine dynamic columns for local scraped records
  const dynamicColumns = React.useMemo(() => {
    if (records.length === 0) return [];
    const keys = new Set<string>();
    records.slice(0, 30).forEach((r) => {
      Object.keys(r.data || {}).forEach((k) => {
        if (!k.startsWith("_") && k.toLowerCase() !== "id") keys.add(k);
      });
    });
    return Array.from(keys).slice(0, 7);
  }, [records]);


  return { config, initialCategory, initialRecords, stats, isAdmin, allowedCategories, visibility, initialRelations, initialRevenue, initialGrowth, initialStorage, cmsRoles, staffUsers, view, router, activeMainView, setActiveMainView, showChrome, dataSourceMode, setDataSourceMode, columnFilter, setColumnFilter, columnQuery, setColumnQuery, analyticsProgress, setAnalyticsProgress, category, setCategory, records, setRecords, total, setTotal, search, setSearch, statusFilter, setStatusFilter, gradeFilter, setGradeFilter, paymentMethodFilter, setPaymentMethodFilter, dateFilter, setDateFilter, customStartDate, setCustomStartDate, customEndDate, setCustomEndDate, currentPage, setCurrentPage, pageSize, setPageSize, remoteFilters, setRemoteFilters, remoteValues, setRemoteValues, liveRequestId, liveScanProgress, setLiveScanProgress, liveError, setLiveError, livePartial, cmsProgress, setCmsProgress, syncCancelled, syncBusy, synchronizeCms, liveCompleteDataset, setLiveCompleteDataset, liveDataset, livePage, setLivePage, livePageSize, setLivePageSize, liveTotalPages, setLiveTotalPages, liveTotalResults, setLiveTotalResults, liveFrom, setLiveFrom, liveTo, setLiveTo, liveRecords, setLiveRecords, liveHeaders, setLiveHeaders, liveLoading, setLiveLoading, paymentMethods, eligibleRecipients, setEligibleRecipients, routingConfigOpen, setRoutingConfigOpen, storageStatus, setStorageStatus, loading, setLoading, syncingCategory, setSyncingCategory, deepSyncLimit, setDeepSyncLimit, settingsOpen, setSettingsOpen, selectedRecord, setSelectedRecord, copiedKey, setCopiedKey, relations, setRelations, relationsSummary, setRelationsSummary, relSearch, setRelSearch, relGradeFilter, setRelGradeFilter, relPhoneOnly, setRelPhoneOnly, relPage, setRelPage, relPageSize, setRelPageSize, revenueData, setRevenueData, revMethodFilter, setRevMethodFilter, revStatusFilter, setRevStatusFilter, revStart, setRevStart, revEnd, setRevEnd, revSearch, setRevSearch, revPage, setRevPage, revPageSize, setRevPageSize, receiptModalOpen, setReceiptModalOpen, receiptLoading, setReceiptLoading, activeReceiptInvoice, setActiveReceiptInvoice, receiptZoom, setReceiptZoom, receiptRotation, setReceiptRotation, detectedQrCode, setDetectedQrCode, isScanningQr, setIsScanningQr, approvalNotes, setApprovalNotes, reportModalOpen, setReportModalOpen, reportSubmitting, setReportSubmitting, reportData, setReportData, growthData, setGrowthData, relSyncLoading, setRelSyncLoading, handleSyncAndLoadRelations, snapshots, setSnapshots, snapshotsLoading, setSnapshotsLoading, createSnapshotModalOpen, setCreateSnapshotModalOpen, newSnapshotName, setNewSnapshotName, newSnapshotCategory, setNewSnapshotCategory, newSnapshotDesc, setNewSnapshotDesc, viewSnapshotData, setViewSnapshotData, viewSnapshotModalOpen, setViewSnapshotModalOpen, snapshotSearch, setSnapshotSearch, snapshotCategory, setSnapshotCategory, snapshotFrom, setSnapshotFrom, snapshotTo, setSnapshotTo, snapshotPage, setSnapshotPage, snapshotSize, setSnapshotSize, filteredSnapshotRecords, loadSnapshots, handleCreateSnapshot, handleOpenSnapshotViewer, handleDeleteSnapshot, feedbackResolveModalOpen, setFeedbackResolveModalOpen, activeFeedbackItem, setActiveFeedbackItem, feedbackResolveStatus, setFeedbackResolveStatus, feedbackResolveNotes, setFeedbackResolveNotes, handleResolveFeedback, authStatus, setAuthStatus, checkingAuth, setCheckingAuth, cfg, setCfg, loggingIn, setLoggingIn, roleVisibility, setRoleVisibility, handleCheckAuthStatus, handleFetchLivePage, refreshLiveAnalytics, refreshAllViews, handleLogout, handleScrapeCategory, handleDeleteCategoryData, handleOpenReceipt, scanQrCodeFromImage, handleApproveInvoice, handleOpenReportModal, handleSendReportQuestion, copyText, exportToExcel, matchesDateFilter, filteredRecords, filteredLiveRecords, displayedLiveRecords, shownLiveTotal, shownLivePages, shownLiveFrom, shownLiveTo, paginatedScrapedRecords, totalScrapedPages, filteredRelations, totalRelPages, paginatedRelations, filteredInvoices, totalRevPages, paginatedInvoices, dynamicColumns };
}
export type LegacyCmsState = ReturnType<typeof useLegacyCmsState>;
