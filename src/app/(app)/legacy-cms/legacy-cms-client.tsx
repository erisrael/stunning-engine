"use client";

import type { CmsRemoteFilter } from "@/lib/cms-livewire";
import { cmsDateMatches, cmsChoiceMatches, cmsField } from "@/lib/cms-filters";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import jsQR from "jsqr";
import {
  DownloadIcon,
  RefreshCwIcon,
  SearchIcon,
  Settings2Icon,
  PhoneCallIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  GraduationCapIcon,
  UsersIcon,
  FileTextIcon,
  CreditCardIcon,
  HistoryIcon,
  SparklesIcon,
  EyeIcon,
  CalendarIcon,
  CheckCircle2Icon,
  ClockIcon,
  AlertCircleIcon,
  LockIcon,
  DatabaseIcon,
  Trash2Icon,
  ArchiveIcon,
  PlusIcon,
  LogInIcon,
  LogOutIcon,
  ShieldCheckIcon,
  ActivityIcon,
  TrendingUpIcon,
  DollarSignIcon,
  PhoneForwardedIcon,
  FileSpreadsheetIcon,
  CheckCircleIcon,
  ArrowUpRightIcon,
  BarChart3Icon,
  LayersIcon,
  PercentIcon,
  FilterIcon,
  ZoomInIcon,
  ZoomOutIcon,
  RotateCwIcon,
  QrCodeIcon,
  HelpCircleIcon,
  Building2Icon,
  RadioIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ArrowRightIcon,
  Maximize2Icon,
  SendIcon,
  ShieldIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  syncLegacyCmsAction,
  saveLegacyCmsConfigAction,
  listLegacyCmsRecordsAction,
  clearLegacyCmsDataAction,
  saveCmsRoleVisibilityAction,
  loginLegacyCmsAction,
  checkLegacyCmsAuthAction,
  logoutLegacyCmsAction,
  getStudentParentRelationsAction,
  getLegacyCmsRevenueAnalyticsAction,
  approveLegacyCmsInvoiceAction,
  getLegacyCmsGrowthAnalyticsAction,
  fetchLegacyCmsLivePageAction,
  fetchLegacyCmsInvoiceReceiptAction,
  deleteLegacyCmsCategoryDataAction,
  getLegacyCmsStorageStatusAction,
  reportUserIssueToQuestionsAction,
  createLegacyCmsSnapshotAction,
  listLegacyCmsSnapshotsAction,
  getLegacyCmsSnapshotAction,
  deleteLegacyCmsSnapshotAction,
  resolveLegacyCmsFeedbackAction,
  syncAndLoadStudentParentRelationsAction,
} from "@/app/actions/legacy-cms";
import type {
  LegacyCmsCategory,
  LegacyCmsConfig,
  LegacyCmsRecord,
  CmsRoleVisibility,
  StudentParentRelation,
  RevenueAnalytics,
  GrowthAnalytics,
  CmsStorageCategoryStatus,
  LegacyCmsSnapshot,
} from "@/server/legacy-cms";
import { FilamentPagination } from "@/components/app/legacy-cms/filament-pagination";
import { SearchableRecipientCombobox, type QuestionRecipient } from "@/components/app/questions/searchable-recipient-combobox";
import { QuestionRoutingConfigDialog } from "@/components/app/questions/question-routing-dialog";
import { getEligibleQuestionRecipientsAction } from "@/app/actions/question-routing";
import { cn } from "@/lib/utils";

const CATEGORY_PATHS: Record<LegacyCmsCategory, string> = {
  students: "/admin/students",
  parents: "/admin/parents",
  "subscription-plans": "/admin/subscription-plans",
  "subscription-histories": "/admin/subscription-histories",
  invoices: "/admin/invoices",
  subscriptions: "/admin/subscriptions",
  feedback: "/admin/feedback",
};

export function LegacyCmsClient({
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
  staffUsers = [],
}: {
  config: LegacyCmsConfig;
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
  staffUsers?: { id: string; name: string; handle: string; role: string }[];
}) {
  const router = useRouter();

  // Top-level Navigation Mode: "subpages" | "relations" | "revenue" | "growth" | "storage"
  const [activeMainView, setActiveMainView] = React.useState<"subpages" | "relations" | "revenue" | "growth" | "storage">("subpages");

  // Subpages Data Source Mode: "scraped" (fast local cache) vs "live" (real-time query against cms.noorethiopia.com)
  const [dataSourceMode, setDataSourceMode] = React.useState<"scraped" | "live">("scraped");

  // Category Tables State
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
    ownerId: staffUsers[0]?.id || "",
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
    setRelSyncLoading(true);
    try {
      const res = await syncAndLoadStudentParentRelationsAction();
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
    }
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
  const [feedbackResolveStatus, setFeedbackResolveStatus] = React.useState<"resolved" | "in_review" | "closed">("resolved");
  const [feedbackResolveNotes, setFeedbackResolveNotes] = React.useState("");

  const handleResolveFeedback = async () => {
    if (!activeFeedbackItem) return;
    setLoading(true);
    const id = activeFeedbackItem.ID || activeFeedbackItem.id || activeFeedbackItem.external_id || "1";
    const res = await resolveLegacyCmsFeedbackAction(id, {
      status: feedbackResolveStatus,
      notes: feedbackResolveNotes,
    });
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      setFeedbackResolveModalOpen(false);
      refreshAllViews();
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

  const [loginForm, setLoginForm] = React.useState({
    username: config.username === "ops@admin.com" ? "ops@myseed.com" : config.username || "ops@myseed.com",
    password: "9V7x6antUAU6eyE",
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
      const res = await checkLegacyCmsAuthAction();
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
      if (res.ok && res.recipients && res.recipients.length > 0) {
        setEligibleRecipients(res.recipients);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch Live Page directly from Noor CMS
  const handleFetchLivePage = async (cat: LegacyCmsCategory, pageNum: number, searchQ: string, size?: number) => {
    const s = size ?? livePageSize;
    const requestId = ++liveRequestId.current;
    setLiveLoading(true);
    try {
      const res = await fetchLegacyCmsLivePageAction({ category: cat, page: pageNum, pageSize: s, search: searchQ, filters: remoteValues });
      if (requestId !== liveRequestId.current) return;
      setLiveLoading(false);
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
        toast.error(res.message || "Failed to load live CMS page");
      }
    } catch (err: any) {
      if (requestId !== liveRequestId.current) return;
      setLiveLoading(false);
      if (String(err?.message || err).includes("Server Action")) window.location.reload();
      else toast.error(String(err?.message || err));
    }
  };

  // Switch between Live and Scraped modes
  React.useEffect(() => {
    if (dataSourceMode === "live") {
      handleFetchLivePage(category, 1, search, livePageSize);
    }
  }, [category, dataSourceMode, remoteValues]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (activeMainView === "storage") {
      void loadSnapshots();
    }
  }, [activeMainView]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAllViews = async () => {
    const [catRes, relRes, revRes, groRes, stoRes] = await Promise.all([
      listLegacyCmsRecordsAction(category, { q: search, limit: 200 }),
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

  const handleLoginSubmit = async () => {
    let userToUse = loginForm.username.trim() || "ops@myseed.com";
    if (userToUse === "ops@admin.com") userToUse = "ops@myseed.com";
    setLoggingIn(true);
    const res = await loginLegacyCmsAction({
      username: userToUse,
      password: loginForm.password.trim() || "9V7x6antUAU6eyE",
    });
    setLoggingIn(false);
    if (res.ok) {
      toast.success(res.message);
      await handleCheckAuthStatus(false);
      await refreshAllViews();
    } else {
      toast.error(res.message);
    }
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
    const res = await syncLegacyCmsAction({
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
      toast.error(res.error || "Scraping failed");
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
      toast.error(res.message || "Failed to approve invoice");
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
      ownerId: staffUsers[0]?.id || "",
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
      const s = String(val).replace(/"/g, '""');
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
      if (!matchesDateFilter(data)) return false;

      return true;
    });
  }, [records, search, statusFilter, gradeFilter, paymentMethodFilter, dateFilter, customStartDate, customEndDate]);

  // Filtered Live Records (Enriched direct CMS live filtering with Search, Status, Grade, and Date)
  const filteredLiveRecords = React.useMemo(() => {
    return liveRecords.filter((r) => {
      // Live search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches = Object.values(r).some((v) =>
          typeof v === "string" && v.toLowerCase().includes(q)
        );
        if (!matches) return false;
      }
      // Date filter
      if (!cmsChoiceMatches(cmsField(r, ["payment method", "method", "payment channel"]), paymentMethodFilter)) return false;
      if (!matchesDateFilter(r)) return false;

      return true;
    });
  }, [liveRecords, search, statusFilter, gradeFilter, paymentMethodFilter, dateFilter, customStartDate, customEndDate]);

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

  // Filtered & Paginated Revenue Invoices
  const filteredInvoices = React.useMemo(() => {
    return revenueData.invoices.filter((inv) => {
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
  }, [revenueData.invoices, revSearch, revMethodFilter, revStatusFilter]);

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

  return (
    <div className="space-y-4">
      {/* 🔒 Strict Read-Only Safety Sandbox Banner */}
      <div className="bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-medium">
          <ShieldCheckIcon className="size-4 shrink-0 text-emerald-600" />
          <span>
            <strong>Read-Only Safe Sandbox:</strong> This dashboard reads and mirrors data via HTTP GET requests. No modifications or actions are ever sent to Noor Ethiopia CMS.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-700 dark:text-emerald-300 gap-1">
            <LockIcon className="size-2.5" /> Read-Only Mode
          </Badge>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] gap-1",
              authStatus.status === "connected" && "bg-emerald-500/10 text-emerald-600",
              authStatus.status === "checking" && "bg-amber-500/10 text-amber-600",
              (authStatus.status === "disconnected" || authStatus.status === "error") && "bg-rose-500/10 text-rose-600"
            )}
          >
            {authStatus.status === "connected" ? <CheckCircle2Icon className="size-2.5" /> : <AlertCircleIcon className="size-2.5" />}
            {authStatus.status === "connected" ? "Live Session Verified" : "Re-auth Required"}
          </Badge>
        </div>
      </div>

      {/* Top Header Card */}
      <Card className="border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <DatabaseIcon className="size-4 text-emerald-600" />
              <span>Noor Ethiopia CMS Integration Hub</span>
              <Badge variant="secondary" className="text-[10px] font-mono">
                cms.noorethiopia.com
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Synchronized mirror for student records, parent contacts, payment receipts, and business intelligence.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCheckAuthStatus(true)}
              disabled={checkingAuth}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCwIcon className={cn("size-3.5", checkingAuth && "animate-spin")} />
              Check Session
            </Button>

            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                className="h-8 text-xs gap-1.5"
              >
                <Settings2Icon className="size-3.5" />
                Settings
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Main Top Navigation Tabs */}
      <Tabs
        value={activeMainView}
        onValueChange={(v) => setActiveMainView(v as any)}
        className="space-y-4"
      >
        <div className="flex items-center justify-between border-b pb-2">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="subpages" className="text-xs gap-1.5">
              <LayersIcon className="size-3.5 text-blue-600" /> CMS Tables &amp; Pages
            </TabsTrigger>
            <TabsTrigger value="relations" className="text-xs gap-1.5">
              <UsersIcon className="size-3.5 text-emerald-600" /> Student &rarr; Parent Directory
            </TabsTrigger>
            <TabsTrigger value="revenue" className="text-xs gap-1.5">
              <DollarSignIcon className="size-3.5 text-amber-600" /> Finance Revenue &amp; Approvals
            </TabsTrigger>
            <TabsTrigger value="growth" className="text-xs gap-1.5">
              <TrendingUpIcon className="size-3.5 text-indigo-600" /> Growth &amp; Insights
            </TabsTrigger>
            <TabsTrigger value="storage" className="text-xs gap-1.5">
              <DatabaseIcon className="size-3.5 text-purple-600" /> Storage &amp; Archives
            </TabsTrigger>
          </TabsList>
        </div>

        {/* =========================================================================
            VIEW 1: SUBPAGES TABLES (LIVE CMS SYNC OR LOCAL SCRAPED CACHE)
            ========================================================================= */}
        <TabsContent value="subpages" className="space-y-4 m-0">
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
                  <option value="0">All Pages (~5,000+)</option>
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

              <label className="flex items-center gap-2 text-xs">
                Payment method
                <select aria-label="Payment method" className="h-8 rounded-md border bg-background px-2" value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)}>
                  <option value="all">All methods</option>
                  {paymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
              {dataSourceMode === "live" && remoteFilters.map(filter => <label key={filter.key} className="flex items-center gap-2 text-xs capitalize">
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
              {dataSourceMode === "live" && <p className="w-full text-xs text-muted-foreground">CMS filters and Search query all records. Date and payment method narrow the displayed page.</p>}
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
                  Showing <strong>{liveFrom}</strong> to <strong>{liveTo}</strong> of <strong>{liveTotalResults.toLocaleString()}</strong> live results from{" "}
                  <code>{CATEGORY_PATHS[category]}</code>
                </span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleFetchLivePage(category, livePage, search)}
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
                        Fetching live data from cms.noorethiopia.com...
                      </TableCell>
                    </TableRow>
                  ) : filteredLiveRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={Math.max(1, liveHeaders.length + 1)} className="text-center py-12 text-xs text-muted-foreground">
                        {liveRecords.length > 0 ? "No records on this page match your active filters." : "No live records found on this page."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredLiveRecords.map((r, idx) => (
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
              from={liveFrom}
              to={liveTo}
              totalResults={liveTotalResults}
              currentPage={livePage}
              totalPages={liveTotalPages}
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
        </TabsContent>

        {/* =========================================================================
            VIEW 2: STUDENT TO PARENT DIRECTORY
            ========================================================================= */}
        <TabsContent value="relations" className="space-y-4 m-0">
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
        </TabsContent>

        {/* =========================================================================
            VIEW 3: FINANCE REVENUE & INVOICE APPROVAL QUEUE
            ========================================================================= */}
        <TabsContent value="revenue" className="space-y-4 m-0">
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
                    <option value="needs_approval">⚠️ Needs Verification</option>
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
        </TabsContent>

        {/* =========================================================================
            VIEW 4: GROWTH & INSIGHTS DASHBOARD
            ========================================================================= */}
        <TabsContent value="growth" className="space-y-4 m-0">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUpIcon className="size-4 text-indigo-600" /> Noor Ethiopia Growth &amp; Analytics
                </CardTitle>
                <CardDescription className="text-xs">
                  Academic enrollment distribution, grade levels, and subscription conversion analytics.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Grade distribution */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Students by Grade Level
                </h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {growthData.gradeDistribution.map((gd) => (
                    <div key={gd.grade} className="rounded-lg border p-3 bg-muted/20 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">{gd.grade}</span>
                        <span className="text-muted-foreground font-mono">{gd.percentage}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${gd.percentage}%` }} />
                      </div>
                      <span className="text-[11px] text-muted-foreground">{gd.count.toLocaleString()} students</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* City Demographics & Plan popularity */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 border rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Geographic Distribution (Cities)
                  </h4>
                  <div className="space-y-2 pt-1">
                    {growthData.cityDemographics.slice(0, 6).map((c) => (
                      <div key={c.city} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{c.city}</span>
                        <span className="font-mono text-muted-foreground">{c.count} students ({c.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 border rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Subscription Packages
                  </h4>
                  <div className="space-y-2 pt-1">
                    {growthData.planPopularity.map((p) => (
                      <div key={p.plan} className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{p.plan}</span>
                        <span className="font-mono text-muted-foreground">{p.count} active ({p.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            VIEW 5: STORAGE & SCRAPED ARCHIVES MANAGEMENT
            ========================================================================= */}
        <TabsContent value="storage" className="space-y-4 m-0">
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
        </TabsContent>
      </Tabs>

      {/* =========================================================================
          MODAL 1: RECEIPT IMAGE & SLIP PREVIEW WITH ZOOM & QR CODE DETECTION
          ========================================================================= */}
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
                  href={activeReceiptInvoice.pdfUrl}
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
                        onError={(e) => {
                          // Fallback to direct URL if proxy fails
                          const target = e.currentTarget;
                          if (target.src.includes("/api/legacy-cms/image-proxy")) {
                            target.src = activeReceiptInvoice.imageUrl!;
                            target.removeAttribute("crossorigin");
                          }
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        onClick={() => window.open(activeReceiptInvoice.imageUrl!, "_blank")}
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
                        onClick={() => window.open(activeReceiptInvoice.pdfUrl!, "_blank")}
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
              Approve Invoice &amp; Mark Paid
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
                    const recs = viewSnapshotData.records || [];
                    if (!recs.length) return;
                    const headers = Object.keys(recs[0]?.data || recs[0] || {});
                    exportToExcel(
                      `snapshot-${viewSnapshotData.versionName.replace(/\s+/g, "_")}`,
                      headers,
                      recs.map((r: any) => {
                        const d = r.data || r;
                        return headers.map((h) => d[h] || "");
                      })
                    );
                  }}
                >
                  <FileSpreadsheetIcon className="size-3.5 text-emerald-600" /> Export Snapshot (.csv)
                </Button>
              )}
            </div>
          </DialogHeader>

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
                  const recs = (viewSnapshotData?.records || []).filter((r: any) => {
                    if (!snapshotSearch.trim()) return true;
                    return JSON.stringify(r).toLowerCase().includes(snapshotSearch.toLowerCase());
                  });

                  if (recs.length === 0) {
                    return (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-xs text-muted-foreground">
                          No records match search in this snapshot.
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return recs.slice(0, 100).map((r: any, idx: number) => {
                    const data = r.data || {};
                    return (
                      <TableRow key={r.id || idx} className="text-xs hover:bg-muted/30">
                        <TableCell className="capitalize font-mono text-[11px]">{r.category || viewSnapshotData?.category}</TableCell>
                        <TableCell className="font-semibold text-foreground">{r.title || r.externalId || data.Name || data.Student || "Record"}</TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground max-w-md truncate">
                          {JSON.stringify(data).slice(0, 120)}...
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
                <option value="in_review">Under Investigation / In Review</option>
                <option value="closed">Closed / Dismissed</option>
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
  );
}
