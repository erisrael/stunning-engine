import { requireViewer } from "@/server/auth";
import { announceTargets, myAnnouncements } from "@/server/announcements";
import { customDepartments } from "@/server/departments";
import { PageHeader } from "@/components/app/primitives";
import { DEPARTMENT_LABELS, ROLES, ROLE_LABELS } from "@/lib/domain";
import { AnnouncementsClient } from "./announcements-client";

export const metadata = { title: "Announcements" };

// Announcements and policies (Phase 18): everything for this person; authors write new ones and see who has read
// or confirmed.
export default async function Page() {
  const viewer = await requireViewer();
  const [list, targets, custom] = await Promise.all([myAnnouncements(viewer, { includeOld: true }), announceTargets(viewer), customDepartments()]);
  const label = (k: string) => (DEPARTMENT_LABELS as Record<string, string>)[k] ?? custom.find((c) => c.key === k)?.title ?? k;
  return (
    <div className="space-y-4">
      <PageHeader title="Announcements" description="Company and department news, and policies to read and confirm." />
      <AnnouncementsClient
        list={list}
        viewerId={viewer.id}
        canAll={targets.all}
        departments={targets.departments.map((k) => ({ key: k, label: label(k) }))}
        roles={targets.all ? ROLES.map((r) => ({ key: r, label: ROLE_LABELS[r] })) : []}
      />
    </div>
  );
}
