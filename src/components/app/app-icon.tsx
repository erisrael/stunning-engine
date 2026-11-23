// Icons for the sidebar and quick actions, in the person's chosen style (account menu, Corners, text and icons):
// - colourful (Google style): each kind of page keeps its own colour everywhere, lighter in dark mode; or one colour;
// - the pack: Lucide outline (thin, regular or bold strokes), or Phosphor filled or duotone;
// - Admin (Admin, Branding) can give a sidebar entry another icon from the pack below and another colour.
// Lucide is drawn on the server; the Phosphor styles (filled, duotone, soft, bold, sticker) load only for people who
// chose one (src/components/app/phosphor-twin.tsx), so the default outline style ships no Phosphor icons at all.

import * as React from "react";
import * as L from "lucide-react";
import { PhosphorTwin } from "./phosphor-twin";
import { cn } from "@/lib/utils";

const TONES = {
  blue: "text-[#1A73E8] dark:text-[#8AB4F8]",
  red: "text-[#D93025] dark:text-[#F28B82]",
  yellow: "text-[#E37400] dark:text-[#FDD663]",
  green: "text-[#188038] dark:text-[#81C995]",
  purple: "text-[#9334E6] dark:text-[#C58AF9]",
  teal: "text-[#007B83] dark:text-[#78D9EC]",
  orange: "text-[#E8710A] dark:text-[#FCAD70]",
  pink: "text-[#D01884] dark:text-[#FF8BCB]",
  slate: "text-[#5F6368] dark:text-[#BDC1C6]",
} as const;
export type Tone = keyof typeof TONES;
export const TONE_LIST = Object.keys(TONES) as Tone[];
export const TONE_SWATCH: Record<Tone, string> = { blue: "#1A73E8", red: "#D93025", yellow: "#F9AB00", green: "#188038", purple: "#9334E6", teal: "#007B83", orange: "#E8710A", pink: "#D01884", slate: "#5F6368" };

const TILES: Record<Tone, string> = {
  blue: "bg-[#1A73E8]/10 dark:bg-[#8AB4F8]/15",
  red: "bg-[#D93025]/10 dark:bg-[#F28B82]/15",
  yellow: "bg-[#F9AB00]/15 dark:bg-[#FDD663]/15",
  green: "bg-[#188038]/10 dark:bg-[#81C995]/15",
  purple: "bg-[#9334E6]/10 dark:bg-[#C58AF9]/15",
  teal: "bg-[#007B83]/10 dark:bg-[#78D9EC]/15",
  orange: "bg-[#E8710A]/10 dark:bg-[#FCAD70]/15",
  pink: "bg-[#D01884]/10 dark:bg-[#FF8BCB]/15",
  slate: "bg-[#5F6368]/10 dark:bg-[#BDC1C6]/15",
};

type Svg = React.ComponentType<{ className?: string }> & { displayName?: string };

// The icon pack: each icon in Lucide and Phosphor, with its usual colour. Keys are what Admin saves.
export const ICONS: Record<string, { label: string; lucide: Svg; tone: Tone }> = {
  home: { label: "Home", lucide: L.HomeIcon, tone: "blue" },
  clock: { label: "Clock", lucide: L.ClockIcon, tone: "green" },
  timer: { label: "Timer", lucide: L.TimerIcon, tone: "orange" },
  checks: { label: "Approvals", lucide: L.CheckCheckIcon, tone: "green" },
  checklist: { label: "Checklist", lucide: L.ListChecksIcon, tone: "green" },
  userCheck: { label: "Person, checked", lucide: L.UserCheckIcon, tone: "teal" },
  users: { label: "People", lucide: L.UsersIcon, tone: "purple" },
  team: { label: "Team", lucide: L.UsersRoundIcon, tone: "purple" },
  userCog: { label: "Admin", lucide: L.UserCogIcon, tone: "purple" },
  userPlus: { label: "Add person", lucide: L.UserPlusIcon, tone: "purple" },
  contact: { label: "Contacts", lucide: L.ContactIcon, tone: "purple" },
  idCard: { label: "ID card", lucide: L.IdCardIcon, tone: "purple" },
  profile: { label: "Profile", lucide: L.CircleUserIcon, tone: "blue" },
  question: { label: "Question", lucide: L.MessageCircleQuestionIcon, tone: "orange" },
  chat: { label: "Chat", lucide: L.MessageSquareIcon, tone: "teal" },
  chats: { label: "Conversations", lucide: L.MessagesSquareIcon, tone: "teal" },
  mail: { label: "Email", lucide: L.MailIcon, tone: "red" },
  inbox: { label: "Inbox", lucide: L.InboxIcon, tone: "pink" },
  bell: { label: "Bell", lucide: L.BellIcon, tone: "yellow" },
  tree: { label: "Overview", lucide: L.ListTreeIcon, tone: "blue" },
  list: { label: "List", lucide: L.ListIcon, tone: "blue" },
  layers: { label: "Layers", lucide: L.LayersIcon, tone: "teal" },
  package: { label: "Package", lucide: L.PackageCheckIcon, tone: "orange" },
  video: { label: "Video", lucide: L.VideoIcon, tone: "red" },
  calendar: { label: "Calendar", lucide: L.CalendarIcon, tone: "blue" },
  kanban: { label: "Board", lucide: L.KanbanIcon, tone: "teal" },
  folder: { label: "Folder", lucide: L.FolderKanbanIcon, tone: "yellow" },
  sheet: { label: "Sheet", lucide: L.SheetIcon, tone: "green" },
  map: { label: "Map", lucide: L.MapIcon, tone: "green" },
  gantt: { label: "Timeline", lucide: L.GanttChartIcon, tone: "purple" },
  chart: { label: "Chart", lucide: L.ChartColumnIcon, tone: "yellow" },
  presentation: { label: "Presentation", lucide: L.PresentationIcon, tone: "orange" },
  branch: { label: "Code branch", lucide: L.GitBranchIcon, tone: "purple" },
  code: { label: "Code", lucide: L.CodeIcon, tone: "blue" },
  file: { label: "Document", lucide: L.FileTextIcon, tone: "blue" },
  filePlus: { label: "New document", lucide: L.FilePlus2Icon, tone: "blue" },
  fileQuestion: { label: "Question bank", lucide: L.FileQuestionIcon, tone: "orange" },
  notebook: { label: "Notebook", lucide: L.NotebookTextIcon, tone: "yellow" },
  cards: { label: "Cards", lucide: L.GalleryVerticalEndIcon, tone: "pink" },
  bookOpen: { label: "Open book", lucide: L.BookOpenIcon, tone: "teal" },
  calculator: { label: "Calculator", lucide: L.CalculatorIcon, tone: "green" },
  wallet: { label: "Wallet", lucide: L.WalletIcon, tone: "green" },
  bank: { label: "Finance", lucide: L.LandmarkIcon, tone: "green" },
  briefcase: { label: "Department", lucide: L.BriefcaseIcon, tone: "orange" },
  building: { label: "Company", lucide: L.Building2Icon, tone: "blue" },
  crown: { label: "Owners", lucide: L.CrownIcon, tone: "yellow" },
  megaphone: { label: "Marketing", lucide: L.MegaphoneIcon, tone: "pink" },
  plane: { label: "Travel", lucide: L.PlaneIcon, tone: "teal" },
  database: { label: "Data", lucide: L.DatabaseIcon, tone: "slate" },
  arrows: { label: "Import and export", lucide: L.ArrowLeftRightIcon, tone: "teal" },
  eye: { label: "View", lucide: L.EyeIcon, tone: "purple" },
  shield: { label: "Security", lucide: L.ShieldCheckIcon, tone: "blue" },
  devices: { label: "Devices", lucide: L.MonitorSmartphoneIcon, tone: "slate" },
  grid: { label: "Grid", lucide: L.GridIcon, tone: "blue" },
  settings: { label: "Settings", lucide: L.SettingsIcon, tone: "slate" },
  sliders: { label: "Configure", lucide: L.Settings2Icon, tone: "slate" },
  sparkles: { label: "Sparkles", lucide: L.SparklesIcon, tone: "purple" },
  rocket: { label: "Rocket", lucide: L.RocketIcon, tone: "orange" },
  star: { label: "Star", lucide: L.StarIcon, tone: "yellow" },
  heart: { label: "Heart", lucide: L.HeartIcon, tone: "red" },
  flag: { label: "Flag", lucide: L.FlagIcon, tone: "red" },
  zap: { label: "Lightning", lucide: L.ZapIcon, tone: "yellow" },
  camera: { label: "Camera", lucide: L.CameraIcon, tone: "slate" },
  mic: { label: "Microphone", lucide: L.MicIcon, tone: "red" },
  palette: { label: "Design", lucide: L.PaletteIcon, tone: "pink" },
  pencil: { label: "Pencil", lucide: L.PencilIcon, tone: "orange" },
  trophy: { label: "Trophy", lucide: L.TrophyIcon, tone: "yellow" },
  target: { label: "Target", lucide: L.TargetIcon, tone: "red" },
  globe: { label: "Globe", lucide: L.GlobeIcon, tone: "blue" },
  phone: { label: "Phone", lucide: L.PhoneIcon, tone: "green" },
  cart: { label: "Purchasing", lucide: L.ShoppingCartIcon, tone: "orange" },
  truck: { label: "Delivery", lucide: L.TruckIcon, tone: "teal" },
  wrench: { label: "Tools", lucide: L.WrenchIcon, tone: "slate" },
  school: { label: "Learning", lucide: L.GraduationCapIcon, tone: "blue" },
  book: { label: "Book", lucide: L.BookIcon, tone: "teal" },
  film: { label: "Film", lucide: L.FilmIcon, tone: "red" },
  music: { label: "Music", lucide: L.MusicIcon, tone: "pink" },
  image: { label: "Image", lucide: L.ImageIcon, tone: "green" },
  lock: { label: "Lock", lucide: L.LockIcon, tone: "slate" },
  key: { label: "Key", lucide: L.KeyIcon, tone: "yellow" },
  cloud: { label: "Cloud", lucide: L.CloudIcon, tone: "blue" },
  headset: { label: "Support", lucide: L.HeadsetIcon, tone: "teal" },
  lifebuoy: { label: "Help", lucide: L.LifeBuoyIcon, tone: "red" },
  sprout: { label: "Growth", lucide: L.SproutIcon, tone: "green" },
  coffee: { label: "Break", lucide: L.CoffeeIcon, tone: "orange" },
  pin: { label: "Place", lucide: L.MapPinIcon, tone: "red" },
  tag: { label: "Tag", lucide: L.TagIcon, tone: "purple" },
  receipt: { label: "Receipt", lucide: L.ReceiptIcon, tone: "green" },
  coins: { label: "Money", lucide: L.CoinsIcon, tone: "yellow" },
  handshake: { label: "Partners", lucide: L.HandshakeIcon, tone: "orange" },
};

// From a Lucide icon to its entry (by the icon's own name), so every icon gets its pack twin and colour.
const BY_LUCIDE = new Map<string, string>();
for (const [k, v] of Object.entries(ICONS)) if (v.lucide.displayName && !BY_LUCIDE.has(v.lucide.displayName)) BY_LUCIDE.set(v.lucide.displayName, k);

const ORDER: Tone[] = ["blue", "red", "yellow", "green", "purple", "teal", "orange", "pink"];
export function toneOf(name: string | undefined): Tone {
  if (!name) return "slate";
  const k = BY_LUCIDE.get(name);
  if (k) return ICONS[k]!.tone;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ORDER[h % ORDER.length]!;
}

const keyOf = (icon?: Svg, name?: string | null) => (name && ICONS[name] ? name : icon?.displayName ? BY_LUCIDE.get(icon.displayName) : undefined);
const entryOf = (icon?: Svg, name?: string | null) => ICONS[keyOf(icon, name) ?? ""];

// One icon in every style; CSS (globals.css, data-icon-pack on <html>) shows the chosen one.
export function AppIcon({ icon, name, tone, className }: { icon?: Svg; name?: string | null; tone?: Tone | null; className?: string }) {
  const key = keyOf(icon, name);
  const entry = key ? ICONS[key] : undefined;
  const Lu = (name && ICONS[name]?.lucide) || icon || L.CircleIcon;
  const t: Tone = tone ?? entry?.tone ?? toneOf(Lu.displayName);
  const c = cn("app-icon", TONES[t], className);
  if (!entry || !key) return <Lu className={cn(c, "pk-lucide")} />;
  return (
    <>
      <Lu className={cn(c, "pk-lucide pk-alt")} />
      <PhosphorTwin k={key} className={c} />
    </>
  );
}

// The icon on a soft tile of its own colour (quick actions, cards).
export function IconTile({ icon, name, tone, className, iconClassName }: { icon?: Svg; name?: string | null; tone?: Tone | null; className?: string; iconClassName?: string }) {
  const t: Tone = tone ?? entryOf(icon, name)?.tone ?? toneOf(icon?.displayName);
  return (
    <span className={cn("app-tile flex size-9 shrink-0 items-center justify-center rounded-xl", TILES[t], className)}>
      <AppIcon icon={icon} name={name} tone={t} className={iconClassName} />
    </span>
  );
}
