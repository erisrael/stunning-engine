// Recognition (shared by the server and the pages): the parts of the score, the badges, kudos and the settings.
// The scoring itself is in src/server/recognition.ts.

export type Part = "attendance" | "delivery" | "quality" | "collaboration";
export const PARTS: Part[] = ["attendance", "delivery", "quality", "collaboration"];
export const PART_LABELS: Record<Part, string> = { attendance: "Attendance", delivery: "Delivery", quality: "Quality", collaboration: "Teamwork" };

export const BADGES = {
  top_performer: { label: "Top performer", icon: "trophy", description: "The highest score of the month." },
  dept_star: { label: "Department star", icon: "star", description: "The highest score in their department (three people or more)." },
  rising_star: { label: "Rising star", icon: "trending-up", description: "The biggest rise over the month before (10 points or more)." },
  perfect_attendance: { label: "Perfect attendance", icon: "calendar-check", description: "Every working day on time, no absence (10 days or more)." },
  on_time: { label: "Always on time", icon: "clock", description: "Five or more pieces of work finished, all by their due date." },
  zero_defects: { label: "Zero returns", icon: "shield-check", description: "Five or more pieces of work finished, none sent back." },
  team_player: { label: "Team player", icon: "handshake", description: "Three or more kudos from colleagues in the month." },
} as const;
export type BadgeKey = keyof typeof BADGES;

export const KUDOS_VALUES = { helpful: "Helpful", quality: "Great work", fast: "Quick turnaround", initiative: "Initiative", teamwork: "Teamwork", customer: "Customer care" } as const;

export type RecognitionConfig = {
  enabled: boolean;
  // Who sees the leaderboard: everyone (top and their own place) or only HR, Admin and owners.
  leaderboard: "everyone" | "managers" | "off";
  topN: number;
  // Everyone sees the scores on the board, or only the order.
  showScores: boolean;
  weights: Record<Part, number>;
  badges: Record<BadgeKey, boolean>;
  kudos: boolean;
  // Kudos a person can give in a month.
  kudosPerMonth: number;
};

export const DEFAULT_RECOGNITION: RecognitionConfig = {
  enabled: false,
  leaderboard: "everyone",
  topN: 10,
  showScores: true,
  weights: { attendance: 30, delivery: 40, quality: 20, collaboration: 10 },
  badges: Object.fromEntries(Object.keys(BADGES).map((k) => [k, true])) as Record<BadgeKey, boolean>,
  kudos: true,
  kudosPerMonth: 10,
};


export type ScoreRow = {
  userId: string;
  name: string;
  department: string | null;
  score: number;
  parts: Partial<Record<Part, number>>;
  facts: { finished: number; onTime: number; withDue: number; returns: number; kudos: number; late: number; absent: number; workdays: number };
  rank: number;
  previous: number | null;
};

export type AwardRow = { id: string; userId: string; name: string; badge: string; title: string; period: string; reason: string | null; auto: boolean; created_at: string };
