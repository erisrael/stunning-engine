import { requireViewer } from "@/server/auth";
import { GroupCallRoom } from "@/components/app/group-call";

export const metadata = { title: "Group call" };

// A group call in its own tab: closing the tab leaves the call.
export default async function GroupCallPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (viewer.previewBy)
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">Calls are paused in View as</h1>
          <p className="text-sm text-muted-foreground">You are viewing the app as {viewer.name}. Leave View as to join this call as yourself.</p>
          <a href="/dashboard" className="text-sm text-primary underline">Back to the app</a>
        </div>
      </div>
    );
  return <GroupCallRoom callId={id} me={{ id: viewer.id, name: viewer.name }} />;
}
