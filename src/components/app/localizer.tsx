"use client";

// Language and calendar, per person (account menu; Phase 16.4). After the page shows, labels that have an Amharic
// translation (lib/amharic.ts) are shown in Amharic, and dates are shown in the Ethiopian calendar, or in both.
// Only the text of existing words changes (never the page's structure), so the page keeps working as it is, and
// it follows every change the page makes. Inputs, code and anything marked data-no-localize are left alone.

import * as React from "react";
import { usePathname } from "next/navigation";
import { AM } from "@/lib/amharic";
import { formatEthiopian } from "@/lib/ethiopian";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_RE = MON.join("|");
// "Nov 3, 2026", "03 Nov 2026", "3 Nov", "Nov 3", "2026-11-03" and "11/3/2026" (month first, as en-US shows it).
const DATE_RE = new RegExp(
  [String.raw`\b(${MON_RE}) (\d{1,2}), (\d{4})\b`, String.raw`\b(\d{1,2}) (${MON_RE})(?: (\d{4}))?\b`, String.raw`\b(${MON_RE}) (\d{1,2})\b`, String.raw`\b(\d{4})-(\d{2})-(\d{2})\b(?!T)`, String.raw`\b(\d{1,2})/(\d{1,2})/(\d{4})\b`].join("|"),
  "g",
);

function toEt(text: string, mode: "ethiopian" | "both") {
  const thisYear = new Date().getFullYear();
  return text.replace(DATE_RE, (all, a1, a2, a3, b1, b2, b3, c1, c2, d1, d2, d3, e1, e2, e3) => {
    let y = 0, m = 0, d = 0;
    if (a1) [y, m, d] = [Number(a3), MON.indexOf(a1) + 1, Number(a2)];
    else if (b2) [y, m, d] = [b3 ? Number(b3) : thisYear, MON.indexOf(b2) + 1, Number(b1)];
    else if (c1) [y, m, d] = [thisYear, MON.indexOf(c1) + 1, Number(c2)];
    else if (d1) [y, m, d] = [Number(d1), Number(d2), Number(d3)];
    else if (e1) [y, m, d] = [Number(e3), Number(e1), Number(e2)];
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return all;
    const et = formatEthiopian(new Date(y, m - 1, d, 12));
    return mode === "both" ? `${all} (${et})` : et;
  });
}

const SKIP = "script, style, code, pre, textarea, input, select, option, [contenteditable], [data-no-localize]";
const hydrated = (el: Element) => Object.keys(el).some((k) => k.startsWith("__reactFiber$"));

export function Localizer({ defaultCalendar = "gregorian" }: { defaultCalendar?: string }) {
  const pathname = usePathname();
  React.useEffect(() => {
    const root = document.documentElement;

    // What each text node showed before we changed it, and what we set, so page updates are followed.
    const seen = new WeakMap<Text, { from: string; to: string }>();
    const attrs = new WeakMap<Element, string>();
    let lang = root.dataset.lang ?? "en";
    // No choice of their own: the workspace's calendar (Settings).
    let cal = root.dataset.calendar || defaultCalendar;
    const fix = (node: Text) => {
      const p = node.parentElement;
      if (!p || p.closest(SKIP)) return;
      // Only text React has already taken over (hydrated or rendered); parts still streaming in are done later.
      if (!hydrated(p)) return;
      const cur = node.nodeValue ?? "";
      const prev = seen.get(node);
      const base = prev && cur === prev.to ? prev.from : cur;
      let out = base;
      if (lang === "am") {
        const t = base.trim();
        const am = t && AM[t];
        if (am) out = base.replace(t, am);
      }
      if (cal !== "gregorian") out = toEt(out, cal as "ethiopian" | "both");
      if (out !== cur) {
        seen.set(node, { from: base, to: out });
        node.nodeValue = out;
      } else if (prev && out === base) seen.delete(node);
    };
    const fixAttrs = (el: Element) => {
      if (lang !== "am" || !hydrated(el) || el.closest("[data-no-localize]")) return;
      for (const a of ["placeholder", "title"] as const) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const base = attrs.get(el) && v === AM[attrs.get(el)!] ? attrs.get(el)! : v;
        const am = AM[base.trim()];
        if (am && v !== am) {
          attrs.set(el, base);
          el.setAttribute(a, am);
        }
      }
    };
    const walk = (n: Node) => {
      if (n.nodeType === Node.TEXT_NODE) return fix(n as Text);
      if (!(n instanceof Element) || n.matches("script, style")) return;
      fixAttrs(n);
      const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let c: Node | null = w.nextNode();
      while (c) {
        if (c.nodeType === Node.TEXT_NODE) fix(c as Text);
        else fixAttrs(c as Element);
        c = w.nextNode();
      }
    };
    const all = () => lang !== "en" || cal !== "gregorian" ? walk(document.body) : undefined;
    // Back to English and Gregorian: put back what was there.
    const restore = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let c = w.nextNode() as Text | null;
      while (c) {
        const s = seen.get(c);
        if (s && c.nodeValue === s.to) c.nodeValue = s.from;
        c = w.nextNode() as Text | null;
      }
    };
    // Now, and a few more sweeps for parts of the page that hydrate a little later (streamed in).
    let sweeps: number[] = [];
    const schedule = () => {
      sweeps.forEach((t) => window.clearTimeout(t));
      all();
      sweeps = [400, 1200, 2500, 5000].map((ms) => window.setTimeout(all, ms));
    };
    schedule();
    let busy = false;
    const obs = new MutationObserver((list) => {
      if (busy) return;
      busy = true;
      try {
        for (const m of list) {
          if (m.type === "attributes" && m.target === root) {
            const nl = root.dataset.lang ?? "en";
            const nc = root.dataset.calendar || defaultCalendar;
            if (nl !== lang || nc !== cal) {
              restore();
              lang = nl;
              cal = nc;
              schedule();
            }
          } else if (lang !== "en" || cal !== "gregorian") {
            if (m.type === "characterData") fix(m.target as Text);
            else m.addedNodes.forEach(walk);
          }
        }
      } finally {
        busy = false;
      }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    obs.observe(root, { attributes: true, attributeFilter: ["data-lang", "data-calendar"] });
    return () => {
      obs.disconnect();
      sweeps.forEach((t) => window.clearTimeout(t));
    };
  }, [pathname, defaultCalendar]);
  return null;
}
