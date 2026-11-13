// Customer support (shared by the server, the desk and the SDK pages): statuses, priorities and the settings.

export const TICKET_STATUSES = ["new", "open", "pending", "on_hold", "solved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = { new: "New", open: "Open", pending: "Waiting on the customer", on_hold: "On hold", solved: "Solved", closed: "Closed" };
// Statuses an agent is expected to act on (counted against their limit of open tickets).
export const OPEN_STATUSES: TicketStatus[] = ["new", "open"];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

export const CHANNEL_LABELS: Record<string, string> = { telegram: "Telegram", web: "Help page", widget: "App chat", call: "App call", phone: "Phone", email: "Email", walk_in: "In person", agent: "Opened by an agent", social: "Social media", api: "API" };

// What a caller hears while waiting for an agent: a spoken message (in the caller's browser, in the language set) or a
// recording Admin uploaded, then quiet hold music; their place in line is said when there is a line.
export type IvrConfig = { on: boolean; message: string; lang: string; audio: string | null; music: boolean; repeatSec: number; position: boolean };
export const DEFAULT_IVR: IvrConfig = {
  on: true,
  message: "Thank you for calling Myseed support. Please stay on the line; the next available agent will be with you shortly.",
  lang: "en-US",
  audio: null,
  music: true,
  repeatSec: 30,
  position: true,
};

export type SupportConfig = {
  ivr: IvrConfig;
  enabled: boolean;
  // Support leads (besides Admin): set up queues, see everything, monitor agents, listen to recordings.
  leads: string[];
  // New tickets go to an available agent at once.
  autoAssign: boolean;
  // Only agents checked in at work (Attendance) are available.
  requireCheckin: boolean;
  recordCalls: boolean;
  recordingNotice: string;
  recordingDays: number;
  // Solved tickets close by themselves after this many days without a reply.
  autoCloseDays: number;
  // A conversation waiting on the customer is solved after this many hours without their reply (0: never).
  inactiveHours: number;
  // A call rings this long before it is missed.
  ringSeconds: number;
  // A call for one agent rings the whole queue after this many seconds, then the overflow queue (when set).
  callEscalateSec: number;
  callOverflowQueue: string | null;
  // Shown in the widget, for example "Monday to Friday, 8:30 to 17:30".
  hours: string;
  awayMessage: string;
  // A mailbox in the app (Email) whose mail becomes tickets, and from which agents' replies go out.
  mailbox: string | null;
  // Customers write to the support Telegram bot (the token is kept sealed, apart from these settings).
  telegram: boolean;
};

export const DEFAULT_SUPPORT: SupportConfig = {
  ivr: DEFAULT_IVR,
  enabled: false,
  leads: [],
  autoAssign: true,
  requireCheckin: false,
  recordCalls: true,
  recordingNotice: "Calls are recorded so we can help you better and train our team. By calling you agree to this.",
  recordingDays: 90,
  autoCloseDays: 7,
  inactiveHours: 72,
  ringSeconds: 45,
  callEscalateSec: 15,
  callOverflowQueue: null,
  hours: "Monday to Friday, 8:30 to 17:30",
  awayMessage: "No one can take your call right now. Leave a message and we will answer as soon as we can.",
  mailbox: null,
  telegram: false,
};
