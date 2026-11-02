// Icons for the sidebar and quick actions, in the person's chosen style (account menu, Corners, text and icons):
// - colourful (Google style): each kind of page keeps its own colour everywhere, lighter in dark mode; or one colour;
// - the pack: Lucide outline (thin, regular or bold strokes), or Phosphor filled or duotone;
// - Admin (Admin, Branding) can give a sidebar entry another icon from the pack below and another colour.
// Every style is drawn on the server and the browser shows the chosen one (no flash, nothing loaded later).

import * as React from "react";
import * as L from "lucide-react";
import * as P from "@phosphor-icons/react/ssr";
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
type PhSvg = React.ComponentType<{ className?: string; weight?: "fill" | "duotone" }>;

// The icon pack: each icon in Lucide and Phosphor, with its usual colour. Keys are what Admin saves.
export const ICONS: Record<string, { label: string; lucide: Svg; ph: PhSvg; tone: Tone }> = {
  home: { label: "Home", lucide: L.HomeIcon, ph: P.HouseIcon, tone: "blue" },
  clock: { label: "Clock", lucide: L.ClockIcon, ph: P.ClockIcon, tone: "green" },
  timer: { label: "Timer", lucide: L.TimerIcon, ph: P.TimerIcon, tone: "orange" },
  checks: { label: "Approvals", lucide: L.CheckCheckIcon, ph: P.ChecksIcon, tone: "green" },
  checklist: { label: "Checklist", lucide: L.ListChecksIcon, ph: P.ListChecksIcon, tone: "green" },
  userCheck: { label: "Person, checked", lucide: L.UserCheckIcon, ph: P.UserCheckIcon, tone: "teal" },
  users: { label: "People", lucide: L.UsersIcon, ph: P.UsersIcon, tone: "purple" },
  team: { label: "Team", lucide: L.UsersRoundIcon, ph: P.UsersThreeIcon, tone: "purple" },
  userCog: { label: "Admin", lucide: L.UserCogIcon, ph: P.UserGearIcon, tone: "purple" },
  userPlus: { label: "Add person", lucide: L.UserPlusIcon, ph: P.UserPlusIcon, tone: "purple" },
  contact: { label: "Contacts", lucide: L.ContactIcon, ph: P.AddressBookIcon, tone: "purple" },
  idCard: { label: "ID card", lucide: L.IdCardIcon, ph: P.IdentificationCardIcon, tone: "purple" },
  profile: { label: "Profile", lucide: L.CircleUserIcon, ph: P.UserCircleIcon, tone: "blue" },
  question: { label: "Question", lucide: L.MessageCircleQuestionIcon, ph: P.QuestionIcon, tone: "orange" },
  chat: { label: "Chat", lucide: L.MessageSquareIcon, ph: P.ChatIcon, tone: "teal" },
  chats: { label: "Conversations", lucide: L.MessagesSquareIcon, ph: P.ChatsIcon, tone: "teal" },
  mail: { label: "Email", lucide: L.MailIcon, ph: P.EnvelopeSimpleIcon, tone: "red" },
  inbox: { label: "Inbox", lucide: L.InboxIcon, ph: P.TrayIcon, tone: "pink" },
  bell: { label: "Bell", lucide: L.BellIcon, ph: P.BellIcon, tone: "yellow" },
  tree: { label: "Overview", lucide: L.ListTreeIcon, ph: P.TreeStructureIcon, tone: "blue" },
  list: { label: "List", lucide: L.ListIcon, ph: P.ListIcon, tone: "blue" },
  layers: { label: "Layers", lucide: L.LayersIcon, ph: P.StackIcon, tone: "teal" },
  package: { label: "Package", lucide: L.PackageCheckIcon, ph: P.PackageIcon, tone: "orange" },
  video: { label: "Video", lucide: L.VideoIcon, ph: P.VideoCameraIcon, tone: "red" },
  calendar: { label: "Calendar", lucide: L.CalendarIcon, ph: P.CalendarIcon, tone: "blue" },
  kanban: { label: "Board", lucide: L.KanbanIcon, ph: P.KanbanIcon, tone: "teal" },
  folder: { label: "Folder", lucide: L.FolderKanbanIcon, ph: P.FolderIcon, tone: "yellow" },
  sheet: { label: "Sheet", lucide: L.SheetIcon, ph: P.TableIcon, tone: "green" },
  map: { label: "Map", lucide: L.MapIcon, ph: P.MapTrifoldIcon, tone: "green" },
  gantt: { label: "Timeline", lucide: L.GanttChartIcon, ph: P.ChartBarHorizontalIcon, tone: "purple" },
  chart: { label: "Chart", lucide: L.ChartColumnIcon, ph: P.ChartBarIcon, tone: "yellow" },
  presentation: { label: "Presentation", lucide: L.PresentationIcon, ph: P.PresentationChartIcon, tone: "orange" },
  branch: { label: "Code branch", lucide: L.GitBranchIcon, ph: P.GitBranchIcon, tone: "purple" },
  code: { label: "Code", lucide: L.CodeIcon, ph: P.CodeIcon, tone: "blue" },
  file: { label: "Document", lucide: L.FileTextIcon, ph: P.FileTextIcon, tone: "blue" },
  filePlus: { label: "New document", lucide: L.FilePlus2Icon, ph: P.FilePlusIcon, tone: "blue" },
  fileQuestion: { label: "Question bank", lucide: L.FileQuestionIcon, ph: P.QuestionIcon, tone: "orange" },
  notebook: { label: "Notebook", lucide: L.NotebookTextIcon, ph: P.NotebookIcon, tone: "yellow" },
  cards: { label: "Cards", lucide: L.GalleryVerticalEndIcon, ph: P.CardsIcon, tone: "pink" },
  bookOpen: { label: "Open book", lucide: L.BookOpenIcon, ph: P.BookOpenIcon, tone: "teal" },
  calculator: { label: "Calculator", lucide: L.CalculatorIcon, ph: P.CalculatorIcon, tone: "green" },
  wallet: { label: "Wallet", lucide: L.WalletIcon, ph: P.WalletIcon, tone: "green" },
  bank: { label: "Finance", lucide: L.LandmarkIcon, ph: P.BankIcon, tone: "green" },
  briefcase: { label: "Department", lucide: L.BriefcaseIcon, ph: P.BriefcaseIcon, tone: "orange" },
  building: { label: "Company", lucide: L.Building2Icon, ph: P.BuildingsIcon, tone: "blue" },
  crown: { label: "Owners", lucide: L.CrownIcon, ph: P.CrownIcon, tone: "yellow" },
  megaphone: { label: "Marketing", lucide: L.MegaphoneIcon, ph: P.MegaphoneIcon, tone: "pink" },
  plane: { label: "Travel", lucide: L.PlaneIcon, ph: P.AirplaneIcon, tone: "teal" },
  database: { label: "Data", lucide: L.DatabaseIcon, ph: P.DatabaseIcon, tone: "slate" },
  arrows: { label: "Import and export", lucide: L.ArrowLeftRightIcon, ph: P.ArrowsLeftRightIcon, tone: "teal" },
  eye: { label: "View", lucide: L.EyeIcon, ph: P.EyeIcon, tone: "purple" },
  shield: { label: "Security", lucide: L.ShieldCheckIcon, ph: P.ShieldCheckIcon, tone: "blue" },
  devices: { label: "Devices", lucide: L.MonitorSmartphoneIcon, ph: P.DevicesIcon, tone: "slate" },
  grid: { label: "Grid", lucide: L.GridIcon, ph: P.GridFourIcon, tone: "blue" },
  settings: { label: "Settings", lucide: L.SettingsIcon, ph: P.GearIcon, tone: "slate" },
  sliders: { label: "Configure", lucide: L.Settings2Icon, ph: P.SlidersHorizontalIcon, tone: "slate" },
  sparkles: { label: "Sparkles", lucide: L.SparklesIcon, ph: P.SparkleIcon, tone: "purple" },
  rocket: { label: "Rocket", lucide: L.RocketIcon, ph: P.RocketIcon, tone: "orange" },
  star: { label: "Star", lucide: L.StarIcon, ph: P.StarIcon, tone: "yellow" },
  heart: { label: "Heart", lucide: L.HeartIcon, ph: P.HeartIcon, tone: "red" },
  flag: { label: "Flag", lucide: L.FlagIcon, ph: P.FlagIcon, tone: "red" },
  zap: { label: "Lightning", lucide: L.ZapIcon, ph: P.LightningIcon, tone: "yellow" },
  camera: { label: "Camera", lucide: L.CameraIcon, ph: P.CameraIcon, tone: "slate" },
  mic: { label: "Microphone", lucide: L.MicIcon, ph: P.MicrophoneIcon, tone: "red" },
  palette: { label: "Design", lucide: L.PaletteIcon, ph: P.PaletteIcon, tone: "pink" },
  pencil: { label: "Pencil", lucide: L.PencilIcon, ph: P.PencilIcon, tone: "orange" },
  trophy: { label: "Trophy", lucide: L.TrophyIcon, ph: P.TrophyIcon, tone: "yellow" },
  target: { label: "Target", lucide: L.TargetIcon, ph: P.TargetIcon, tone: "red" },
  globe: { label: "Globe", lucide: L.GlobeIcon, ph: P.GlobeIcon, tone: "blue" },
  phone: { label: "Phone", lucide: L.PhoneIcon, ph: P.PhoneIcon, tone: "green" },
  cart: { label: "Purchasing", lucide: L.ShoppingCartIcon, ph: P.ShoppingCartIcon, tone: "orange" },
  truck: { label: "Delivery", lucide: L.TruckIcon, ph: P.TruckIcon, tone: "teal" },
  wrench: { label: "Tools", lucide: L.WrenchIcon, ph: P.WrenchIcon, tone: "slate" },
  school: { label: "Learning", lucide: L.GraduationCapIcon, ph: P.GraduationCapIcon, tone: "blue" },
  book: { label: "Book", lucide: L.BookIcon, ph: P.BookIcon, tone: "teal" },
  film: { label: "Film", lucide: L.FilmIcon, ph: P.FilmStripIcon, tone: "red" },
  music: { label: "Music", lucide: L.MusicIcon, ph: P.MusicNoteIcon, tone: "pink" },
  image: { label: "Image", lucide: L.ImageIcon, ph: P.ImageIcon, tone: "green" },
  lock: { label: "Lock", lucide: L.LockIcon, ph: P.LockIcon, tone: "slate" },
  key: { label: "Key", lucide: L.KeyIcon, ph: P.KeyIcon, tone: "yellow" },
  cloud: { label: "Cloud", lucide: L.CloudIcon, ph: P.CloudIcon, tone: "blue" },
  headset: { label: "Support", lucide: L.HeadsetIcon, ph: P.HeadsetIcon, tone: "teal" },
  lifebuoy: { label: "Help", lucide: L.LifeBuoyIcon, ph: P.LifebuoyIcon, tone: "red" },
  sprout: { label: "Growth", lucide: L.SproutIcon, ph: P.PlantIcon, tone: "green" },
  coffee: { label: "Break", lucide: L.CoffeeIcon, ph: P.CoffeeIcon, tone: "orange" },
  pin: { label: "Place", lucide: L.MapPinIcon, ph: P.MapPinIcon, tone: "red" },
  tag: { label: "Tag", lucide: L.TagIcon, ph: P.TagIcon, tone: "purple" },
  receipt: { label: "Receipt", lucide: L.ReceiptIcon, ph: P.ReceiptIcon, tone: "green" },
  coins: { label: "Money", lucide: L.CoinsIcon, ph: P.CoinsIcon, tone: "yellow" },
  handshake: { label: "Partners", lucide: L.HandshakeIcon, ph: P.HandshakeIcon, tone: "orange" },
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

const entryOf = (icon?: Svg, name?: string | null) => (name && ICONS[name] ? ICONS[name] : icon?.displayName ? ICONS[BY_LUCIDE.get(icon.displayName) ?? ""] : undefined);

// One icon in every style; CSS (globals.css, data-icon-pack on <html>) shows the chosen one.
export function AppIcon({ icon, name, tone, className }: { icon?: Svg; name?: string | null; tone?: Tone | null; className?: string }) {
  const entry = entryOf(icon, name);
  const Lu = (name && ICONS[name]?.lucide) || icon || L.CircleIcon;
  const t: Tone = tone ?? entry?.tone ?? toneOf(Lu.displayName);
  const c = cn("app-icon", TONES[t], className);
  if (!entry) return <Lu className={cn(c, "pk-lucide")} />;
  const Ph = entry.ph;
  return (
    <>
      <Lu className={cn(c, "pk-lucide pk-alt")} />
      <Ph className={cn(c, "pk-fill")} weight="fill" />
      <Ph className={cn(c, "pk-duo")} weight="duotone" />
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
