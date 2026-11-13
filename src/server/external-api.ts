// External API Integration Console & Connector (Phase 28):
// Connects to external platforms (Student Academy, Finance Bank Receipts, SMS Gateway)
// enabling Customer Support agents to lookup parent phone numbers, Finance to view external
// revenue and approve/disapprove bank transfer receipts, and track SMS gateway health.

import { get, nowIso, parseJson, run } from "./db";
import { seal, unseal } from "./secrets";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

export type ExternalApiConfig = {
  academy: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
  finance: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
  sms: {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    senderId: string;
    timeoutMs: number;
  };
  iconicSms: IconicSmsConfig;
};

// i-Conic does not publish its API, so nothing about the request is guessed: the address, the send path, how the key
// is sent and the field names come from the i-Conic account's API page. Saving turns it into an SMS connection, so it
// is used by SMS routing, retries, fallback and the message log like any other provider.
export type IconicSmsConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  senderId: string;
  timeoutMs: number;
  sendPath: string;
  method: "POST" | "GET";
  format: "json" | "form" | "query";
  authStyle: "bearer" | "header" | "query";
  authName: string;
  toField: string;
  messageField: string;
  senderField: string;
  balancePath: string;
  balanceField: string;
};

const DEFAULT_CONFIG: ExternalApiConfig = {
  academy: {
    enabled: false,
    baseUrl: "https://academy.myseed.com.et/api/v1",
    apiKey: "",
    timeoutMs: 10000,
  },
  finance: {
    enabled: false,
    baseUrl: "https://academy.myseed.com.et/api/v1/finance",
    apiKey: "",
    timeoutMs: 10000,
  },
  sms: {
    enabled: false,
    baseUrl: "https://api.afromessage.com/api/v1",
    apiKey: "",
    senderId: "MySeed",
    timeoutMs: 10000,
  },
  iconicSms: {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    senderId: "MYSEED",
    timeoutMs: 10000,
    sendPath: "/send",
    method: "POST",
    format: "json",
    authStyle: "bearer",
    authName: "",
    toField: "to",
    messageField: "message",
    senderField: "from",
    balancePath: "",
    balanceField: "balance",
  },
};

type StoredConfig = {
  academy?: { enabled?: boolean; baseUrl?: string; apiKeyEnc?: string; timeoutMs?: number };
  finance?: { enabled?: boolean; baseUrl?: string; apiKeyEnc?: string; timeoutMs?: number };
  sms?: { enabled?: boolean; baseUrl?: string; apiKeyEnc?: string; senderId?: string; timeoutMs?: number };
  iconicSms?: { enabled?: boolean; baseUrl?: string; apiKeyEnc?: string; senderId?: string; timeoutMs?: number } & Partial<Omit<IconicSmsConfig, "enabled" | "baseUrl" | "apiKey" | "senderId" | "timeoutMs">>;
};

const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const field = (v: unknown, d: string) => String(v ?? d).trim().slice(0, 60);
const pathOf = (v: unknown, d: string) => {
  const p = String(v ?? d).trim().slice(0, 300);
  return !p || /^https?:\/\//i.test(p) || p.startsWith("/") ? p : `/${p}`;
};
// The request shape fields, cleaned (shared by reading and saving).
function iconicShape(x: Partial<IconicSmsConfig> | undefined) {
  const d = DEFAULT_CONFIG.iconicSms;
  return {
    sendPath: pathOf(x?.sendPath, d.sendPath) || d.sendPath,
    method: oneOf(String(x?.method ?? "").toUpperCase(), ["POST", "GET"] as const, d.method),
    format: oneOf(x?.format, ["json", "form", "query"] as const, d.format),
    authStyle: oneOf(x?.authStyle, ["bearer", "header", "query"] as const, d.authStyle),
    authName: field(x?.authName, ""),
    toField: field(x?.toField, d.toField) || d.toField,
    messageField: field(x?.messageField, d.messageField) || d.messageField,
    senderField: field(x?.senderField, d.senderField),
    balancePath: pathOf(x?.balancePath, ""),
    balanceField: field(x?.balanceField, d.balanceField),
  };
}
// The old default address (sms.iconic.et) never existed; a config still holding it counts as not set.
const realBase = (u: string | undefined) => (u && !/^https?:\/\/sms\.iconic\.et\b/i.test(u.trim()) ? u.trim().replace(/\/+$/, "") : "");

export async function getExternalApiConfig(): Promise<ExternalApiConfig> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.external_apis'");
  if (!row?.value) return DEFAULT_CONFIG;
  const stored = parseJson<StoredConfig>(row.value, {});

  return {
    academy: {
      enabled: !!stored.academy?.enabled,
      baseUrl: stored.academy?.baseUrl || DEFAULT_CONFIG.academy.baseUrl,
      apiKey: stored.academy?.apiKeyEnc ? ((await unseal(stored.academy.apiKeyEnc)) ?? "") : "",
      timeoutMs: Number(stored.academy?.timeoutMs || 10000),
    },
    finance: {
      enabled: !!stored.finance?.enabled,
      baseUrl: stored.finance?.baseUrl || DEFAULT_CONFIG.finance.baseUrl,
      apiKey: stored.finance?.apiKeyEnc ? ((await unseal(stored.finance.apiKeyEnc)) ?? "") : "",
      timeoutMs: Number(stored.finance?.timeoutMs || 10000),
    },
    sms: {
      enabled: !!stored.sms?.enabled,
      baseUrl: stored.sms?.baseUrl || DEFAULT_CONFIG.sms.baseUrl,
      apiKey: stored.sms?.apiKeyEnc ? ((await unseal(stored.sms.apiKeyEnc)) ?? "") : "",
      senderId: stored.sms?.senderId || DEFAULT_CONFIG.sms.senderId,
      timeoutMs: Number(stored.sms?.timeoutMs || 10000),
    },
    iconicSms: {
      enabled: !!stored.iconicSms?.enabled,
      baseUrl: realBase(stored.iconicSms?.baseUrl),
      apiKey: stored.iconicSms?.apiKeyEnc ? ((await unseal(stored.iconicSms.apiKeyEnc)) ?? "") : "",
      senderId: stored.iconicSms?.senderId || DEFAULT_CONFIG.iconicSms.senderId,
      timeoutMs: Number(stored.iconicSms?.timeoutMs || 10000),
      ...iconicShape(stored.iconicSms),
    },
  };
}

export async function saveExternalApiConfig(user: AppUser, input: Partial<ExternalApiConfig>) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin configures external APIs.");
  const cur = await getExternalApiConfig();
  const next: ExternalApiConfig = {
    academy: { ...cur.academy, ...(input.academy ?? {}) },
    finance: { ...cur.finance, ...(input.finance ?? {}) },
    sms: { ...cur.sms, ...(input.sms ?? {}) },
    iconicSms: { ...cur.iconicSms, ...(input.iconicSms ?? {}) },
  };

  const stored: StoredConfig = {
    academy: {
      enabled: next.academy.enabled,
      baseUrl: next.academy.baseUrl.trim(),
      apiKeyEnc: next.academy.apiKey ? await seal(next.academy.apiKey) : undefined,
      timeoutMs: next.academy.timeoutMs,
    },
    finance: {
      enabled: next.finance.enabled,
      baseUrl: next.finance.baseUrl.trim(),
      apiKeyEnc: next.finance.apiKey ? await seal(next.finance.apiKey) : undefined,
      timeoutMs: next.finance.timeoutMs,
    },
    sms: {
      enabled: next.sms.enabled,
      baseUrl: next.sms.baseUrl.trim(),
      apiKeyEnc: next.sms.apiKey ? await seal(next.sms.apiKey) : undefined,
      senderId: next.sms.senderId.trim(),
      timeoutMs: next.sms.timeoutMs,
    },
    iconicSms: {
      enabled: next.iconicSms.enabled,
      baseUrl: next.iconicSms.baseUrl.trim().replace(/\/+$/, ""),
      apiKeyEnc: next.iconicSms.apiKey ? await seal(next.iconicSms.apiKey) : undefined,
      senderId: next.iconicSms.senderId.trim(),
      timeoutMs: next.iconicSms.timeoutMs,
      ...iconicShape(next.iconicSms),
    },
  };
  if (next.iconicSms.enabled) {
    if (!/^https?:\/\/[^\s/]+/i.test(stored.iconicSms!.baseUrl ?? "")) throw new WorkflowError("VALIDATION", "Give i-Conic's API address from your i-Conic account (https://...).");
    if (!next.iconicSms.apiKey) throw new WorkflowError("VALIDATION", "Give the i-Conic API key or token.");
  }

  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.external_apis', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(stored),
    nowIso(),
    user.id,
  );

  await audit({ actor: user }, { action: "settings.external_api", summary: `${user.name} updated the external API integration console configuration` });
  await syncIconicConnector(user, { ...next.iconicSms, ...iconicShape(next.iconicSms), baseUrl: stored.iconicSms!.baseUrl ?? "" });
  return next;
}

// ---------------------------------------------------------------------------
// Health check / Connection test
// ---------------------------------------------------------------------------

export async function testExternalApi(service: "academy" | "finance" | "sms" | "iconicSms", phone?: string | null): Promise<{ ok: boolean; status: number; ms: number; message: string; responseSample?: unknown }> {
  const cfg = await getExternalApiConfig();
  if (service === "iconicSms") return testIconic(cfg.iconicSms, phone);
  const svc = cfg[service];
  if (!svc.baseUrl) {
    return { ok: false, status: 0, ms: 0, message: "Base URL is not set." };
  }

  const start = Date.now();
  try {
    const url = `${svc.baseUrl.replace(/\/+$/, "")}/health`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(svc.apiKey ? { Authorization: `Bearer ${svc.apiKey}`, "X-API-Key": svc.apiKey } : {}),
      },
      signal: AbortSignal.timeout(svc.timeoutMs || 8000),
    });
    const ms = Date.now() - start;
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // ignore
    }
    return {
      ok: res.ok,
      status: res.status,
      ms,
      message: res.ok ? "Connected successfully" : res.status === 404 ? `Not found (404) at ${url}: this service has no /health address; check the API address.` : `HTTP error: ${res.statusText || res.status}`,
      responseSample: json,
    };
  } catch (err: unknown) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, ms, message: `Could not reach ${svc.baseUrl} (${msg})` };
  }
}

// ---------------------------------------------------------------------------
// 1. Customer Support: Student & Parent lookup
// ---------------------------------------------------------------------------

export type ExternalStudent = {
  studentId: string;
  studentName: string;
  grade: string;
  parentName: string;
  parentPhone: string;
  secondaryPhone?: string | null;
  email?: string | null;
  enrollmentStatus: "active" | "inactive" | "pending";
  activeCourses?: string[];
  registeredAt?: string;
  note?: string | null;
};

export async function searchStudentParent(user: AppUser, query: string): Promise<ExternalStudent[]> {
  const q = query.trim();
  if (!q) return [];
  const cfg = await getExternalApiConfig();

  // If connected, fetch from external academy API
  if (cfg.academy.enabled && cfg.academy.baseUrl) {
    try {
      const url = `${cfg.academy.baseUrl.replace(/\/+$/, "")}/students/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(cfg.academy.apiKey ? { Authorization: `Bearer ${cfg.academy.apiKey}`, "X-API-Key": cfg.academy.apiKey } : {}),
        },
        signal: AbortSignal.timeout(cfg.academy.timeoutMs || 8000),
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.students ?? data?.data ?? []);
        return list.map((item: Record<string, unknown>) => ({
          studentId: String(item.studentId || item.id || ""),
          studentName: String(item.studentName || item.name || ""),
          grade: String(item.grade || ""),
          parentName: String(item.parentName || item.guardianName || "Parent"),
          parentPhone: String(item.parentPhone || item.phone || item.mobile || ""),
          secondaryPhone: item.secondaryPhone ? String(item.secondaryPhone) : null,
          email: item.email ? String(item.email) : null,
          enrollmentStatus: (item.enrollmentStatus || item.status || "active") as ExternalStudent["enrollmentStatus"],
          activeCourses: Array.isArray(item.activeCourses) ? (item.activeCourses as string[]) : [],
          registeredAt: item.registeredAt ? String(item.registeredAt) : undefined,
          note: item.note ? String(item.note) : null,
        }));
      }
    } catch (e) {
      console.error("External academy API fetch failed:", e);
    }
  }

  // Demo fallback / sample records for preview when not connected yet
  const DEMO_STUDENTS: ExternalStudent[] = [
    {
      studentId: "STU-1082",
      studentName: "Abebe Bikila",
      grade: "Grade 9",
      parentName: "Kassahun Bikila",
      parentPhone: "+251911223344",
      secondaryPhone: "+251922334455",
      email: "kassahun.b@example.com",
      enrollmentStatus: "active",
      activeCourses: ["Grade 9 Physics", "Grade 9 Mathematics", "Grade 9 English"],
      note: "Registered via CBE Birr manual transfer.",
    },
    {
      studentId: "STU-2041",
      studentName: "Selamawit Kebede",
      grade: "Grade 11",
      parentName: "Kebede Wolde",
      parentPhone: "+251933445566",
      enrollmentStatus: "active",
      activeCourses: ["Grade 11 Chemistry", "Grade 11 Biology"],
      note: "Annual subscription paid.",
    },
    {
      studentId: "STU-3094",
      studentName: "Natnael Tadesse",
      grade: "Grade 12",
      parentName: "Tadesse Mengistu",
      parentPhone: "+251944556677",
      enrollmentStatus: "pending",
      activeCourses: ["Grade 12 University Prep"],
      note: "Pending manual receipt verification.",
    },
  ];

  return DEMO_STUDENTS.filter(
    (s) =>
      s.studentName.toLowerCase().includes(q.toLowerCase()) ||
      s.studentId.toLowerCase().includes(q.toLowerCase()) ||
      s.parentPhone.includes(q) ||
      s.parentName.toLowerCase().includes(q.toLowerCase()),
  );
}

// ---------------------------------------------------------------------------
// 2. Finance: External Platform Revenue & Bank Receipts
// ---------------------------------------------------------------------------

export type ExternalRevenueSummary = {
  currency: string;
  totalRevenue: number;
  thisMonthRevenue: number;
  todayRevenue: number;
  successfulPaymentsCount: number;
  pendingReceiptsCount: number;
  lastSyncedAt: string;
};

export type ExternalReceipt = {
  id: string;
  studentId: string;
  studentName: string;
  grade?: string;
  parentPhone?: string;
  bankName: string;
  accountNumber?: string;
  referenceNumber: string;
  amount: number;
  currency: string;
  receiptUrl: string;
  submittedAt: string;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string | null;
};

export async function fetchExternalRevenue(user: AppUser): Promise<ExternalRevenueSummary> {
  const cfg = await getExternalApiConfig();
  if (cfg.finance.enabled && cfg.finance.baseUrl) {
    try {
      const url = `${cfg.finance.baseUrl.replace(/\/+$/, "")}/revenue-summary`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(cfg.finance.apiKey ? { Authorization: `Bearer ${cfg.finance.apiKey}`, "X-API-Key": cfg.finance.apiKey } : {}),
        },
        signal: AbortSignal.timeout(cfg.finance.timeoutMs || 8000),
      });
      if (res.ok) {
        const d = await res.json();
        return {
          currency: String(d.currency || "ETB"),
          totalRevenue: Number(d.totalRevenue || 0),
          thisMonthRevenue: Number(d.thisMonthRevenue || 0),
          todayRevenue: Number(d.todayRevenue || 0),
          successfulPaymentsCount: Number(d.successfulPaymentsCount || 0),
          pendingReceiptsCount: Number(d.pendingReceiptsCount || 0),
          lastSyncedAt: nowIso(),
        };
      }
    } catch (e) {
      console.error("External revenue API fetch failed:", e);
    }
  }

  // Default baseline demo stats when waiting for remote deployment
  return {
    currency: "ETB",
    totalRevenue: 284500,
    thisMonthRevenue: 64200,
    todayRevenue: 4800,
    successfulPaymentsCount: 312,
    pendingReceiptsCount: 2,
    lastSyncedAt: nowIso(),
  };
}

export async function listExternalReceipts(user: AppUser, status: "pending" | "approved" | "rejected" = "pending"): Promise<ExternalReceipt[]> {
  const cfg = await getExternalApiConfig();
  if (cfg.finance.enabled && cfg.finance.baseUrl) {
    try {
      const url = `${cfg.finance.baseUrl.replace(/\/+$/, "")}/receipts?status=${status}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(cfg.finance.apiKey ? { Authorization: `Bearer ${cfg.finance.apiKey}`, "X-API-Key": cfg.finance.apiKey } : {}),
        },
        signal: AbortSignal.timeout(cfg.finance.timeoutMs || 8000),
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data?.receipts ?? data?.data ?? []);
        return list.map((item: Record<string, unknown>) => ({
          id: String(item.id || ""),
          studentId: String(item.studentId || ""),
          studentName: String(item.studentName || "Student"),
          grade: item.grade ? String(item.grade) : undefined,
          parentPhone: item.parentPhone ? String(item.parentPhone) : undefined,
          bankName: String(item.bankName || "Commercial Bank of Ethiopia"),
          accountNumber: item.accountNumber ? String(item.accountNumber) : undefined,
          referenceNumber: String(item.referenceNumber || item.txRef || ""),
          amount: Number(item.amount || 0),
          currency: String(item.currency || "ETB"),
          receiptUrl: String(item.receiptUrl || item.imageUrl || "/sample-receipt.png"),
          submittedAt: String(item.submittedAt || nowIso()),
          status: (item.status || "pending") as ExternalReceipt["status"],
          rejectionReason: item.rejectionReason ? String(item.rejectionReason) : null,
        }));
      }
    } catch (e) {
      console.error("External receipts API fetch failed:", e);
    }
  }

  // Demo receipts when not yet connected
  const DEMO_RECEIPTS: ExternalReceipt[] = [
    {
      id: "rcpt_cbe_901",
      studentId: "STU-3094",
      studentName: "Natnael Tadesse",
      grade: "Grade 12",
      parentPhone: "+251944556677",
      bankName: "Commercial Bank of Ethiopia (CBE)",
      referenceNumber: "FT263109X719",
      amount: 1500,
      currency: "ETB",
      receiptUrl: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&q=80&w=800",
      submittedAt: new Date(Date.now() - 3600000).toISOString(),
      status: "pending",
    },
    {
      id: "rcpt_telebirr_402",
      studentId: "STU-1082",
      studentName: "Abebe Bikila",
      grade: "Grade 9",
      parentPhone: "+251911223344",
      bankName: "telebirr SuperApp Transfer",
      referenceNumber: "TEL88471920",
      amount: 1200,
      currency: "ETB",
      receiptUrl: "https://images.unsplash.com/photo-1554224154-26032ffc0d07?auto=format&fit=crop&q=80&w=800",
      submittedAt: new Date(Date.now() - 7200000).toISOString(),
      status: "pending",
    },
  ];

  return DEMO_RECEIPTS.filter((r) => r.status === status);
}

export async function reviewExternalReceipt(user: AppUser, receiptId: string, decision: "approve" | "reject", reason?: string) {
  if (!can(user, "finance.access")) throw new WorkflowError("FORBIDDEN", "Only Finance can review payment receipts.");
  const cfg = await getExternalApiConfig();

  if (cfg.finance.enabled && cfg.finance.baseUrl) {
    const url = `${cfg.finance.baseUrl.replace(/\/+$/, "")}/receipts/${receiptId}/review`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(cfg.finance.apiKey ? { Authorization: `Bearer ${cfg.finance.apiKey}`, "X-API-Key": cfg.finance.apiKey } : {}),
      },
      body: JSON.stringify({
        decision,
        reason: reason?.trim() || null,
        reviewerId: user.id,
        reviewerName: user.name,
        reviewedAt: nowIso(),
      }),
      signal: AbortSignal.timeout(cfg.finance.timeoutMs || 8000),
    });

    if (!res.ok) {
      throw new WorkflowError("INVALID_STATE", `External API rejected the review: ${res.statusText || res.status}`);
    }
  }

  await audit({ actor: user }, {
    action: "finance.receipt_review",
    summary: `${user.name} ${decision === "approve" ? "approved" : "rejected"} external receipt ${receiptId}${reason ? ` (${reason})` : ""}`,
  });

  return { ok: true, receiptId, decision };
}

// ---------------------------------------------------------------------------
// 3. SMS Gateway Status
// ---------------------------------------------------------------------------

export type ExternalSmsStatus = {
  connected: boolean;
  provider: string;
  balance: number;
  currency: string;
  senderId: string;
  lastCheckedAt: string;
};

export async function fetchSmsStatus(): Promise<ExternalSmsStatus> {
  const cfg = await getExternalApiConfig();
  if (cfg.sms.enabled && cfg.sms.baseUrl) {
    try {
      const url = `${cfg.sms.baseUrl.replace(/\/+$/, "")}/status`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...(cfg.sms.apiKey ? { Authorization: `Bearer ${cfg.sms.apiKey}`, "X-API-Key": cfg.sms.apiKey } : {}),
        },
        signal: AbortSignal.timeout(cfg.sms.timeoutMs || 8000),
      });

      if (res.ok) {
        const d = await res.json();
        return {
          connected: true,
          provider: String(d.provider || "AfroMessage / Ethio Telecom SMS"),
          balance: Number(d.balance || 0),
          currency: String(d.currency || "SMS Credits"),
          senderId: cfg.sms.senderId,
          lastCheckedAt: nowIso(),
        };
      }
    } catch (e) {
      console.error("External SMS API status failed:", e);
    }
  }

  // No made-up balance: say it could not be read.
  throw new WorkflowError("INVALID_STATE", cfg.sms.enabled ? "The SMS gateway's status could not be read. Check its address and key." : "The SMS gateway is switched off.");
}

export async function fetchIconicSmsStatus(): Promise<ExternalSmsStatus> {
  const c = (await getExternalApiConfig()).iconicSms;
  if (!c.enabled || !c.baseUrl) throw new WorkflowError("INVALID_STATE", "i-Conic SMS is not set up: give its API address and key and switch it on.");
  if (!c.balancePath) throw new WorkflowError("VALIDATION", "Give the balance path from i-Conic's API page to check the balance.");
  const r = await iconicRequest(c, "GET", c.balancePath, {});
  if (!r.ok) throw new WorkflowError("INVALID_STATE", r.message);
  const raw = pickPath(r.body, c.balanceField || "balance");
  const balance = Number(raw);
  if (raw === undefined || raw === null || Number.isNaN(balance)) throw new WorkflowError("INVALID_STATE", `i-Conic answered, but "${c.balanceField}" is not a number in its answer. Set the balance field to the right name.`);
  return { connected: true, provider: "i-Conic SMS", balance, currency: "SMS credits", senderId: c.senderId, lastCheckedAt: nowIso() };
}

// ---------------------------------------------------------------------------
// i-Conic SMS
// ---------------------------------------------------------------------------

function pickPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".").filter(Boolean)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
const isUrl = (p: string) => p.startsWith("http://") || p.startsWith("https://");
const iconicAddress = (c: IconicSmsConfig, path: string) => (/^https?:\/\//i.test(path) ? path : `${c.baseUrl}${path}`);

// One request to i-Conic with the key sent the way Admin chose. The message says what went wrong in plain words; the
// address in it never includes the query (which may hold the key).
async function iconicRequest(c: IconicSmsConfig, method: string, path: string, data: Record<string, string>) {
  const address = iconicAddress(c, path);
  const t0 = Date.now();
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return { ok: false, status: 0, ms: 0, message: `"${address}" is not a web address. Check the API address and path.`, body: null as unknown };
  }
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "Myseed/1.0" };
  if (c.authStyle === "bearer") headers.Authorization = `Bearer ${c.apiKey}`;
  else if (c.authStyle === "header") headers[c.authName || "KEY"] = c.apiKey;
  else url.searchParams.set(c.authName || "token", c.apiKey);
  let body: string | undefined;
  if (method === "GET" || c.format === "query") for (const [k, v] of Object.entries(data)) url.searchParams.set(k, v);
  else if (c.format === "form") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(data).toString();
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(data);
  }
  try {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(c.timeoutMs || 10000) });
    const text = await res.text();
    let parsed: unknown = text.slice(0, 1500);
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // not JSON
    }
    const ms = Date.now() - t0;
    const said = String(pickPath(parsed, "message") ?? pickPath(parsed, "error.message") ?? pickPath(parsed, "error") ?? "").slice(0, 200);
    const where = `${method} ${address.split("?")[0]}`;
    const message = res.ok
      ? "i-Conic accepted the request."
      : res.status === 404
        ? `Not found (404) at ${where}. This path does not exist on i-Conic: copy the exact path from your i-Conic API page.`
        : res.status === 401 || res.status === 403
          ? `i-Conic refused the key (${res.status}) at ${where}. Check the key and how it is sent (Bearer, a header or the address).${said ? ` (${said})` : ""}`
          : res.status === 405
            ? `i-Conic does not accept ${method} at ${where} (405). Switch the method.`
            : `i-Conic answered ${res.status} at ${where}.${said ? ` ${said}` : ""}`;
    const { recordCall } = await import("./call-monitor");
    await recordCall({ source: "sms", connectorId: null, ok: res.ok, status: res.status, ms, summary: `i-Conic SMS · ${where}`, error: res.ok ? null : message, ref: null, test: true });
    return { ok: res.ok, status: res.status, ms, message, body: parsed };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t0, message: `Could not reach ${url.origin} (${e instanceof Error ? e.message : String(e)}). Check the API address.`, body: null as unknown };
  }
}

// The test: a real test SMS to the phone Admin types (sent through the SMS module, so it is logged and retried like
// any other); without a phone, the balance address when there is one (sends nothing).
async function testIconic(c: IconicSmsConfig, phone?: string | null) {
  if (!c.baseUrl) return { ok: false, status: 0, ms: 0, message: "Give i-Conic's API address from your i-Conic account." };
  if (!c.apiKey) return { ok: false, status: 0, ms: 0, message: "Give the i-Conic API key or token." };
  if (phone?.trim()) {
    const t0 = Date.now();
    const id = await iconicConnectorId();
    if (!id || !c.enabled) return { ok: false, status: 0, ms: 0, message: "Switch i-Conic on and save first." };
    try {
      const { sendSmsMessage } = await import("./sms");
      const r = await sendSmsMessage({ to: phone, message: "Test SMS from Myseed: i-Conic is connected.", purpose: "alerts", only: id });
      return { ok: true, status: 200, ms: Date.now() - t0, message: `Test SMS sent through i-Conic (${r.attempts} ${r.attempts === 1 ? "try" : "tries"}).` };
    } catch (e) {
      return { ok: false, status: 0, ms: Date.now() - t0, message: e instanceof Error ? e.message : String(e) };
    }
  }
  if (!c.balancePath) return { ok: false, status: 0, ms: 0, message: "Type a phone number to send a test SMS, or give the balance path to test without sending." };
  const r = await iconicRequest(c, "GET", c.balancePath, {});
  return { ok: r.ok, status: r.status, ms: r.ms, message: r.ok ? "Connected: i-Conic answered the balance request." : r.message, responseSample: r.body };
}

export async function iconicConnectorId() {
  return (await get<{ id: string }>("SELECT id FROM int_connectors WHERE capability = 'sms' AND draft LIKE ? ORDER BY created_at LIMIT 1", '%"preset":"iconic"%'))?.id ?? null;
}

// Keep the i-Conic SMS connection in step with this card: active with the request shape when switched on, a draft when off.
async function syncIconicConnector(user: AppUser, c: IconicSmsConfig) {
  const { saveConnector } = await import("./connectors");
  const id = await iconicConnectorId();
  if (!c.enabled && !id) return;
  if (!c.baseUrl) {
    if (id) await run("UPDATE int_connectors SET status = 'draft' WHERE id = ?", id);
    return;
  }
  const map: Record<string, string> = { [c.toField]: "{{to}}", [c.messageField]: "{{message}}" };
  if (c.senderField) map[c.senderField] = "{{sender|secret.sender}}";
  await saveConnector(user, {
    id,
    name: "i-Conic SMS",
    capability: "sms",
    baseUrl: isUrl(c.sendPath) ? new URL(c.sendPath).origin : c.baseUrl,
    auth: c.authStyle === "bearer" ? { kind: "bearer" } : c.authStyle === "header" ? { kind: "header", name: c.authName || "KEY" } : { kind: "query", name: c.authName || "token" },
    operation: { method: c.method, path: isUrl(c.sendPath) ? `${new URL(c.sendPath).pathname}${new URL(c.sendPath).search}` : c.sendPath, contentType: c.format === "query" ? "none" : c.format, map, headers: { Accept: "application/json" } },
    response: { idPath: "id|message_id|messageId|data.id|data.message_id|response.message_id|response.id", errorPath: "message|error.message|error|errors.0.message|msg|response.errors.0" },
    docsUrl: null,
    specUrl: null,
    preset: "iconic",
    status: c.enabled ? "active" : "draft",
    secrets: { token: c.apiKey, sender: c.senderId },
  });
}
