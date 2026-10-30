import { requireCapability } from "@/server/auth";
import { PageHeader } from "@/components/app/primitives";
import { HrHome } from "@/components/app/hr/hr-home";
import { HR_TABS, type HrTab } from "@/lib/hr";
import { hrDepartments, hrUpcoming, listEmployees, listEquipment, orgChart } from "@/server/hr";
import { hrLeave, leaveCalendar } from "@/server/leave";
import { checklistTemplates, listApplicants, listOpenings, openChecklists } from "@/server/hr-hiring";
import { hrReport, listCases, listCourses, listCycles } from "@/server/hr-growth";
import { HrLeave } from "@/components/app/hr/leave";
import { Hiring, Lifecycle } from "@/components/app/hr/hiring";
import { Cases, Performance, Reports, Training } from "@/components/app/hr/growth";
import { all, get } from "@/server/db";
import { can } from "@/server/users";

export const metadata = { title: "HR" };

const count = (sql: string) => get<{ c: number }>(sql).then((r) => Number(r?.c ?? 0));

export default async function HrPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireCapability("hr.access");
  const sp = await searchParams;
  const showCases = can(viewer, "hr.cases");
  let tab: HrTab = HR_TABS.includes(sp.tab as HrTab) ? (sp.tab as HrTab) : "people";
  if (tab === "cases" && !showCases) tab = "people";
  const includeLeft = sp.left === "1";
  const [people, departments, due, org, equipment] = await Promise.all([
    listEmployees(viewer, { includeLeft }),
    hrDepartments(),
    hrUpcoming(viewer),
    tab === "org" ? orgChart(viewer) : null,
    tab === "equipment" ? listEquipment(viewer) : null,
  ]);
  const [leaveWaiting, lifecycleOpen, applicantsActive] = await Promise.all([
    count("SELECT COUNT(*) AS c FROM leave_requests WHERE status = 'pending_hr'"),
    count("SELECT COUNT(*) AS c FROM employee_checklists WHERE status = 'open'"),
    count("SELECT COUNT(*) AS c FROM applicants a JOIN job_openings o ON o.id = a.opening_id WHERE o.status = 'open' AND a.stage IN ('applied','screening','interview','offer')"),
  ]);
  const current = people.filter((p) => p.status !== "left").map((p) => ({ value: p.id, label: p.name }));
  const deptOpts = departments.map((d) => ({ value: d.key, label: d.label }));
  const manage = can(viewer, "hr.manage");

  let panel: React.ReactNode = null;
  if (tab === "leave") {
    const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toISOString().slice(0, 7);
    const [leave, cal] = await Promise.all([hrLeave(viewer), leaveCalendar(viewer, month)]);
    panel = <HrLeave {...leave} month={month} entries={cal.entries} people={current} canManage={manage} />;
  } else if (tab === "hiring") {
    const openings = await listOpenings(viewer);
    const selected = openings.find((o) => o.id === sp.job)?.id ?? openings.find((o) => o.status === "open")?.id ?? openings[0]?.id ?? null;
    const users = (await all<{ id: string; name: string }>("SELECT id, name FROM users WHERE active = 1 ORDER BY name")).map((u) => ({ value: u.id, label: u.name }));
    panel = (
      <Hiring
        openings={openings}
        selected={selected}
        applicants={selected ? await listApplicants(viewer, selected) : null}
        departments={deptOpts}
        managers={current}
        users={users}
        canGivePrivileged={can(viewer, "users.manage")}
      />
    );
  } else if (tab === "lifecycle") {
    panel = <Lifecycle lists={await openChecklists(viewer)} templates={await checklistTemplates()} canManage={manage} />;
  } else if (tab === "performance") {
    panel = <Performance cycles={await listCycles(viewer)} departments={deptOpts} canManage={manage} />;
  } else if (tab === "training") {
    panel = <Training courses={await listCourses(viewer)} people={current} />;
  } else if (tab === "cases") {
    panel = <Cases cases={await listCases(viewer)} people={current} />;
  } else if (tab === "reports") {
    const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : new Date().getUTCFullYear();
    panel = <Reports report={await hrReport(viewer, year)} departments={deptOpts} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader help="hr" title="HR" description="People, leave, hiring, joiners and leavers, performance, training and reports." />
      <HrHome
        tab={tab}
        includeLeft={includeLeft}
        people={people}
        departments={departments}
        due={due}
        org={org}
        equipment={equipment}
        badges={{ leave: leaveWaiting, hiring: applicantsActive, lifecycle: lifecycleOpen }}
        showCases={showCases}
        panel={panel}
      />
    </div>
  );
}
