"use client";

// The support app's look, chosen by the customer as in the ops app's Appearance (Settings, on phones): the theme
// (Telegram's own colours, the phone's light or dark setting, or always light or dark), the accent colour, the text
// size and the corners. Kept on this phone. Also the building blocks of its pages: grouped lists as the phone's own
// settings show them, and tiles with a tinted icon.
import * as React from "react";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTelegramTheme, haptic, tgWebApp } from "./tg";

export type Look = { mode: "auto" | "system" | "light" | "dark"; accent: string; text: "small" | "normal" | "large"; radius: "default" | "round" | "sharp" };
export const ACCENTS: { key: string; label: string; swatch: string }[] = [
  { key: "brand", label: "App", swatch: "" },
  { key: "violet", label: "Violet", swatch: "#6d28d9" },
  { key: "blue", label: "Blue", swatch: "#2563eb" },
  { key: "green", label: "Green", swatch: "#0b7a3b" },
  { key: "teal", label: "Teal", swatch: "#0f8a8a" },
  { key: "orange", label: "Orange", swatch: "#e8590c" },
  { key: "pink", label: "Pink", swatch: "#d6336c" },
  { key: "slate", label: "Slate", swatch: "#3d4350" },
];
const KEY = "myseed-support-look";
const DEFAULT: Look = { mode: "auto", accent: "brand", text: "normal", radius: "round" };
const INLINE = ["--background", "--card", "--foreground", "--card-foreground", "--muted-foreground", "--primary", "--primary-foreground", "--ring"];

function read(): Look {
  try {
    return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Look>) };
  } catch {
    return DEFAULT;
  }
}

// Applies the look to the page. "auto": inside Telegram its theme, elsewhere the phone's light or dark setting.
// Accent "brand": inside Telegram its button colour, elsewhere the app's colour from Customer support.
export function applyLook(l: Look, brand: string | null, inTelegram: boolean) {
  const root = document.documentElement;
  for (const v of INLINE) root.style.removeProperty(v);
  const tg = tgWebApp();
  if (l.mode === "auto" && inTelegram && tg?.themeParams) applyTelegramTheme();
  else {
    const dark = l.mode === "dark" || ((l.mode === "system" || l.mode === "auto") && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    root.classList.toggle("dark", !!dark);
  }
  if (l.accent === "brand") {
    delete root.dataset.accent;
    const tgButton = inTelegram && l.mode === "auto" ? tg?.themeParams?.button_color : null;
    const c = tgButton || brand;
    if (c && /^#[0-9a-f]{3,8}$/i.test(c)) {
      root.style.setProperty("--primary", c);
      root.style.setProperty("--ring", c);
      root.style.setProperty("--primary-foreground", tg?.themeParams?.button_text_color && tgButton ? tg.themeParams.button_text_color : "#ffffff");
    }
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-foreground");
    root.dataset.accent = l.accent;
  }
  root.dataset.text = l.text;
  root.dataset.radius = l.radius;
  // Telegram's own bars take the page's colour.
  const bg = getComputedStyle(root).getPropertyValue("--background").trim();
  if (inTelegram && /^#[0-9a-f]{3,8}$/i.test(bg)) {
    const w = tgWebApp() as unknown as { setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void; setBottomBarColor?: (c: string) => void } | null;
    try {
      w?.setHeaderColor?.(bg);
      w?.setBackgroundColor?.(bg);
      w?.setBottomBarColor?.(bg);
    } catch {}
  }
}

// The accent in effect as a colour (Telegram's Main button needs one).
export function primaryHex(fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

export function useLook(brand: string | null, inTelegram: boolean) {
  const [look, setLookState] = React.useState<Look>(DEFAULT);
  const [hex, setHex] = React.useState(brand ?? "#1A73E8");
  React.useEffect(() => setLookState(read()), []);
  React.useEffect(() => {
    const on = () => {
      applyLook(look, brand, inTelegram);
      setHex(primaryHex(brand ?? "#1A73E8"));
    };
    on();
    const t = window.setTimeout(on, 1200);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", on);
    const w = tgWebApp();
    w?.onEvent?.("themeChanged", on);
    return () => {
      window.clearTimeout(t);
      mq?.removeEventListener?.("change", on);
      w?.offEvent?.("themeChanged", on);
    };
  }, [look, brand, inTelegram]);
  const setLook = (p: Partial<Look>) => {
    haptic("select");
    setLookState((l) => {
      const next = { ...l, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  return { look, setLook, hex };
}

// A grouped list: rows on one card with hairlines between them, a small heading above.
export function Group({ title, children, className, ...rest }: { title?: React.ReactNode; children: React.ReactNode; className?: string } & Omit<React.HTMLAttributes<HTMLElement>, "title">) {
  return (
    <section className={cn("space-y-1.5", className)} {...rest}>
      {title && <p className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>}
      <div className="overflow-hidden rounded-[calc(var(--radius)+6px)] border bg-card shadow-xs [&>*+*]:border-t">{children}</div>
    </section>
  );
}

// One row of a group: a tinted icon square, the text, a value or badge, and a chevron when it opens something.
export function Row({ icon: Icon, tint, label, sub, value, badge, onClick, chevron = true, active, ...rest }: { icon?: React.ComponentType<{ className?: string }>; tint?: string; label: React.ReactNode; sub?: React.ReactNode; value?: React.ReactNode; badge?: number; onClick?: () => void; chevron?: boolean; active?: boolean } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value">) {
  const inner = (
    <>
      {Icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-[calc(var(--radius)+2px)] text-white" style={{ background: tint ?? "var(--primary)" }}>
          <Icon className="size-[18px]" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5">{label}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
      {value !== undefined && <span className="shrink-0 text-sm text-muted-foreground">{value}</span>}
      {!!badge && <span className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-[11px] leading-5 font-semibold text-primary-foreground">{badge > 99 ? "99+" : badge}</span>}
      {active && <CheckIcon className="size-4 shrink-0 text-primary" />}
      {onClick && chevron && !active && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/70" />}
    </>
  );
  return onClick ? (
    <button type="button" className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition-colors active:bg-muted/80 hover:bg-muted/50" onClick={onClick} {...rest}>
      {inner}
    </button>
  ) : (
    <div className="flex min-h-12 items-center gap-3 px-3 py-2">{inner}</div>
  );
}

// A big square action: tinted icon above its label.
export function Tile({ icon: Icon, label, sub, onClick, tint, ...rest }: { icon: React.ComponentType<{ className?: string }>; label: string; sub?: string; onClick: () => void; tint?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-start gap-2 rounded-[calc(var(--radius)+6px)] border bg-card p-3 text-left shadow-xs transition active:scale-[0.98]" {...rest}>
      <span className="flex size-9 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${tint ?? "var(--primary)"} 14%, transparent)`, color: tint ?? "var(--primary)" }}>
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-sm leading-tight font-semibold">{label}</span>
        {sub && <span className="block text-[11px] text-muted-foreground">{sub}</span>}
      </span>
    </button>
  );
}

// A row of choices, one pressed.
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-1 rounded-[calc(var(--radius)+4px)] bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={cn("rounded-[var(--radius)] px-2 py-1.5 text-xs font-medium transition", value === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")} data-look-option={k}>
          {l}
        </button>
      ))}
    </div>
  );
}

export const LOOK_WORDS = {
  en: { appearance: "Appearance", theme: "Theme", auto: "Automatic", system: "Phone", light: "Light", dark: "Dark", accent: "Accent colour", text: "Text size", small: "Small", normal: "Normal", large: "Large", corners: "Corners", sharp: "Sharp", standard: "Standard", round: "Round", autoHint: "Follows Telegram's colours inside Telegram, and your phone's light or dark setting elsewhere.", preview: "Preview", previewText: "This is how messages and buttons look." },
  am: { appearance: "መልክ", theme: "ገጽታ", auto: "ራስ-ሰር", system: "ስልክ", light: "ብርሃን", dark: "ጨለማ", accent: "ዋና ቀለም", text: "የጽሑፍ መጠን", small: "ትንሽ", normal: "መደበኛ", large: "ትልቅ", corners: "ጠርዞች", sharp: "ሹል", standard: "መደበኛ", round: "ክብ", autoHint: "በቴሌግራም ውስጥ የቴሌግራምን ቀለሞች፣ በሌላ ቦታ የስልክዎን ብርሃን ወይም ጨለማ ቅንብር ይከተላል።", preview: "ቅድመ እይታ", previewText: "መልዕክቶችና ቁልፎች እንዲህ ይታያሉ።" },
};

export function AppearancePage({ look, setLook, am, brand }: { look: Look; setLook: (p: Partial<Look>) => void; am: boolean; brand: string | null }) {
  const w = LOOK_WORDS[am ? "am" : "en"];
  return (
    <div className="space-y-5 p-4" data-page-appearance>
      <div className="space-y-2 rounded-[calc(var(--radius)+6px)] border bg-card p-3 shadow-xs" aria-label={w.preview}>
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{w.preview}</p>
        <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm">{w.previewText}</div>
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">{am ? "እሺ፣ አመሰግናለሁ" : "Thanks, that helps"}</div>
      </div>
      <section className="space-y-2">
        <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{w.theme}</p>
        <Segmented label={w.theme} value={look.mode} onChange={(mode) => setLook({ mode })} options={[["auto", w.auto], ["system", w.system], ["light", w.light], ["dark", w.dark]]} />
        {look.mode === "auto" && <p className="px-1 text-xs text-muted-foreground">{w.autoHint}</p>}
      </section>
      <section className="space-y-2">
        <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{w.accent}</p>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label={w.accent}>
          {ACCENTS.map((a) => (
            <button key={a.key} type="button" role="radio" aria-checked={look.accent === a.key} aria-label={a.label} onClick={() => setLook({ accent: a.key })} className="flex flex-col items-center gap-1 text-[11px]" data-look-accent={a.key}>
              <span className={cn("flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition", look.accent === a.key && "ring-2 ring-foreground/70")} style={{ background: a.swatch || brand || "var(--primary)" }}>
                {look.accent === a.key && <CheckIcon className="size-4 text-white" />}
              </span>
              {a.label}
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{w.text}</p>
        <Segmented label={w.text} value={look.text} onChange={(text) => setLook({ text })} options={[["small", w.small], ["normal", w.normal], ["large", w.large]]} />
      </section>
      <section className="space-y-2">
        <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{w.corners}</p>
        <Segmented label={w.corners} value={look.radius} onChange={(radius) => setLook({ radius })} options={[["sharp", w.sharp], ["default", w.standard], ["round", w.round]]} />
      </section>
    </div>
  );
}
