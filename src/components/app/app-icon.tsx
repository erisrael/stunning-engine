// Colourful icons (Google style): each kind of page keeps its own colour everywhere (Home blue, Attendance green,
// Email red, Calendar blue, Finance green, People purple...), with lighter shades in dark mode. A person can turn
// them back to one colour in the account menu (Corners, text and icons: Icons), kept on that computer.

import * as React from "react";
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

// By the icon's own name, so an icon has the same colour on every page.
const BY_NAME: Record<string, Tone> = {
  House: "blue",
  Clock: "green",
  Timer: "orange",
  CheckCheck: "green",
  ListChecks: "green",
  UserCheck: "teal",
  Users: "purple",
  UsersRound: "purple",
  UserCog: "purple",
  UserPlus: "purple",
  Contact: "purple",
  IdCard: "purple",
  CircleUser: "blue",
  MessageCircleQuestionMark: "orange",
  MessageSquare: "teal",
  MessagesSquare: "teal",
  Mail: "red",
  Inbox: "pink",
  Bell: "yellow",
  ListTree: "blue",
  List: "blue",
  Layers: "teal",
  PackageCheck: "orange",
  Video: "red",
  Calendar: "blue",
  Kanban: "teal",
  FolderKanban: "yellow",
  Sheet: "green",
  Map: "green",
  ChartNoAxesGantt: "purple",
  ChartColumn: "yellow",
  Presentation: "orange",
  GitBranch: "purple",
  Code: "blue",
  FileText: "blue",
  FilePlusCorner: "blue",
  FileQuestionMark: "orange",
  NotebookText: "yellow",
  GalleryVerticalEnd: "pink",
  BookOpen: "teal",
  Calculator: "green",
  Wallet: "green",
  Landmark: "green",
  Briefcase: "orange",
  BuildingComplex: "blue",
  Crown: "yellow",
  Megaphone: "pink",
  Plane: "teal",
  Database: "slate",
  ArrowLeftRight: "teal",
  Eye: "purple",
  ShieldCheck: "blue",
  MonitorSmartphone: "slate",
  Grid3x3: "blue",
  Settings: "slate",
  Settings2: "slate",
  Sparkles: "purple",
};
const ORDER: Tone[] = ["blue", "red", "yellow", "green", "purple", "teal", "orange", "pink"];

export function toneOf(name: string | undefined): Tone {
  if (!name) return "slate";
  const t = BY_NAME[name];
  if (t) return t;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ORDER[h % ORDER.length]!;
}

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

type IconType = React.ComponentType<{ className?: string }> & { displayName?: string };

export function AppIcon({ icon: Icon, tone, className }: { icon: IconType; tone?: Tone; className?: string }) {
  const t = tone ?? toneOf(Icon.displayName);
  return <Icon className={cn("app-icon", TONES[t], className)} />;
}

// The icon on a soft tile of its own colour (quick actions, cards).
export function IconTile({ icon, tone, className, iconClassName }: { icon: IconType; tone?: Tone; className?: string; iconClassName?: string }) {
  const t = tone ?? toneOf(icon.displayName);
  return (
    <span className={cn("app-tile flex size-9 shrink-0 items-center justify-center rounded-xl", TILES[t], className)}>
      <AppIcon icon={icon} tone={t} className={iconClassName} />
    </span>
  );
}
