"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
} from "@/app/actions/legacy-cms";
import type {
  LegacyCmsCategory,
  LegacyCmsConfig,
  LegacyCmsRecord,
  CmsRoleVisibility,
} from "@/server/legacy-cms";
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
}) {
  const router = useRouter();
  const [category, setCategory] = React.useState<LegacyCmsCategory>(initialCategory);
  const [records, setRecords] = React.useState(initialRecords.rows);
  const [total, setTotal] = React.useState(initialRecords.total);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [loading, setLoading] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<LegacyCmsRecord | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [roleVisibility, setRoleVisibility] = React.useState<CmsRoleVisibility>(
    visibility || {
      admin: ["students", "parents", "subscription-plans", "subscription-histories", "invoices", "subscriptions"],
      support: ["students", "parents", "subscriptions", "subscription-plans"],
      finance: ["invoices", "subscription-plans", "subscription-histories", "subscriptions"],
    }
  );

  // Settings form
  const [cfg, setCfg] = React.useState({
    baseUrl: config.baseUrl || "https://cms.noorethiopia.com",
    username: config.username || "ops@myseed.com",
    password: "",
    sessionCookie: "",
    autoSync: config.autoSync,
    syncIntervalMinutes: config.syncIntervalMinutes,
  });

  const fetchCategoryData = async (cat: LegacyCmsCategory, query = search) => {
    setLoading(true);
    const res = await listLegacyCmsRecordsAction(cat, { q: query, limit: 100 });
    setLoading(false);
    if (res.ok) {
      setRecords(res.data.rows);
      setTotal(res.data.total);
    } else {
      toast.error(res.error || "Failed to load data");
    }
  };

  const handleTabChange = (val: string) => {
    const nextCat = val as LegacyCmsCategory;
    setCategory(nextCat);
    fetchCategoryData(nextCat, search);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    fetchCategoryData(category, val);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    const res = await syncLegacyCmsAction({ force: true });
    setSyncing(false);
    if (res.ok) {
      toast.success(res.message || "Synced successfully from Noor Ethiopia CMS");
      await fetchCategoryData(category, search);
      router.refresh();
    } else {
      toast.error(res.error || "Sync failed");
    }
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    const res = await saveLegacyCmsConfigAction({
      baseUrl: cfg.baseUrl,
      username: cfg.username,
      password: cfg.password ? cfg.password : undefined,
      sessionCookie: cfg.sessionCookie ? cfg.sessionCookie : undefined,
      autoSync: cfg.autoSync,
      syncIntervalMinutes: cfg.syncIntervalMinutes,
    });
    if (res.ok) {
      await saveCmsRoleVisibilityAction(roleVisibility);
      toast.success("Legacy CMS credentials and role visibility settings saved");
      setSettingsOpen(false);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to save settings");
    }
    setLoading(false);
  };

  const handleClearCmsData = async () => {
    if (!confirm("Are you sure you want to clear all synced Noor Ethiopia CMS records? This will delete all cached records and leave the tables empty.")) return;
    setLoading(true);
    const res = await clearLegacyCmsDataAction();
    setLoading(false);
    if (res.ok) {
      toast.success("All Legacy CMS records cleared successfully");
      setRecords([]);
      setTotal(0);
      router.refresh();
    } else {
      toast.error(res.error || "Failed to clear records");
    }
  };

  const copyText = (txt: string, key: string) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    toast.success(`Copied: ${txt}`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const exportData = (format: "csv" | "json") => {
    if (records.length === 0) return toast.error("No data to export");
    const filename = `noor-cms-${category}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "json") {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records.map((r) => r.data), null, 2));
      const el = document.createElement("a");
      el.setAttribute("href", dataStr);
      el.setAttribute("download", `${filename}.json`);
      document.body.appendChild(el);
      el.click();
      el.remove();
      toast.success("Exported JSON");
    } else {
      // CSV
      const keys = Array.from(new Set(records.flatMap((r) => Object.keys(r.data))));
      const csvRows = [
        keys.join(","),
        ...records.map((r) =>
          keys
            .map((k) => {
              const val = String(r.data[k] ?? "");
              return `"${val.replace(/"/g, '""')}"`;
            })
            .join(",")
        ),
      ];
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.setAttribute("href", url);
      el.setAttribute("download", `${filename}.csv`);
      document.body.appendChild(el);
      el.click();
      el.remove();
      toast.success("Exported CSV");
    }
  };

  // Filtered by status if selected
  const filteredRecords = React.useMemo(() => {
    if (statusFilter === "all") return records;
    return records.filter((r) => {
      const st = String(r.data.status || r.data.Status || "").toLowerCase();
      return st.includes(statusFilter.toLowerCase());
    });
  }, [records, statusFilter]);

  // Dynamic columns for current table
  const columns = React.useMemo(() => {
    if (records.length === 0) return [];
    const firstKeys = Object.keys(records[0].data);
    return firstKeys.slice(0, 7);
  }, [records]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Deck */}
      <Card className="border-border bg-card">
        <CardHeader className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl font-bold tracking-tight">
                Noor Ethiopia CMS (Legacy)
              </CardTitle>
              <Badge variant="outline" className="border-[#9334E6]/30 text-[#9334E6] dark:text-[#C58AF9]">
                Live Sync
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Synchronized mirror of <code className="font-mono text-foreground font-semibold">https://cms.noorethiopia.com</code> with auto-scrape and search.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-xs">
              <ClockIcon className="size-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Last synced:</span>
              <span className="font-medium text-foreground">
                {config.lastSyncedAt ? new Date(config.lastSyncedAt).toLocaleString() : "Recently"}
              </span>
            </div>

            {isAdmin ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearCmsData}
                  disabled={loading}
                  className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                >
                  <Trash2Icon className="size-3.5" />
                  Clear All Data
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsOpen(true)}
                  className="gap-1.5 text-xs"
                >
                  <Settings2Icon className="size-3.5" />
                  Login & Sync Settings
                </Button>

                <Button
                  size="sm"
                  onClick={handleSyncNow}
                  disabled={syncing}
                  className="gap-1.5 bg-[#00522B] text-white hover:bg-[#003d20] text-xs font-semibold"
                >
                  <RefreshCwIcon className={cn("size-3.5", syncing && "animate-spin")} />
                  {syncing ? "Scraping CMS..." : "Sync Now"}
                </Button>
              </>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Read-Only (Support & Finance)
              </Badge>
            )}
          </div>
        </CardHeader>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-5 sm:divide-y-0">
          <div className="p-3 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Students</p>
            <p className="text-lg font-bold text-foreground">{stats.studentsCount}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Parents</p>
            <p className="text-lg font-bold text-foreground">{stats.parentsCount}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Active Subscriptions</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.activeSubscriptionsCount}</p>
          </div>
          <div className="p-3 text-center">
            <p className="text-[11px] font-medium text-muted-foreground">Plans</p>
            <p className="text-lg font-bold text-foreground">{stats.plansCount}</p>
          </div>
          <div className="col-span-2 p-3 text-center sm:col-span-1">
            <p className="text-[11px] font-medium text-muted-foreground">Invoices</p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.invoicesCount}</p>
          </div>
        </div>
      </Card>

      {/* Main Tabs & Table View */}
      <Tabs value={category} onValueChange={handleTabChange} className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList className="h-10 p-1 flex-wrap">
            {allowedCategories.includes("students") && (
              <TabsTrigger value="students" className="gap-1.5 text-xs font-medium">
                <GraduationCapIcon className="size-3.5" /> Students
              </TabsTrigger>
            )}
            {allowedCategories.includes("parents") && (
              <TabsTrigger value="parents" className="gap-1.5 text-xs font-medium">
                <UsersIcon className="size-3.5" /> Parents
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscriptions") && (
              <TabsTrigger value="subscriptions" className="gap-1.5 text-xs font-medium">
                <CreditCardIcon className="size-3.5" /> Subscriptions
              </TabsTrigger>
            )}
            {allowedCategories.includes("invoices") && (
              <TabsTrigger value="invoices" className="gap-1.5 text-xs font-medium">
                <FileTextIcon className="size-3.5" /> Invoices
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscription-plans") && (
              <TabsTrigger value="subscription-plans" className="gap-1.5 text-xs font-medium">
                <SparklesIcon className="size-3.5" /> Plans
              </TabsTrigger>
            )}
            {allowedCategories.includes("subscription-histories") && (
              <TabsTrigger value="subscription-histories" className="gap-1.5 text-xs font-medium">
                <HistoryIcon className="size-3.5" /> Histories
              </TabsTrigger>
            )}
          </TabsList>

          {/* Search & Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1 sm:w-64">
              <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${category}...`}
                value={search}
                onChange={handleSearchChange}
                className="h-9 pl-8 text-xs"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                  <DownloadIcon className="size-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportData("csv")}>
                  Export as CSV (.csv)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportData("json")}>
                  Export as JSON (.json)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Content Body */}
        <Card className="overflow-hidden border-border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-12 text-xs">#</TableHead>
                  <TableHead className="text-xs">Record Identifier</TableHead>
                  {columns.map((c) => (
                    <TableHead key={c} className="text-xs uppercase tracking-wider">
                      {c.replace(/_/g, " ")}
                    </TableHead>
                  ))}
                  <TableHead className="text-right text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 3} className="h-32 text-center text-xs text-muted-foreground">
                      <RefreshCwIcon className="mx-auto size-5 animate-spin text-primary mb-2" />
                      Loading records...
                    </TableCell>
                  </TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length + 3} className="h-32 text-center text-xs text-muted-foreground">
                      No records found for "{search}". Try searching or click "Sync Now".
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((r, idx) => {
                    const phone = String(r.data.phone || r.data.parent_phone || r.data.Parent_Phone || "");
                    const status = String(r.data.status || r.data.Status || "");
                    const isPaid = /active|paid|verified/i.test(status);
                    const isPending = /pending|awaiting/i.test(status);

                    return (
                      <TableRow key={r.id} className="hover:bg-muted/40 text-xs">
                        <TableCell className="font-mono text-muted-foreground text-[11px]">{idx + 1}</TableCell>
                        <TableCell className="font-semibold text-foreground">
                          {r.title}
                          <div className="font-mono text-[10px] text-muted-foreground">{r.externalId}</div>
                        </TableCell>

                        {columns.map((col) => {
                          const val = String(r.data[col] ?? "—");
                          const isStatusCol = /status/i.test(col);
                          return (
                            <TableCell key={col}>
                              {isStatusCol ? (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "text-[10px] font-semibold",
                                    isPaid && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                    isPending && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                    !isPaid && !isPending && "bg-muted text-muted-foreground"
                                  )}
                                >
                                  {val}
                                </Badge>
                              ) : (
                                <span className="max-w-[200px] truncate block" title={val}>
                                  {val}
                                </span>
                              )}
                            </TableCell>
                          );
                        })}

                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {phone && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                title={`Call Parent: ${phone}`}
                                asChild
                              >
                                <a href={`tel:${phone}`}>
                                  <PhoneCallIcon className="size-3.5" />
                                </a>
                              </Button>
                            )}

                            {phone && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                title="Copy Phone Number"
                                onClick={() => copyText(phone, `phone-${r.id}`)}
                              >
                                {copiedKey === `phone-${r.id}` ? (
                                  <CheckIcon className="size-3.5 text-emerald-600" />
                                ) : (
                                  <CopyIcon className="size-3.5" />
                                )}
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              title="View Raw Data"
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
            <span>Showing {filteredRecords.length} of {total} records</span>
            <span className="font-mono text-[11px]">Source: {config.baseUrl}{CATEGORY_PATHS[category] || "/admin"}</span>
          </div>
        </Card>
      </Tabs>

      {/* Record Inspector Modal */}
      <Dialog open={!!selectedRecord} onOpenChange={(o) => !o && setSelectedRecord(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <DatabaseIcon className="size-4 text-primary" /> {selectedRecord?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              External ID: <code className="font-mono text-foreground font-semibold">{selectedRecord?.externalId}</code> | Category: {selectedRecord?.category}
            </DialogDescription>
          </DialogHeader>

          {selectedRecord && (
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-md border bg-muted/30 p-3 text-xs">
              {Object.entries(selectedRecord.data).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">{k.replace(/_/g, " ")}:</span>
                  <span className="font-medium text-foreground text-right">{String(v)}</span>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSelectedRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings & Credentials Modal */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <LockIcon className="size-4 text-primary" /> Noor Ethiopia CMS Settings
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure scraping credentials and background sync for <code className="text-foreground">https://cms.noorethiopia.com</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div className="space-y-1">
              <Label htmlFor="base-url">CMS Base URL</Label>
              <Input
                id="base-url"
                value={cfg.baseUrl}
                onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })}
                placeholder="https://cms.noorethiopia.com"
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="cms-user">Username / Email</Label>
                <Input
                  id="cms-user"
                  value={cfg.username}
                  onChange={(e) => setCfg({ ...cfg, username: e.target.value })}
                  placeholder="admin@noorethiopia.com"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cms-pass">Password</Label>
                <Input
                  id="cms-pass"
                  type="password"
                  value={cfg.password}
                  onChange={(e) => setCfg({ ...cfg, password: e.target.value })}
                  placeholder={config.hasPassword ? "•••••••• (Saved)" : "CMS password"}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cms-cookie">Session Cookie (Optional / Bypass 2FA or Captcha)</Label>
              <Input
                id="cms-cookie"
                type="password"
                value={cfg.sessionCookie}
                onChange={(e) => setCfg({ ...cfg, sessionCookie: e.target.value })}
                placeholder={config.hasSessionCookie ? "•••••••• (Cookie active)" : "e.g. remember_web_... or session=..."}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                If the CMS requires browser 2FA, paste the session cookie from your browser once to scrape directly.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-2.5">
              <div className="space-y-0.5">
                <Label htmlFor="auto-sync" className="cursor-pointer">Automatic Background Sync</Label>
                <p className="text-[11px] text-muted-foreground">Periodically syncs new students and invoices.</p>
              </div>
              <Switch
                id="auto-sync"
                checked={cfg.autoSync}
                onCheckedChange={(val) => setCfg({ ...cfg, autoSync: val })}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="sync-interval">Sync Interval (Minutes)</Label>
              <Input
                id="sync-interval"
                type="number"
                min={5}
                max={1440}
                value={cfg.syncIntervalMinutes}
                onChange={(e) => setCfg({ ...cfg, syncIntervalMinutes: Number(e.target.value) })}
                className="h-8 text-xs"
              />
            </div>

            {/* Category Visibility for Non-Admins */}
            <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
              <p className="font-semibold text-foreground text-xs">Role Visibility (Control what Support & Finance can see)</p>
              <div className="space-y-3 pt-1">
                <div>
                  <p className="text-[11px] text-muted-foreground font-medium pb-1">Customer Support sees:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["students", "parents", "subscriptions", "subscription-plans", "invoices", "subscription-histories"] as LegacyCmsCategory[]).map((cat) => {
                      const enabled = (roleVisibility.support || []).includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            const cur = roleVisibility.support || [];
                            const next = enabled ? cur.filter((x) => x !== cat) : [...cur, cat];
                            setRoleVisibility({ ...roleVisibility, support: next });
                          }}
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                            enabled ? "bg-primary text-primary-foreground font-medium" : "bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-muted-foreground font-medium pb-1">Finance sees:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(["invoices", "subscriptions", "subscription-plans", "subscription-histories", "students", "parents"] as LegacyCmsCategory[]).map((cat) => {
                      const enabled = (roleVisibility.finance || []).includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            const cur = roleVisibility.finance || [];
                            const next = enabled ? cur.filter((x) => x !== cat) : [...cur, cat];
                            setRoleVisibility({ ...roleVisibility, finance: next });
                          }}
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                            enabled ? "bg-primary text-primary-foreground font-medium" : "bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveSettings} disabled={loading}>
              Save Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

