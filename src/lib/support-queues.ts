// Call queues (Update 1.2, Phase 9): the settings of a queue beyond its agents, and the routing strategies.

export const QUEUE_STRATEGIES = [
  { key: "least_busy", label: "Least busy agent", help: "The agent with the fewest open conversations first." },
  { key: "round_robin", label: "Round robin", help: "Each agent in turn." },
  { key: "longest_idle", label: "Longest idle agent", help: "The agent who has waited longest since their last call or conversation." },
  { key: "skills", label: "Skill-based", help: "Only agents who have every skill the queue needs (any free agent if none has them)." },
  { key: "priority", label: "Agent priority", help: "Agents in the order they are listed: the first is offered first." },
  { key: "manual", label: "Manual assignment", help: "Nothing is given out automatically: calls ring for every agent of the queue and a lead assigns conversations." },
] as const;
export type QueueStrategy = (typeof QUEUE_STRATEGIES)[number]["key"];
export const STRATEGY_KEYS = QUEUE_STRATEGIES.map((s) => s.key) as readonly string[];

// Callers who match a rule move up the line by its boost (higher waits less).
export type PriorityRule = { when: "verified" | "category" | "tag" | "ticket_priority" | "repeat_caller"; value?: string | null; boost: number };
export const PRIORITY_WHEN: { key: PriorityRule["when"]; label: string; needsValue: boolean }[] = [
  { key: "verified", label: "Signed in through the app", needsValue: false },
  { key: "category", label: "Topic is", needsValue: true },
  { key: "tag", label: "Customer has the tag", needsValue: true },
  { key: "ticket_priority", label: "Conversation priority is", needsValue: true },
  { key: "repeat_caller", label: "Called in the last 24 hours", needsValue: false },
];

// Days are 0 (Sunday) to 6; times are Addis Ababa time.
export type ActiveHours = { days: number[]; from: string; to: string } | null;

export type QueueSettings = {
  id: string;
  name: string;
  department: string | null;
  activeHours: ActiveHours;
  maxSize: number | null;
  maxWaitS: number | null;
  overflowQueue: string | null;
  announcement: string | null;
  music: boolean;
  callbackOffer: boolean;
  autoAssign: boolean;
  priorityRules: PriorityRule[];
  wrapUpS: number;
  skills: string[];
  slSeconds: number;
  // The agent offered a conversation accepts or declines it (otherwise it is simply theirs).
  acceptRequired: boolean;
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Ethiopia keeps UTC+3 all year.
export function addisParts(iso: string) {
  const d = new Date(Date.parse(iso) + 3 * 3600e3).toISOString();
  return { day: new Date(d).getUTCDay(), hm: d.slice(11, 16), date: d.slice(0, 10) };
}

export function openAt(hours: ActiveHours, iso: string) {
  if (!hours) return true;
  const p = addisParts(iso);
  if (!hours.days.includes(p.day)) return false;
  // Hours that pass midnight (for example 20:00 to 02:00) are open until the next morning.
  return hours.from <= hours.to ? p.hm >= hours.from && p.hm < hours.to : p.hm >= hours.from || p.hm < hours.to;
}

export const hoursLabel = (h: ActiveHours) => (h ? `${h.days.map((d) => DAY_NAMES[d]).join(", ")} ${h.from}–${h.to}` : "Always open");
