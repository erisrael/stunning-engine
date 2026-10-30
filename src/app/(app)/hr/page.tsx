import { requireCapability } from "@/server/auth";
import { PageHeader } from "@/components/app/primitives";
import { HrHome, type HrTab } from "@/components/app/hr/hr-home";
import { hrDepartments, hrUpcoming, listEmployees, listEquipment, orgChart } from "@/server/hr";

export const metadata = { title: "HR" };

const TABS: HrTab[] = ["people", "due", "org", "equipment"];

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
  return (
    <div className="space-y-4">
      <PageHeader help="hr" title="HR" description="Employee records, reporting lines, documents with expiry reminders, and the equipment register." />
      <HrHome tab={tab} includeLeft={includeLeft} people={people} departments={departments} due={due} org={org} equipment={equipment} />
    </div>
  );
}
