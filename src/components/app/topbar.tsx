"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { BellIcon, CheckCheckIcon, ClockIcon, HelpCircleIcon, IdCardIcon, LogOutIcon, MessageCircleIcon, MonitorIcon, MoonIcon, PaletteIcon, SearchIcon, SquareIcon, SunIcon, UserIcon } from "lucide-react";
import { ACCENTS, useAppearance } from "@/components/app/appearance";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
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
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbLink, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { UserAvatar } from "@/components/app/primitives";
import { logoutAction, switchRoleAction } from "@/app/actions/auth";
import { searchAction } from "@/app/actions/search";
import { listNotificationsAction, markNotificationsAction, snoozeNotificationAction } from "@/app/actions/collab";
import { ROLE_LABELS, STAGE_LABELS, type Role, type Stage } from "@/lib/domain";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

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
  hr: "HR",
  people: "People",
  me: "My record",
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
  assign: "Assign work",
  checklists: "Checklists",
};

export function Topbar({ user, activeRole, unread, chatUnread }: { user: { name: string; email: string; roles: Role[] }; activeRole: Role; unread: number; chatUnread: number }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
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
    }, 45000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4 no-print">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 hidden h-5 sm:block" />
      <Breadcrumb className="hidden min-w-0 md:block">
        <BreadcrumbList>
          {parts.map((p, i) => {
            const href = "/" + parts.slice(0, i + 1).join("/");
            const label = TITLES[p] ?? (parts[i - 1] === "items" ? "Item detail" : p);
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
        <Button variant="outline" size="sm" className="h-8 w-9 justify-start gap-2 px-2 text-muted-foreground sm:w-72" onClick={() => setSearchOpen(true)} aria-label="Search">
          <SearchIcon className="size-4" />
          <span className="hidden sm:inline">Search code, title, teacher</span>
          <kbd className="ml-auto hidden rounded border bg-muted px-1 font-mono text-[10px] lg:inline">Ctrl K</kbd>
        </Button>
        <RoleSwitcher roles={user.roles} active={activeRole} />
        <Button variant="ghost" size="icon" className={cn("relative", pathname === "/chat" && "bg-accent")} aria-label={`Chat, ${chat} unread`} title="Chat" asChild>
          <Link href="/chat">
            <MessageCircleIcon />
            {chat > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular">
                {chat > 99 ? "99+" : chat}
              </span>
            )}
          </Link>
        </Button>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications, ${count} unread`} onClick={() => setBellOpen(true)}>
          <BellIcon />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--st-blocked-fg)] px-1 text-[10px] font-semibold text-white tabular">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
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
      <span className="hidden h-8 items-center rounded-lg border bg-muted/50 px-2.5 text-xs font-medium sm:inline-flex" title="Your role">
        {ROLE_LABELS[active]}
      </span>
    );
  return (
    <Select
      value={active}
      onValueChange={(v) =>
        start(async () => {
          await switchRoleAction(v as Role);
          toast.success(`Now viewing as ${ROLE_LABELS[v as Role]}`, { description: "The role switcher changes your view, not your permissions." });
          router.push("/dashboard");
        })
      }
    >
      <SelectTrigger size="sm" className={cn("h-8 w-[118px] text-xs sm:w-[140px]", pending && "opacity-60")} aria-label="Active role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UserMenu({ user }: { user: { name: string; email: string } }) {
  const { theme, setTheme } = useTheme();
  const [look, setLook] = useAppearance();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
          <UserAvatar name={user.name} size="md" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserIcon /> Profile and preferences
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/me">
            <IdCardIcon /> My record
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/profile/help">
            <HelpCircleIcon /> Help and training
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {theme === "dark" ? <MoonIcon /> : theme === "system" ? <MonitorIcon /> : <SunIcon />} Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
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
          <DropdownMenuSubTrigger>
            <SquareIcon /> Corners and text
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
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logoutAction()}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
