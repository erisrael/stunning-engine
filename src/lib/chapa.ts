// Chapa for every business (Update 1.0, Phase 3): names shared by the server and the pages.

export const CHAPA_STATUSES = [
  ["success", "Success"],
  ["pending", "Pending"],
  ["failed", "Failed / cancelled"],
  ["refunded", "Refunded"],
  ["reversed", "Reversed"],
] as const;
export type ChapaStatus = (typeof CHAPA_STATUSES)[number][0];
export const CHAPA_STATUS_LABEL = Object.fromEntries(CHAPA_STATUSES) as Record<ChapaStatus, string>;

export function normalizeChapaStatus(v: unknown): ChapaStatus {
  const s = String(v ?? "").toLowerCase();
  if (/success|paid|complete/.test(s)) return "success";
  if (/refund/.test(s)) return "refunded";
  if (/revers/.test(s)) return "reversed";
  if (/fail|cancel|declin|expire|error/.test(s)) return "failed";
  return "pending";
}

export const CHAPA_TYPES = [
  ["payment_link", "Payment link"],
  ["api", "API"],
  ["b2b", "B2B"],
  ["funding", "Funding"],
  ["exchange", "Exchange"],
  ["donation", "Donation"],
  ["event", "Event"],
  ["telegram", "Telegram"],
  ["qr", "QR"],
  ["direct_charge", "Direct charge"],
] as const;
export function normalizeChapaType(v: unknown): string {
  const s = String(v ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return "api";
  const hit = CHAPA_TYPES.find(([k, l]) => s === k || s.includes(k) || s === l.toLowerCase().replace(/\s+/g, "_"));
  if (hit) return hit[0];
  if (/link/.test(s)) return "payment_link";
  if (/direct/.test(s)) return "direct_charge";
  if (/fund|top/.test(s)) return "funding";
  if (/swap|exchang/.test(s)) return "exchange";
  return s.slice(0, 40);
}
export const chapaTypeLabel = (t: string) => CHAPA_TYPES.find(([k]) => k === t)?.[1] ?? t.replace(/_/g, " ");

export const CHAPA_METHODS = ["telebirr", "cbebirr", "mpesa", "awash_birr", "amole", "ebirr", "kaafi", "coopay", "card", "bank", "paypal"] as const;
export const chapaMethodLabel = (m: string | null | undefined) => {
  const s = String(m ?? "").toLowerCase();
  if (!s) return "Unknown";
  if (s.includes("tele")) return "telebirr";
  if (s.includes("cbe")) return "CBE Birr";
  if (s.includes("pesa")) return "M-PESA";
  if (s.includes("awash")) return "Awash Birr";
  if (s.includes("card") || s.includes("visa") || s.includes("master")) return "Card";
  return s.replace(/_/g, " ");
};

// What Admin can switch on or off per business and role.
export const CHAPA_ACTIONS = [
  ["view", "View pages and data", false],
  ["export", "Export CSV, Excel and PDF", false],
  ["verify", "Re-verify a payment with Chapa", false],
  ["send_support", "Send follow-ups to Support", false],
  ["auto_followup", "Send follow-ups automatically", false],
  ["refund", "Refund a payment", true],
  ["transfer", "Withdraw to a bank or wallet", true],
  ["bulk_transfer", "Bulk withdrawals", true],
  ["swap", "Swap USD to ETB", true],
] as const;
export type ChapaAction = (typeof CHAPA_ACTIONS)[number][0];
export const MONEY_ACTIONS: ChapaAction[] = ["refund", "transfer", "bulk_transfer", "swap"];

export type ChapaActionRule = { enabled: boolean; roles: string[]; limit?: number | null; dailyCap?: number | null; secondApprover?: boolean };
// The Overview's widgets (Update 1.0 Phase 8), in their default order. Each person picks and arranges them; Admin
// sets the order for everyone who has not.
export const CHAPA_WIDGETS = [
  ["sync", "Sync status of each business"],
  ["today", "Today"],
  ["d7", "Last 7 days"],
  ["d30", "Last 30 days"],
  ["daily", "Paid per day (chart)"],
  ["method", "By payment method"],
  ["type", "By type"],
  ["status", "By status"],
] as const;
export type ChapaWidget = (typeof CHAPA_WIDGETS)[number][0];
export const DEFAULT_CHAPA_WIDGETS: ChapaWidget[] = CHAPA_WIDGETS.map(([k]) => k);
export function cleanWidgets(list: unknown): ChapaWidget[] {
  const keys = new Set<string>(DEFAULT_CHAPA_WIDGETS);
  return [...new Set((Array.isArray(list) ? list : []).map(String).filter((k) => keys.has(k)))] as ChapaWidget[];
}

export type ChapaSettings = {
  rules: { pendingMinutes: number; autoSendTime: string | null; dedupeHours: number; defaultSyncMinutes: number };
  // "*" applies to every business; a business id overrides it for that business.
  access: Record<string, Partial<Record<ChapaAction, ChapaActionRule>>>;
};
export const CHAPA_ROLES = ["admin", "finance_manager", "accountant", "owner", "support"] as const;
export const DEFAULT_CHAPA_SETTINGS: ChapaSettings = {
  rules: { pendingMinutes: 30, autoSendTime: null, dedupeHours: 24, defaultSyncMinutes: 15 },
  access: {
    "*": {
      view: { enabled: true, roles: ["admin", "finance_manager", "accountant", "owner"] },
      export: { enabled: true, roles: ["admin", "finance_manager", "accountant"] },
      verify: { enabled: true, roles: ["admin", "finance_manager", "accountant"] },
      send_support: { enabled: true, roles: ["admin", "finance_manager", "accountant"] },
      auto_followup: { enabled: false, roles: ["admin", "finance_manager"] },
      refund: { enabled: false, roles: ["admin", "finance_manager"], limit: 5000, secondApprover: true },
      transfer: { enabled: false, roles: ["admin", "finance_manager"], limit: 50000, dailyCap: 200000, secondApprover: true },
      bulk_transfer: { enabled: false, roles: ["admin"], limit: 200000, dailyCap: 200000, secondApprover: true },
      swap: { enabled: false, roles: ["admin"], limit: 10000 },
    },
  },
};

// Ethiopian phone numbers compare on their last nine digits (09…, +2519…, 2519… are the same line).
export const phoneKey = (v: unknown) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : d;
};

export type ChapaTx = {
  accountId: string;
  business: string;
  txRef: string;
  refId: string | null;
  amount: number;
  charge: number;
  currency: string;
  method: string | null;
  type: string | null;
  status: ChapaStatus;
  customer: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  verifiedAt: string | null;
  followupTicketId: string | null;
  mode: string;
};
