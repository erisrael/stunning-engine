import { get } from "./db";
import { attendanceConfig } from "./attendance";
import { captureConfig } from "./attendance-capture";
import { geofenceConfig } from "./geofence";

// Attendance setup, step by step (Update 1.0, phase 7): each step says whether it is done, from what is saved.
export type AttStep = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string; tab: string };

export async function attendanceSetupSteps(): Promise<AttStep[]> {
  const [cfg, cap, geo] = await Promise.all([attendanceConfig(), captureConfig(), geofenceConfig()]);
  const people = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM employees WHERE status <> 'left'"))?.n ?? 0);
  const assigned = Number((await get<{ n: number }>("SELECT COUNT(DISTINCT a.employee_id) AS n FROM att_shift_assign a JOIN employees e ON e.id = a.employee_id WHERE e.status <> 'left'"))?.n ?? 0);
  const rulesSaved = !!(await get("SELECT 1 AS x FROM settings WHERE key = 'cfg.attendance.rules'"));
  const kiosks = await get<{ n: number; paired: number }>("SELECT COUNT(*) AS n, SUM(CASE WHEN token_hash IS NOT NULL THEN 1 ELSE 0 END) AS paired FROM att_kiosks WHERE active = 1");
  const located = cap.sites.filter((s) => s.lat !== null && s.lng !== null);
  const networks = cap.sites.filter((s) => s.networks.length);
  const anyMethod = cfg.methods.anywhere || cfg.methods.kiosk || cfg.methods.mobile || cap.methods.qr || cap.methods.network || cap.methods.shared;
  const nKiosk = Number(kiosks?.n ?? 0);
  const nPaired = Number(kiosks?.paired ?? 0);
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return [
    {
      key: "shifts",
      label: "1. Shifts",
      tab: "setup",
      status: !cfg.shifts.length ? "fail" : people && assigned < people ? "warn" : "ok",
      detail: !cfg.shifts.length ? "No shifts yet." : `${plural(cfg.shifts.length, "shift")}; default ${cfg.shifts.find((s) => s.key === cfg.defaultShift)?.label ?? cfg.defaultShift}. ${assigned} of ${people} people have their own shift, the rest use the default.`,
    },
    { key: "rules", label: "2. Rules", tab: "rules", status: rulesSaved ? "ok" : "warn", detail: rulesSaved ? "Late, absence and correction rules are saved." : "The default rules are in use. Open Rules to check them." },
    {
      key: "sites",
      label: "3. Offices and geofence",
      tab: "capture",
      status: !cap.sites.length ? "fail" : located.length < cap.sites.length ? "warn" : "ok",
      detail: !cap.sites.length ? "No office yet." : `${located.length} of ${cap.sites.length} offices are on the map${geo.mode === "off" ? "; leaving the site is not watched" : `; leaving the site: ${geo.mode.replace(/_/g, " ")}`}.`,
    },
    {
      key: "network",
      label: "4. Office network",
      tab: "capture",
      status: !cap.methods.network ? "ok" : networks.length ? "ok" : "fail",
      detail: !cap.methods.network ? "Network check-in is off." : networks.length ? `${networks.length} of ${cap.sites.length} offices know their network.` : "Network check-in is on but no office network is saved.",
    },
    {
      key: "kiosk",
      label: "5. Kiosks",
      tab: "capture",
      status: !cfg.methods.kiosk ? "ok" : !nKiosk ? "fail" : nPaired < nKiosk ? "warn" : "ok",
      detail: !cfg.methods.kiosk ? "Kiosk check-in is off." : !nKiosk ? "Kiosk check-in is on but no kiosk is added." : `${nPaired} of ${plural(nKiosk, "kiosk")} paired.`,
    },
    {
      key: "methods",
      label: "6. Ways to check in",
      tab: "capture",
      status: anyMethod ? "ok" : "fail",
      detail: anyMethod
        ? [cfg.methods.mobile && "phone at the office", cfg.methods.kiosk && "kiosk", cfg.methods.face && "face", cap.methods.qr && "printed QR", cap.methods.network && "office network", cfg.methods.anywhere && "app anywhere"].filter(Boolean).join(", ")
        : "No way to check in is on.",
    },
  ];
}
