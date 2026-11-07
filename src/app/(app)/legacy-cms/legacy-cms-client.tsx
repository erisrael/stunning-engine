"use client";

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
};

export function LegacyCmsClient({
  config,
  initialCategory,
  initialRecords,
  stats,
  isAdmin = true,
  allowedCategories = ["students", "parents", "subscriptions", "invoices", "subscription-plans", "subscription-histories"],
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

  // Date Range Filters: "all" | "today" | "yesterday" | "week" | "month" | "30days" | "custom"
  const [dateFilter, setDateFilter] = React.useState<"all" | "today" | "yesterday" | "week" | "month" | "30days" | "custom">("all");
  const [customStartDate, setCustomStartDate] = React.useState<string>("");
  const [customEndDate, setCustomEndDate] = React.useState<string>("");

  // Pagination State for Scraped Cache
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<number>(25);

  // Live CMS Pagination & Search State
  const [livePage, setLivePage] = React.useState(1);
  const [livePageSize, setLivePageSize] = React.useState<number>(10);
  const [liveTotalPages, setLiveTotalPages] = React.useState(1);
  const [liveTotalResults, setLiveTotalResults] = React.useState(0);
  const [liveFrom, setLiveFrom] = React.useState(0);
  const [liveTo, setLiveTo] = React.useState(0);
  const [liveRecords, setLiveRecords] = React.useState<Record<string, string>[]>([]);
  const [liveHeaders, setLiveHeaders] = React.useState<string[]>([]);
  const [liveLoading, setLiveLoading] = React.useState(false);

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
    setLiveLoading(true);
    try {
      const res = await fetchLegacyCmsLivePageAction({ category: cat, page: pageNum, pageSize: s, search: searchQ });
      setLiveLoading(false);
      if (res.ok) {
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
  }, [category, dataSourceMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Robust Date extraction from any CMS / Filament record
  const extractDateFromRecord = (itemData: Record<string, any>): Date | null => {
    if (!itemData || typeof itemData !== "object") return null;

    // Scan prioritized keys (space-insensitive and casing-insensitive)
    for (const [k, v] of Object.entries(itemData)) {
      if (!v || typeof v === "object") continue;
      const cleanKey = k.toLowerCase().replace(/[\s_-]+/g, "");
      if (
        cleanKey === "createdat" ||
        cleanKey === "date" ||
        cleanKey === "invoicedate" ||
        cleanKey === "paymentdate" ||
        cleanKey === "startsat" ||
        cleanKey === "starts" ||
        cleanKey === "expiresat" ||
        cleanKey === "joinedat" ||
        cleanKey === "registeredat" ||
        cleanKey === "syncedat" ||
        cleanKey.includes("date") ||
        cleanKey.includes("created") ||
        cleanKey.includes("joined")
      ) {
        const strVal = String(v).trim();
        if (strVal.length >= 8) {
          const d = new Date(strVal.replace(" ", "T"));
          if (!isNaN(d.getTime())) return d;
        }
      }
    }

    // Secondary scan for any date-like string
    for (const v of Object.values(itemData)) {
      if (typeof v === "string" && /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(v.trim())) {
        const d = new Date(v.trim().replace(" ", "T"));
        if (!isNaN(d.getTime())) return d;
      }
    }

    return null;
  };

  // Date Filter evaluation helper
  const matchesDateFilter = (itemData: Record<string, any>) => {
    if (dateFilter === "all") return true;
    const d = extractDateFromRecord(itemData);
    if (!d) return false; // When an active date filter is selected, records without a valid date do not match!

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (dateFilter === "today") {
      return d >= todayStart && d <= todayEnd;
    }
    if (dateFilter === "yesterday") {
      const yestStart = new Date(todayStart.getTime() - 864e5);
      const yestEnd = new Date(todayStart.getTime() - 1);
      return d >= yestStart && d <= yestEnd;
    }
    if (dateFilter === "week") {
      const oneWeekAgo = new Date(todayEnd.getTime() - 7 * 864e5);
      return d >= oneWeekAgo && d <= todayEnd;
    }
    if (dateFilter === "month") {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return d >= monthStart && d <= todayEnd;
    }
    if (dateFilter === "30days") {
      const thirtyDaysAgo = new Date(todayEnd.getTime() - 30 * 864e5);
      return d >= thirtyDaysAgo && d <= todayEnd;
    }
    if (dateFilter === "custom") {
      if (customStartDate) {
        const start = new Date(`${customStartDate}T00:00:00`);
        if (!isNaN(start.getTime()) && d < start) return false;
      }
      if (customEndDate) {
        const end = new Date(`${customEndDate}T23:59:59.999`);
        if (!isNaN(end.getTime()) && d > end) return false;
      }
      return true;
    }
    return true;
  };

  // Filtered Scraped Records
  const filteredRecords = React.useMemo(() => {
    return records.filter((r) => {
      const data = r.data || {};
      const matchesSearch =
        !search ||
        r.title.toLowerCase().includes(search.toLowerCase()) ||
        r.externalId.toLowerCase().includes(search.toLowerCase()) ||
        JSON.stringify(data).toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter !== "all") {
        const rowStatus = String(data.Status || data.status || "").toLowerCase();
        if (rowStatus !== statusFilter.toLowerCase()) return false;
      }

      if (gradeFilter !== "all") {
        const rowGrade = String(data.Grade || data.grade || data.Grades || data.grades || "").toLowerCase();
        if (!rowGrade.includes(gradeFilter.toLowerCase())) return false;
      }

      if (!matchesDateFilter(data)) return false;

      return true;
    });
  }, [records, search, statusFilter, gradeFilter, dateFilter, customStartDate, customEndDate]);

  // Filtered Live Records (Enriched direct CMS live filtering)
  const filteredLiveRecords = React.useMemo(() => {
    return liveRecords.filter((r) => {
      // Status filter
      if (statusFilter !== "all") {
        const rowStatus = String(r.Status || r.status || r["Payment Status"] || r["Subscription Status"] || "").toLowerCase();
        if (rowStatus && !rowStatus.includes(statusFilter.toLowerCase())) return false;
      }
      // Grade filter
      if (gradeFilter !== "all") {
        const rowGrade = String(r.Grade || r.grade || r.Grades || r.grades || r.Plan || r.plan || "").toLowerCase();
        if (rowGrade && !rowGrade.includes(gradeFilter.toLowerCase())) return false;
      }
      // Date filter
      if (!matchesDateFilter(r)) return false;

      return true;
    });
  }, [liveRecords, statusFilter, gradeFilter, dateFilter, customStartDate, customEndDate]);

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
                      liveRecords.map((r) => liveHeaders.map((h) => r[h] || ""))
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
              pageSizeOptions={[10, 25, 50, 100, 250]}
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
                        <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                          No student-parent relationships match the filters.
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
                  <div
                    style={{
                      transform: `scale(${receiptZoom}) rotate(${receiptRotation}deg)`,
                      transformOrigin: "center center",
                      transition: "transform 0.15s ease-out",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeReceiptInvoice.imageUrl}
                      alt={`Receipt slip for invoice #${activeReceiptInvoice.id}`}
                      onLoad={(e) => scanQrCodeFromImage(e.currentTarget)}
                      crossOrigin="anonymous"
                      className="max-w-full rounded-lg shadow-md object-contain"
                    />
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
    </div>
  );
}
