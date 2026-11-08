const workViews = ["/content", "/sheet", "/pipeline", "/calendar"];

// A hidden section covers its descendants. A query-specific rule hides only that
// destination, including links with additional filters or reordered parameters.
export function sidebarHidden(href: string, hidden: readonly string[], id?: string): boolean {
  const target = new URL(href, "https://navigation.local");
  return hidden.some(rule => {
    if (rule === id || rule === href) return true;
    if (rule === "views") return workViews.includes(target.pathname);
    if (!rule.startsWith("/") || rule.startsWith("//")) return false;
    const url = new URL(rule, "https://navigation.local");
    const path = url.pathname.replace(/\/$/, "");
    if (!path) return false;
    if (url.search) return target.pathname === path && [...url.searchParams].every(([k,v]) => target.searchParams.get(k) === v);
    return target.pathname === path || target.pathname.startsWith(`${path}/`);
  });
}

type Entry = { href: string; id?: string; locked?: boolean; gather?: boolean; sub?: {href:string;label:string;keepFilters?:boolean}[] };
export function pruneSidebar<T extends Entry>(items: T[], hidden: readonly string[]): T[] {
  return items.flatMap(item => {
    if (!item.gather && !item.locked && sidebarHidden(item.href, hidden, item.id)) return [];
    if (!item.sub) return item.gather && sidebarHidden(item.href, hidden, item.id) ? [] : [item];
    const sub = item.sub.filter(link => !sidebarHidden(link.href, hidden));
    if (!sub.length) return item.gather ? [] : [{...item, sub:undefined}];
    const href = sidebarHidden(item.href, hidden, item.id) ? sub[0].href : item.href;
    return [{...item, href, sub}];
  });
}
