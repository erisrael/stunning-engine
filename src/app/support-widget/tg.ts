"use client";

// Telegram's Mini App controls for the support app (Update 1.2, spec 15): the Back button in Telegram's header, the
// Main button at the bottom, haptic feedback, the theme, and the start parameter of a deep link. Each is used only
// where this Telegram version has it; outside Telegram (or in a browser that loaded Telegram's script) nothing
// changes and the page's own buttons do the work.
import * as React from "react";

type Btn = {
  show?: () => void;
  hide?: () => void;
  onClick?: (f: () => void) => void;
  offClick?: (f: () => void) => void;
};
type MainBtn = Btn & {
  setParams?: (p: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void;
  showProgress?: (leaveActive?: boolean) => void;
  hideProgress?: () => void;
};
export type TgWebApp = {
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  platform?: string;
  version?: string;
  colorScheme?: string;
  themeParams?: Record<string, string | undefined>;
  ready?: () => void;
  expand?: () => void;
  BackButton?: Btn;
  MainButton?: MainBtn;
  HapticFeedback?: { impactOccurred?: (s: "light" | "medium" | "heavy") => void; notificationOccurred?: (t: "error" | "success" | "warning") => void; selectionChanged?: () => void };
  onEvent?: (e: string, f: () => void) => void;
  offEvent?: (e: string, f: () => void) => void;
  setHeaderColor?: (c: string) => void;
  requestContact?: (cb?: (shared: boolean, res?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void) => void;
};

/** Telegram's own "Share my phone number" (Bot API 6.9+): the number, or null when declined or not available. */
export function shareTelegramPhone(): Promise<string | null> {
  const tg = tgWebApp();
  if (!tg?.requestContact) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      tg.requestContact!((shared, res) => {
        const n = res?.responseUnsafe?.contact?.phone_number ?? null;
        resolve(shared && n ? (n.startsWith("+") ? n : `+${n}`) : null);
      });
    } catch {
      resolve(null);
    }
  });
}

export const tgWebApp = (): TgWebApp | null => (typeof window === "undefined" ? null : ((window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null));
// Inside the Telegram app itself (Telegram's script in a plain browser reports the platform "unknown").
export const inTelegram = () => {
  const t = tgWebApp();
  return !!t?.platform && t.platform !== "unknown";
};

// Telegram's script loads after the page: the controls once it is there (null outside Telegram).
export function useTelegram(enabled: boolean) {
  const [tg, setTg] = React.useState<TgWebApp | null>(null);
  React.useEffect(() => {
    if (!enabled) return;
    let n = 0;
    const look = () => {
      if (inTelegram()) return void setTg(tgWebApp());
      if (++n < 20) t = window.setTimeout(look, 250);
    };
    let t = window.setTimeout(look, 0);
    return () => window.clearTimeout(t);
  }, [enabled]);
  return tg;
}

export function haptic(kind: "select" | "tap" | "success" | "error" | "warning") {
  const h = tgWebApp()?.HapticFeedback;
  try {
    if (kind === "select") h?.selectionChanged?.();
    else if (kind === "tap") h?.impactOccurred?.("light");
    else h?.notificationOccurred?.(kind);
  } catch {}
}

// Telegram's own Back button, shown while there is a page to go back to.
export function useBackButton(tg: TgWebApp | null, show: boolean, onBack: () => void) {
  const ref = React.useRef(onBack);
  ref.current = onBack;
  React.useEffect(() => {
    const b = tg?.BackButton;
    if (!b) return;
    const f = () => (haptic("tap"), ref.current());
    try {
      if (show) {
        b.onClick?.(f);
        b.show?.();
      } else b.hide?.();
    } catch {}
    return () => {
      try {
        b.offClick?.(f);
      } catch {}
    };
  }, [tg, show]);
  React.useEffect(() => () => void tg?.BackButton?.hide?.(), [tg]);
}

// Telegram's Main button for the page's one main action (text null hides it; undefined leaves it to another part).
export function useMainButton(tg: TgWebApp | null, text: string | null | undefined, onClick: () => void, opts: { active?: boolean; busy?: boolean; color?: string } = {}) {
  const ref = React.useRef(onClick);
  ref.current = onClick;
  const { active = true, busy = false, color } = opts;
  React.useEffect(() => {
    const m = tg?.MainButton;
    if (!m || text === undefined) return;
    const f = () => (haptic("tap"), ref.current());
    try {
      if (!text) {
        m.hide?.();
        return;
      }
      m.setParams?.({ text, is_active: active && !busy, is_visible: true, ...(color && /^#[0-9a-f]{6}$/i.test(color) ? { color, text_color: "#ffffff" } : {}) });
      if (busy) m.showProgress?.(false);
      else m.hideProgress?.();
      m.onClick?.(f);
      m.show?.();
    } catch {}
    return () => {
      try {
        m.offClick?.(f);
      } catch {}
    };
  }, [tg, text, active, busy, color]);
  React.useEffect(() => () => void tg?.MainButton?.hide?.(), [tg]);
}

// A deep link's start parameter: t.me/<bot>/<app>?startapp=<p>, or the page address (?page=<p>).
export function startParam(): string | null {
  const t = tgWebApp();
  if (t?.initDataUnsafe?.start_param) return t.initDataUnsafe.start_param;
  try {
    return new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppStartParam");
  } catch {
    return null;
  }
}

// Inside Telegram the app takes Telegram's own colours (light or dark, the person's theme), and follows a change.
export function applyTelegramTheme() {
  const tg = tgWebApp();
  const t = tg?.themeParams;
  if (!t) return;
  const root = document.documentElement;
  const set = (v: string, c?: string) => c && /^#[0-9a-f]{3,8}$/i.test(c) && root.style.setProperty(v, c);
  set("--background", t.bg_color);
  set("--card", t.secondary_bg_color ?? t.bg_color);
  set("--foreground", t.text_color);
  set("--card-foreground", t.text_color);
  set("--muted-foreground", t.hint_color);
  set("--primary", t.button_color);
  set("--primary-foreground", t.button_text_color);
  root.classList.toggle("dark", tg?.colorScheme === "dark");
}
