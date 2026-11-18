import { getMeta, setMeta } from "./settings";
import type { AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { allowedCategoriesForUser, authenticateFilament, fetchLegacyCmsLivePage, getLegacyCmsConfigForUser, type LegacyCmsCategory } from "./legacy-cms";
import { cmsSession } from "./cms-session";

// Noor's own numbers, so ops says what Noor says. Two sources:
//  - the totals of Noor's lists ("Showing 1 to 10 of 6,134"), with Noor's own filters: students, parents, active
//    subscriptions, invoices waiting for bank review;
//  - the cards on Noor's dashboard (Total Students, Active Subscriptions, Revenue, Active Agents), which Noor loads
//    lazily: read by asking Livewire to load each widget, as Noor's page does when it scrolls into view.
// The menu badges (Invoices 79, Feedback 42) are kept too, because they can differ from the lists: Noor counts them
// its own way. Kept for five minutes; Refresh asks again.

export type NoorCard = { label: string; value: string; number: number | null; description: string | null };
export type NoorTotals = {
  at: string;
  lists: { key: string; label: string; total: number | null; category: LegacyCmsCategory; filters?: Record<string, string> }[];
  cards: NoorCard[];
  badges: Record<string, number>;
  errors: string[];
};

const KEEP_MS = 5 * 60e3;
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const plain = (s: string) => decode(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
export const noorNumber = (v: string) => {
  const m = v.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

// The stat cards of a Filament stats widget: label, value and description of each.
export function parseNoorStats(html: string): NoorCard[] {
  const out: NoorCard[] = [];
  const parts = html.split(/(?=<[^>]+class="[^"]*fi-wi-stats-overview-stat(?:\s|")[^"]*")/);
  for (const p of parts.slice(1)) {
    const grab = (cls: string) => {
      const m = p.match(new RegExp(`class="[^"]*fi-wi-stats-overview-stat-${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/(?:span|div|p)>`));
      return m ? plain(m[1]) : "";
    };
    const label = grab("label");
    const value = grab("value");
    if (!label || !value) continue;
    out.push({ label, value, number: noorNumber(value), description: grab("description") || null });
  }
  return out;
}

// The menu's badges: "Invoices 79".
export function parseNoorBadges(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of html.matchAll(/<li[^>]*fi-sidebar-item[^>]*>([\s\S]*?)<\/li>/g)) {
    const label = m[1].match(/fi-sidebar-item-label[^>]*>([\s\S]*?)<\/span>/);
    const badge = m[1].match(/fi-badge[^>]*>([\s\S]*?)<\/(?:span|div)>/);
    if (label && badge) {
      const n = noorNumber(plain(badge[1]));
      if (n !== null) out[plain(label[1])] = n;
    }
  }
  return out;
}

// Each lazily loaded widget of a page: its snapshot and the argument Noor's page passes to __lazyLoad.
export function lazyWidgets(html: string) {
  const out: { name: string; snapshot: string; arg: string }[] = [];
  const all = [...html.matchAll(/wire:snapshot="([^"]+)"/g)];
  for (const [i, m] of all.entries()) {
    // The component's own attributes run up to the next component (or a few thousand characters).
    const tag = html.slice(m.index! + m[0].length, Math.min(all[i + 1]?.index ?? html.length, m.index! + m[0].length + 4000));
    const lazy = decode(tag).match(/__lazyLoad\('([^']+)'\)/);
    if (!lazy) continue;
    const snapshot = decode(m[1]);
    let name = "";
    try {
      name = JSON.parse(snapshot).memo?.name ?? "";
    } catch {}
    if (name.includes("Widgets")) out.push({ name, snapshot, arg: lazy[1] });
  }
  return out;
}

async function readDashboard(base: string, cookie: string) {
  const res = await fetch(`${base}/admin`, { headers: { Cookie: cookie, Accept: "text/html" }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Noor's dashboard did not open (HTTP ${res.status}).`);
  const html = await res.text();
  const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1] ?? "";
  const uri = decode(html.match(/data-update-uri="([^"]+)"/)?.[1] ?? "/livewire/update");
  const endpoint = new URL(uri, base);
  if (endpoint.origin !== new URL(base).origin) throw new Error("Unexpected Noor endpoint.");
  const cards: NoorCard[] = [];
  for (const w of lazyWidgets(html).filter((x) => /Stats|Overview/i.test(x.name))) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Livewire": "true", "X-CSRF-TOKEN": csrf, Cookie: cookie },
      body: JSON.stringify({ _token: csrf, components: [{ snapshot: w.snapshot, updates: {}, calls: [{ path: "", method: "__lazyLoad", params: [w.arg] }] }] }),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) continue;
    const effects = (await r.json().catch(() => null))?.components?.[0]?.effects?.html;
    if (typeof effects === "string") cards.push(...parseNoorStats(effects));
  }
  return { cards, badges: parseNoorBadges(html) };
}

const LISTS: NoorTotals["lists"] = [
  { key: "students", label: "Students", total: null, category: "students" },
  { key: "parents", label: "Parents", total: null, category: "parents" },
  { key: "activeSubscriptions", label: "Active subscriptions", total: null, category: "subscriptions", filters: { "status.value": "active" } },
  { key: "waitingApproval", label: "Invoices waiting for approval", total: null, category: "invoices", filters: { "status.value": "pending_review" } },
  { key: "paidInvoices", label: "Paid invoices", total: null, category: "invoices", filters: { "status.value": "paid" } },
];

export async function noorTotals(user: AppUser, opts: { refresh?: boolean } = {}): Promise<NoorTotals> {
  const allowed = new Set((await Promise.all(user.roles.map((r) => allowedCategoriesForUser(r, user.id)))).flat());
  if (!allowed.size) throw new WorkflowError("FORBIDDEN", "No Noor tables are open to you.");
  let t: NoorTotals | null = null;
  try {
    t = JSON.parse((await getMeta("noorTotals")) ?? "null");
  } catch {}
  if (!t || opts.refresh || Date.now() - Date.parse(t.at) > KEEP_MS) {
    const errors: string[] = [];
    const lists = [];
    for (const l of LISTS) {
      const r = await fetchLegacyCmsLivePage(user, { category: l.category, pageSize: 10, filters: l.filters }).catch((e: Error) => ({ ok: false, message: e.message, totalResults: 0 }));
      if (!r.ok) errors.push(`${l.label}: ${"message" in r ? r.message : "not read"}`);
      lists.push({ ...l, total: r.ok ? r.totalResults : null });
    }
    let cards: NoorCard[] = [];
    let badges: Record<string, number> = {};
    try {
      const config = await getLegacyCmsConfigForUser(user);
      const base = config.baseUrl.replace(/\/+$/, "");
      let cookie = await cmsSession(config, authenticateFilament);
      const d = await readDashboard(base, cookie).catch(async () => {
        cookie = await cmsSession(config, authenticateFilament, true);
        return readDashboard(base, cookie);
      });
      cards = d.cards;
      badges = d.badges;
    } catch (e) {
      errors.push(`Dashboard: ${e instanceof Error ? e.message : String(e)}`);
    }
    t = { at: new Date().toISOString(), lists, cards, badges, errors };
    // Kept only when something was read, so a failed read does not hide the last good one.
    if (lists.some((l) => l.total !== null) || cards.length) await setMeta("noorTotals", JSON.stringify(t));
  }
  // Each person sees the figures of the tables open to them; revenue only with invoices.
  return {
    ...t,
    lists: t.lists.filter((l) => allowed.has(l.category)),
    cards: allowed.has("invoices") ? t.cards : t.cards.filter((c) => !/revenue|invoice|payment/i.test(c.label)),
    badges: Object.fromEntries(Object.entries(t.badges).filter(([k]) => allowed.has("invoices") || !/invoice/i.test(k))),
  };
}
