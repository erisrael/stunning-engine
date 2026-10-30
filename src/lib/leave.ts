// Leave vocabulary shared by the server and the client: statuses, default leave types, working-day counting and
// Ethiopian public holidays.

export const LEAVE_STATUSES = ["pending_lead", "pending_hr", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending_lead: "With line manager",
  pending_hr: "With HR",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
};
export const OPEN_LEAVE: LeaveStatus[] = ["pending_lead", "pending_hr", "approved"];

export type LeaveType = {
  key: string;
  label: string;
  paid: boolean;
  // Days a year; null means no limit (for example unpaid leave).
  daysPerYear: number | null;
  // Extra days for every two completed years of service (annual leave).
  serviceBonus: number;
  // Monthly: the year's days build up month by month. Yearly: all available from the start of the year.
  accrual: "yearly" | "monthly";
  needsDocument: boolean;
  active: boolean;
  sort: number;
};

// Defaults from the Ethiopian Labour Proclamation 1156/2019; HR can change them in HR, Leave.
export const DEFAULT_LEAVE_TYPES: LeaveType[] = [
  { key: "annual", label: "Annual leave", paid: true, daysPerYear: 16, serviceBonus: 1, accrual: "monthly", needsDocument: false, active: true, sort: 0 },
  { key: "sick", label: "Sick leave", paid: true, daysPerYear: 30, serviceBonus: 0, accrual: "yearly", needsDocument: true, active: true, sort: 1 },
  { key: "maternity", label: "Maternity leave", paid: true, daysPerYear: 120, serviceBonus: 0, accrual: "yearly", needsDocument: true, active: true, sort: 2 },
  { key: "paternity", label: "Paternity leave", paid: true, daysPerYear: 3, serviceBonus: 0, accrual: "yearly", needsDocument: false, active: true, sort: 3 },
  { key: "compassionate", label: "Compassionate leave", paid: true, daysPerYear: 3, serviceBonus: 0, accrual: "yearly", needsDocument: false, active: true, sort: 4 },
  { key: "marriage", label: "Marriage leave", paid: true, daysPerYear: 3, serviceBonus: 0, accrual: "yearly", needsDocument: false, active: true, sort: 5 },
  { key: "unpaid", label: "Unpaid leave", paid: false, daysPerYear: null, serviceBonus: 0, accrual: "yearly", needsDocument: false, active: true, sort: 6 },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (date: string) => new Date(`${date}T00:00:00Z`);

// Working days between two dates (inclusive), skipping non-working weekdays and public holidays. A half day counts 0.5.
export function countLeaveDays(start: string, end: string, workdays: number[], holidays: string[], halfDay = false) {
  if (!start || !end || end < start) return 0;
  const off = new Set(holidays);
  let days = 0;
  for (let d = utc(start); iso(d) <= end; d = new Date(d.getTime() + 864e5)) if (workdays.includes(d.getUTCDay()) && !off.has(iso(d))) days++;
  return halfDay && start === end && days === 1 ? 0.5 : days;
}

const leap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// Orthodox Easter (Fasika): the Julian computus, moved to the Gregorian calendar (valid 1900 to 2099).
export function orthodoxEaster(year: number) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day + 13));
}

// Ethiopian public holidays that fall in a Gregorian year. The lunar Muslim holidays (Eid al-Fitr, Eid al-Adha and
// Mawlid) are announced each year, so HR adds them by hand.
export function ethiopianHolidays(year: number): { date: string; name: string }[] {
  const easter = orthodoxEaster(year);
  const nextLeap = leap(year + 1);
  return [
    { date: `${year}-01-07`, name: "Ethiopian Christmas (Genna)" },
    { date: `${year}-01-${leap(year) ? "20" : "19"}`, name: "Epiphany (Timket)" },
    { date: `${year}-03-02`, name: "Adwa Victory Day" },
    { date: iso(new Date(easter.getTime() - 2 * 864e5)), name: "Good Friday (Siklet)" },
    { date: iso(easter), name: "Ethiopian Easter (Fasika)" },
    { date: `${year}-05-01`, name: "International Labour Day" },
    { date: `${year}-05-05`, name: "Patriots' Victory Day" },
    { date: `${year}-05-28`, name: "Downfall of the Derg" },
    { date: `${year}-09-${nextLeap ? "12" : "11"}`, name: "Ethiopian New Year (Enkutatash)" },
    { date: `${year}-09-${nextLeap ? "28" : "27"}`, name: "Finding of the True Cross (Meskel)" },
  ].sort((x, y) => x.date.localeCompare(y.date));
}
