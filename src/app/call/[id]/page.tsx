import { requireViewer } from "@/server/auth";
import { GroupCallRoom } from "@/components/app/group-call";

export const metadata = { title: "Group call" };

// A group call in its own tab: closing the tab leaves the call.
export default async function GroupCallPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  return <GroupCallRoom callId={id} me={{ id: viewer.id, name: viewer.name }} />;
}
