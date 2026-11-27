"use client";

import { FocusMode } from "./focus-mode";
import { ICON_PACKS, MOTION_CHOICES } from "@/lib/icon-packs";
import { QrScanButton } from "@/components/app/attendance/qr-scanner";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { BellIcon, CheckCheckIcon, ClockIcon, FlagIcon, HelpCircleIcon, IdCardIcon, LogOutIcon, MessageSquareHeartIcon, MessageCircleIcon, MonitorIcon, MoonIcon, PaletteIcon,
  TypeIcon,
  LanguagesIcon, SearchIcon, SettingsIcon, SparklesIcon, SquareIcon, SunIcon, UserIcon } from "lucide-react";
import { ACCENTS, FONTS, allowedStyles, cinematicAllowed, useAppearance } from "@/components/app/appearance";
import { THEME_PRESETS } from "@/lib/themes";
import { UI_STYLES } from "@/lib/ui-styles";
import { FunLauncher } from "@/components/app/fun/fun-mode";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEPT_VIEW_LABELS } from "@/lib/work";
import { TOOL_APPS } from "@/lib/tools";
import { StickyButton } from "@/components/app/sticky-notes";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbLink, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Hint, UserAvatar } from "@/components/app/primitives";
import { NAV_TIPS } from "@/lib/help";
import { FeedbackDialog } from "@/components/app/support-forms";

const FEEDBACK_LABELS = { idea: "Idea or wish", bug: "Something is broken", question: "Question", praise: "Praise", other: "Other" };
import { logoutAction, switchRoleAction } from "@/app/actions/auth";
import { searchAction } from "@/app/actions/search";
import { listNotificationsAction, markNotificationsAction, snoozeNotificationAction } from "@/app/actions/collab";
import { roleLabel, STAGE_LABELS, type Role, type Stage } from "@/lib/domain";
import { fmtRelative } from "@/lib/format";
import { cn, pollMs } from "@/lib/utils";

const TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  content: "List",
  sheet: "Sheet view",
  pipeline: "Board",
  calendar: "Calendar",
  coverage: "Coverage",
  reports: "Reports",
  team: "Team and capacity",
  chat: "Chat",
  overview: "Overview",
  admin: "Admin",
  questions: "Questions",
  notifications: "Notifications",
  "import-export": "Import and export",
  settings: "Settings",
  items: "Items",
  new: "New item",
  profile: "Profile",
  help: "Help",
  feedback: "Feedback",
  finance: "Finance",
  pay: "Claims and pay",
  payslip: "Payslip",
  safety: "Safety",
  hr: "HR",
  people: "People",
  me: "My record",
  leave: "Leave",
  present: "Presentation",
  audit: "Audit log",
  print: "Printable summary",
  form: "Page view",
  company: "Company overview",
  dev: "Dev team",
  studio: "Studio",
  marketing: "Marketing",
  owners: "Owners",
  email: "Email",
  handovers: "Handovers",
  rejected: "Rejected",
  preferences: "Settings",
  "my-work": "My work",
  report: "Report",
  legacy: "Legacy catalog",
  curriculum: "Curriculum",
  routines: "Routines",
  assign: "Assign work",
  checklists: "Checklists",
};

// A page's place in the address as words: "legacy-cms" is Legacy CMS, "chapa" is Chapa. A record id never shows:
// it reads as what the record is ("Profile" under people, "Details" elsewhere).
const RECORD_WORD: Record<string, string> = { people: "Profile", employees: "Profile", users: "Profile", items: "Item detail", routines: "Routine", handovers: "Handover" };
const ACRONYMS: Record<string, string> = { cms: "CMS", api: "API", apis: "APIs", sms: "SMS", ivr: "IVR", kb: "KB", hr: "HR", pdf: "PDF" };
function isRecordId(s: string) {
  return /^[a-z]{2,5}_[A-Za-z0-9_-]{6,}$/.test(s) || (/\d/.test(s) && s.length > 14) || /^[0-9a-f-]{20,}$/i.test(s);
}
// The Tools and Correspondence pages by their own names (a department's view of the same name, such as the Dev
// team's "docs", must not be borrowed).
const TOOL_CRUMBS: Record<string, string> = Object.fromEntries(TOOL_APPS.map((a) => [a.href.split("/").pop()!, a.label]));
const CORR_CRUMBS: Record<string, string> = { inbox: "My approvals", dashboard: "Dashboard", directory: "Directory", signatures: "Signatures", templates: "Templates", organisation: "Organisation", workflows: "Workflows", setup: "Setup" };

function crumb(p: string, parent?: string) {
  let s = p;
  try {
    s = decodeURIComponent(p);
  } catch {}
  if (isRecordId(s)) return (parent && RECORD_WORD[parent]) || "Details";
  if (parent === "people") return "Profile";
  return s
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w, i) => ACRONYMS[w.toLowerCase()] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function Topbar({ user, activeRole, unread, chatUnread, qrScan, fun = false, assistant = false, sticky = false }: { user: { name: string; email: string; roles: Role[]; avatar?: string | null }; activeRole: Role; unread: number; chatUnread: number; qrScan?: boolean; fun?: boolean; assistant?: boolean; sticky?: boolean }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const phoneTitle = (() => {
    const i = parts.length - 1;
    if (i < 0) return "Home";
    const p = parts[i]!;
    if (p === "dashboard") return "Home";
    return parts[i - 2] === "hr" && parts[i - 1] === "people" ? "Employee" : (parts[i - 1] === "tools" ? TOOL_CRUMBS[p] : parts[i - 1] === "correspondence" ? CORR_CRUMBS[p] : undefined) ?? TITLES[p] ?? (parts[i - 1] === "items" ? "Item detail" : parts[i - 1] === "routines" ? "Routine" : (DEPT_VIEW_LABELS as Record<string, string>)[p] ?? crumb(p, parts[i - 1]));
  })();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [bellOpen, setBellOpen] = React.useState(false);
  const [count, setCount] = React.useState(unread);
  const [chat, setChat] = React.useState(chatUnread);

  React.useEffect(() => setCount(unread), [unread]);
  React.useEffect(() => setChat(chatUnread), [chatUnread]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // The installed app (Phase 5b): the offline page and notifications need the service worker; the app's icon shows
  // the number of unread notifications and messages (where the system supports badges).
  React.useEffect(() => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  React.useEffect(() => {
    const n = count + chat;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (n > 0) void nav.setAppBadge?.(n).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [count, chat]);
  // Light polling keeps the bell current without a refresh; it never creates notifications.
  React.useEffect(() => {
    const id = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/notifications/count", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setCount(data.count);
          setChat(data.chat);
        }
      } catch {
        /* offline: keep the last value */
      }
    }, pollMs(45000));
    return () => window.clearInterval(id);
  }, []);

  return (
    <header data-topbar className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4 no-print">
      {/* The sidebar opens and closes from its own button, at the bottom of the sidebar (app-sidebar.tsx). */}
      {/* Phones: the page's name, like an app's navigation bar (the menu is the More tab). */}
      <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight md:hidden" data-mobile-title>
        {phoneTitle}
      </span>
      <Separator orientation="vertical" className="mr-1 hidden h-5 sm:block" />
      <Breadcrumb className="hidden min-w-0 md:block">
        <BreadcrumbList>
          {parts.map((p, i) => {
            const href = "/" + parts.slice(0, i + 1).join("/");
            const label = parts[i - 2] === "hr" && parts[i - 1] === "people" ? "Employee" : (parts[i - 1] === "tools" ? TOOL_CRUMBS[p] : parts[i - 1] === "correspondence" ? CORR_CRUMBS[p] : undefined) ?? TITLES[p] ?? (parts[i - 1] === "items" ? "Item detail" : parts[i - 1] === "routines" ? "Routine" : (DEPT_VIEW_LABELS as Record<string, string>)[p] ?? crumb(p, parts[i - 1]));
            const last = i === parts.length - 1;
            return (
              <React.Fragment key={href}>
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {last || p === "items" ? <BreadcrumbPage className="truncate">{label}</BreadcrumbPage> : <BreadcrumbLink asChild><Link href={href}>{label}</Link></BreadcrumbLink>}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Hint title="Search" tip={NAV_TIPS["top.search"]}>
        <Button variant="outline" size="sm" className="h-8 w-9 justify-start gap-2 px-2 text-muted-foreground sm:w-72" onClick={() => setSearchOpen(true)} aria-label="Search">
          <SearchIcon className="size-4" />
          <span className="hidden sm:inline" aria-hidden>Search code, title, teacher</span>
          <kbd className="ml-auto hidden rounded border bg-muted px-1 font-mono text-[10px] lg:inline" aria-hidden>Ctrl K</kbd>
        </Button>
        </Hint>
        {/* Phones: the role, QR check-in, Fun mode, Focus, the assistant and the detail switch are under Tools. */}
        <span className="contents max-md:hidden">
          <RoleSwitcher roles={user.roles} active={activeRole} />
        </span>
        {qrScan && <QrScanButton compact className="max-md:hidden" />}
        {fun && (
          <span className="contents max-md:hidden">
            <FunLauncher />
          </span>
        )}
        <FocusMode />
        {sticky && <StickyButton />}
        {assistant && (
          <Button variant="ghost" size="icon" className="max-md:hidden" aria-label="Assistant" title="Assistant (Alt+A)" onClick={() => window.dispatchEvent(new Event("myseed:assistant"))} data-assistant-toggle>
            <SparklesIcon className="text-[#9334E6] dark:text-[#C58AF9]" />
          </Button>
        )}
        <Hint title="Chat" tip={NAV_TIPS["top.chat"]}>
        <Button variant="ghost" size="icon" className={cn("relative hidden lg:inline-flex", pathname === "/chat" && "bg-accent")} aria-label={`Chat, ${chat} unread`} asChild>
          <Link href="/chat">
            <MessageCircleIcon />
            {chat > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular">
                {chat > 99 ? "99+" : chat}
              </span>
            )}
          </Link>
        </Button>
        </Hint>
        <Hint title="Notifications" tip={NAV_TIPS["top.bell"]}>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${count} unread`} onClick={() => setBellOpen(true)}>
          <BellIcon />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--st-blocked-fg)] px-1 text-[10px] font-semibold text-white tabular">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
        </Hint>
        <UserMenu user={user} />
      </div>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <NotificationPanel open={bellOpen} onOpenChange={setBellOpen} onCountChange={setCount} />
    </header>
  );
}

function RoleSwitcher({ roles, active }: { roles: Role[]; active: Role }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  if (roles.length < 2)
    return (
      <span className="hidden h-8 items-center rounded-lg border bg-muted/50 px-2.5 text-xs font-medium sm:inline-flex" title="Your role. Admin sets what each role can see and do.">
        {roleLabel(active)}
      </span>
    );
  return (
    <Select
      value={active}
      onValueChange={(v) =>
        start(async () => {
          const r = await switchRoleAction(v as Role).catch(() => ({ ok: false as const, error: "The role could not be switched. Try again." }));
          if (!r.ok) return void toast.error(r.error);
          toast.success(`Now viewing as ${roleLabel(v)}`, { description: "The role switcher changes your view, not your permissions." });
          router.push("/dashboard");
        })
      }
    >
      <Hint title="Role" tip={NAV_TIPS["top.role"]}>
      <SelectTrigger size="sm" className={cn("h-8 w-[118px] text-xs sm:w-[140px]", pending && "opacity-60")} aria-label="Active role">
        <SelectValue />
      </SelectTrigger>
      </Hint>
      <SelectContent align="end">
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {roleLabel(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserMenu({ user }: { user: { name: string; email: string; avatar?: string | null } }) {
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const { theme, setTheme } = useTheme();
  const [look, setLook] = useAppearance();
  // The preset in effect (the person's or the workspace's), read from the page.
  const [preset, setPreset] = React.useState("");
  React.useEffect(() => {
    const read = () => setPreset(document.documentElement.dataset.preset ?? "");
    read();
    window.addEventListener("myseed-appearance", read);
    return () => window.removeEventListener("myseed-appearance", read);
  }, []);
  return (
    <>
    <DropdownMenu>
      <Hint title={user.name} tip={NAV_TIPS["top.account"]}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <span className="sr-only">Account menu</span>
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- small data URL photo
            <img src={user.avatar} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span aria-hidden>
              <UserAvatar name={user.name} size="md" />
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserIcon /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/preferences" data-settings-link>
            <SettingsIcon /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile?tab=record">
            <IdCardIcon /> My record
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile/help">
            <HelpCircleIcon /> Help and training
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
          <MessageSquareHeartIcon /> Send feedback
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/safety">
            <FlagIcon /> Safety and reporting
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="hidden md:flex" data-ui-style-menu>
            <SparklesIcon /> UI style
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={look.style || ""} onValueChange={(v) => setLook({ style: v })}>
              <DropdownMenuRadioItem value="">As set for the workspace</DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              {UI_STYLES.filter((s) => !allowedStyles().length || allowedStyles().includes(s.key)).map((s) => (
                <DropdownMenuRadioItem key={s.key} value={s.key}>
                  <span className="flex overflow-hidden rounded-sm border">{s.swatch.map((c) => <span key={c} className="size-2.5" style={{ background: c }} />)}</span> {s.label}
                  <span className="ml-auto pl-3 text-[11px] text-muted-foreground">{s.vibe}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="hidden md:flex">
            {theme === "dark" ? <MoonIcon /> : theme === "system" ? <MonitorIcon /> : <SunIcon />} Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {/* Light, Dark or System turn a colour theme off; a colour theme replaces them. */}
            <DropdownMenuRadioGroup
              value={preset || theme}
              onValueChange={(v) => {
                if (THEME_PRESETS.some((p) => p.key === v)) return setLook({ preset: v });
                setLook({ preset: "none" });
                setTheme(v);
              }}
            >
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              {THEME_PRESETS.map((p) => (
                <DropdownMenuRadioItem key={p.key} value={p.key}>
                  <span className="flex overflow-hidden rounded-sm border">{p.swatch.map((c) => <span key={c} className="size-2.5" style={{ background: c }} />)}</span> {p.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="hidden md:flex">
            <PaletteIcon /> Accent colour
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={look.accent} onValueChange={(v) => setLook({ accent: v })}>
              {ACCENTS.map((a) => (
                <DropdownMenuRadioItem key={a.key} value={a.key}>
                  <span className="size-3 rounded-full" style={{ background: a.color }} /> {a.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="hidden md:flex">
            <SquareIcon /> Corners, text and icons
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Corners</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.radius} onValueChange={(v) => setLook({ radius: v })}>
              <DropdownMenuRadioItem value="sharp">Sharp</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="default">Default</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="round">Rounded</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Text size</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.text} onValueChange={(v) => setLook({ text: v })}>
              <DropdownMenuRadioItem value="small">Small</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="normal">Normal</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="large">Large</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Icons</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.icons} onValueChange={(v) => setLook({ icons: v })}>
              <DropdownMenuRadioItem value="colour">Colourful</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="plain">One colour</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Icon pack</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.iconPack || "default"} onValueChange={(v) => setLook({ iconPack: v })}>
              <DropdownMenuRadioItem value="default">Workspace default</DropdownMenuRadioItem>
              {ICON_PACKS.map((p) => (
                <DropdownMenuRadioItem key={p.value} value={p.value}>
                  {p.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Motion</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.motion || "auto"} onValueChange={(v) => setLook({ motion: v })}>
              {MOTION_CHOICES.filter((m) => m.value !== "cinematic" || cinematicAllowed()).map((m) => (
                <DropdownMenuRadioItem key={m.value} value={m.value} data-motion-choice={m.value}>
                  {m.value === "auto" ? "Workspace default" : m.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Outline strokes</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.iconWeight} onValueChange={(v) => setLook({ iconWeight: v })}>
              <DropdownMenuRadioItem value="thin">Thin</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="regular">Regular</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="bold">Bold</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="hidden md:flex">
            <TypeIcon /> Font and contrast
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Font</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.font} onValueChange={(v) => setLook({ font: v })}>
              {FONTS.map((f) => (
                <DropdownMenuRadioItem key={f.key} value={f.key}>
                  {f.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Contrast</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.contrast} onValueChange={(v) => setLook({ contrast: v })}>
              <DropdownMenuRadioItem value="normal">Normal</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="high">High contrast</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Slow connection</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.lite} onValueChange={(v) => setLook({ lite: v })}>
              <DropdownMenuRadioItem value="off">Normal</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="on">Light mode (no animations, fewer refreshes)</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="hidden md:flex">
            <LanguagesIcon /> Language and calendar
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Language</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.lang} onValueChange={(v) => setLook({ lang: v })}>
              <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="am">አማርኛ (Amharic)</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Dates</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={look.calendar} onValueChange={(v) => setLook({ calendar: v })}>
              <DropdownMenuRadioItem value="">As set for the workspace</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="gregorian">Gregorian (3 Nov 2026)</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="ethiopian">Ethiopian (ጥቅምት 24, 2019)</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="both">Both</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logoutAction()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} categories={FEEDBACK_LABELS} />
    </>
  );
}

type SearchHit = Awaited<ReturnType<typeof searchAction>>[number];

function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  React.useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(async () => setHits(await searchAction(q)), 180);
    return () => window.clearTimeout(t);
  }, [q]);
  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };
  const pages = [
    ["Dashboard", "/dashboard"],
    ["All content", "/content"],
    ["Sheet view", "/sheet"],
    ["Pipeline", "/pipeline"],
    ["Calendar", "/calendar"],
    ["Reports", "/reports"],
    ["Curriculum coverage", "/coverage"],
    ["Overview", "/overview"],
    ["Chat", "/chat"],
    ["Import and export", "/import-export"],
    ["Admin", "/admin"],
  ];
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Search" description="Find items by code, title or teacher">
      <Command shouldFilter={false}>
      <CommandInput placeholder="Type a code such as MY-G08-MATH, a title or a teacher" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{q.length < 2 ? "Type at least two characters." : "No matching items in your scope."}</CommandEmpty>
        {hits.length > 0 && (
          <CommandGroup heading="Items">
            {hits.map((h) => (
              <CommandItem key={h.id} value={h.id} onSelect={() => go(`/items/${h.id}`)}>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{h.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {h.code} / {h.lifecycle === "in_production" && h.stage ? STAGE_LABELS[h.stage as Stage] : h.lifecycle}
                  </span>
                </div>
              </CommandItem>
            ))}
            <CommandItem value="all-results" onSelect={() => go(`/content?q=${encodeURIComponent(q)}`)}>
              <SearchIcon /> Show all results for &quot;{q}&quot;
            </CommandItem>
          </CommandGroup>
        )}
        {q.length < 2 && (
          <CommandGroup heading="Go to">
            {pages.map(([label, href]) => (
              <CommandItem key={href} value={href} onSelect={() => go(href)}>
                {label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}

type NotificationRow = { id: string; type: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string; updated_at: string; count: number; essential: number };

export function NotificationList({ tab, onCountChange, onNavigate, limit }: { tab: string; onCountChange?: (n: number) => void; onNavigate?: () => void; limit?: number }) {
  const router = useRouter();
  const [rows, setRows] = React.useState<NotificationRow[] | null>(null);
  const load = React.useCallback(async () => {
    const res = await listNotificationsAction(tab);
    if (res.ok) setRows((res.data as NotificationRow[]) ?? []);
    const c = await fetch("/api/notifications/count", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (c && onCountChange) onCountChange(c.count);
  }, [tab, onCountChange]);
  React.useEffect(() => {
    setRows(null);
    load();
  }, [load]);
  if (!rows) return <div className="space-y-2 p-1">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>;
  if (!rows.length) return <p className="px-2 py-10 text-center text-sm text-muted-foreground">You are all caught up.</p>;
  return (
    <ul className="divide-y">
      {rows.slice(0, limit ?? rows.length).map((n) => (
        <li key={n.id} className={cn("group flex gap-3 px-2 py-3", !n.read_at && "bg-accent/30")}>
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-primary")} aria-hidden />
          <button
            className="min-w-0 flex-1 text-left"
            onClick={async () => {
              await markNotificationsAction([n.id]);
              onNavigate?.();
              if (n.link) router.push(n.link);
              load();
            }}
          >
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-medium">{n.title}</span>
              {n.count > 1 && <span className="shrink-0 rounded bg-muted px-1 text-[10px] tabular">x{n.count}</span>}
            </div>
            {n.body && <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {fmtRelative(n.updated_at)} / {n.type}
              {n.essential ? " / essential" : ""}
            </p>
          </button>
          <div className="flex shrink-0 flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={n.read_at ? "Mark unread" : "Mark read"}
              title={n.read_at ? "Mark unread" : "Mark read"}
              onClick={async () => {
                await markNotificationsAction([n.id], !n.read_at);
                load();
              }}
            >
              <CheckCheckIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Snooze for 4 hours"
              title="Snooze for 4 hours"
              onClick={async () => {
                await snoozeNotificationAction(n.id, 4);
                toast("Snoozed for 4 hours");
                load();
              }}
            >
              <ClockIcon />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NotificationPanel({ open, onOpenChange, onCountChange }: { open: boolean; onOpenChange: (o: boolean) => void; onCountChange: (n: number) => void }) {
  const [tab, setTab] = React.useState("all");
  const [key, setKey] = React.useState(0);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Notifications</SheetTitle>
          <SheetDescription>Assignments, handoffs, mentions and alerts for your work.</SheetDescription>
          <div className="flex items-center gap-2 pt-2">
            <Tabs value={tab} onValueChange={setTab} className="min-w-0 flex-1">
              <TabsList className="w-full overflow-x-auto">
                {["all", "unread", "mentions", "assignments", "approvals", "alerts"].map((t) => (
                  <TabsTrigger key={t} value={t} className="px-2 text-xs capitalize">
                    {t}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          {open && <NotificationList key={`${tab}-${key}`} tab={tab} onCountChange={onCountChange} onNavigate={() => onOpenChange(false)} />}
        </div>
        <div className="flex items-center justify-between gap-2 border-t p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await markNotificationsAction("all");
              setKey((k) => k + 1);
            }}
          >
            Mark all read
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/notifications" onClick={() => onOpenChange(false)}>
              Open inbox and preferences
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
