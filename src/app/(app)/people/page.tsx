import { requireViewer } from "@/server/auth";
import { directory } from "@/server/profiles";
import { PageHeader } from "@/components/app/primitives";
import { PeopleDirectory } from "@/components/app/people-directory";

export const metadata = { title: "People" };

// Everyone in the workspace, searchable by name, headline and skill.
export default async function PeoplePage() {
  await requireViewer();
  return (
    <div className="space-y-4">
      <PageHeader help="me" title="People" description="Find colleagues by name, job or skill, and open their profiles." />
      <PeopleDirectory people={await directory()} />
    </div>
  );
}
