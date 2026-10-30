import { requireCapability } from "@/server/auth";
import { PageHeader } from "@/components/app/primitives";
import { HrHome, type HrTab } from "@/components/app/hr/hr-home";
import { hrDepartments, hrUpcoming, listEmployees, listEquipment, orgChart } from "@/server/hr";
import { hrLeave, leaveCalendar } from "@/server/leave";
import { HrLeave } from "@/components/app/hr/leave";
import { get } from "@/server/db";
import { can } from "@/server/users";

export const metadata = { title: "HR" };

const TABS: HrTab[] = ["people", "leave", "due", "org", "equipment"];

export default async function HrPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireCapability("hr.access");
  const sp = await searchParams;
  const tab: HrTab = TABS.includes(sp.tab as HrTab) ? (sp.tab as HrTab) : "people";
  const includeLeft = sp.left === "1";
  const [people, departments, due, org, equipment] = await Promise.all([
    listEmployees(viewer, { includeLeft }),
    hrDepartments(),
    hrUpcoming(viewer),
    tab === "org" ? orgChart(viewer) : null,
    tab === "equipment" ? listEquipment(viewer) : null,
  ]);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toISOString().slice(0, 7);
  const [leave, cal, waiting] = await Promise.all([
    tab === "leave" ? hrLeave(viewer) : null,
    tab === "leave" ? leaveCalendar(viewer, month) : null,
    get<{ c: number }>("SELECT COUNT(*) AS c FROM leave_requests WHERE status = 'pending_hr'").then((r) => Number(r?.c ?? 0)),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader help="hr" title="HR" description="Employee records, reporting lines, documents with expiry reminders, and the equipment register." />
      <HrHome
        tab={tab}
        includeLeft={includeLeft}
        people={people}
        departments={departments}
        due={due}
        org={org}
        equipment={equipment}
        leaveWaiting={waiting}
        leave={
          leave &&
          cal && (
            <HrLeave
              {...leave}
              month={month}
              entries={cal.entries}
              people={people.filter((p) => p.status !== "left").map((p) => ({ value: p.id, label: p.name }))}
              canManage={can(viewer, "hr.manage")}
            />
          )
        }
      />
    </div>
  );
}
