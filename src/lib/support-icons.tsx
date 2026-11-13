// Help-menu icons: monochrome Lucide icons named by key (no emojis anywhere in the product). Old menus saved with
// emojis are read through supportIconKey, so nothing needs a manual fix.
import {
  BookOpenIcon,
  CircleHelpIcon,
  CreditCardIcon,
  GraduationCapIcon,
  HandHelpingIcon,
  HeadphonesIcon,
  type LucideIcon,
  MessageCircleIcon,
  PackageIcon,
  PhoneIcon,
  PlayCircleIcon,
  ReceiptIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UserIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { supportIconKey } from "./support-icon-keys";

export { supportIconKey };

export const SUPPORT_ICONS: Record<string, { label: string; Icon: LucideIcon }> = {
  zap: { label: "Lightning", Icon: ZapIcon },
  help: { label: "Question", Icon: CircleHelpIcon },
  book: { label: "Book", Icon: BookOpenIcon },
  package: { label: "Package", Icon: PackageIcon },
  card: { label: "Card", Icon: CreditCardIcon },
  receipt: { label: "Receipt", Icon: ReceiptIcon },
  user: { label: "Person", Icon: UserIcon },
  phone: { label: "Phone", Icon: SmartphoneIcon },
  call: { label: "Call", Icon: PhoneIcon },
  person: { label: "Helping hand", Icon: HandHelpingIcon },
  agent: { label: "Headset", Icon: HeadphonesIcon },
  chat: { label: "Chat", Icon: MessageCircleIcon },
  video: { label: "Video", Icon: PlayCircleIcon },
  school: { label: "School", Icon: GraduationCapIcon },
  security: { label: "Shield", Icon: ShieldCheckIcon },
  fix: { label: "Wrench", Icon: WrenchIcon },
};


export function SupportIcon({ name, className }: { name: string | null | undefined; className?: string }) {
  const { Icon } = SUPPORT_ICONS[supportIconKey(name)]!;
  return <Icon className={className ?? "size-4"} aria-hidden />;
}
