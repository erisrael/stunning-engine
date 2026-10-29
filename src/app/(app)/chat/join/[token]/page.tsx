import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { get, nowIso, run } from "@/server/db";
import { EmptyState } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Join chat" };

// Invite links: anyone signed in who opens one joins the group or channel as a member.
export default async function JoinChatPage({ params }: { params: Promise<{ token: string }> }) {
  const viewer = await requireViewer();
  const { token } = await params;
  const g = await get<{ id: string; kind: string; archived: number }>("SELECT id, kind, archived FROM chat_groups WHERE invite_token = ?", token);
  if (!g || g.archived || g.kind === "direct")
    return (
      <EmptyState
        title="This invitation is not valid any more"
        description="Ask the group or channel admin for a new link."
        action={
          <Button asChild size="sm">
            <Link href="/chat">Open Chat</Link>
          </Button>
        }
      />
    );
  await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'member', ?) ON CONFLICT DO NOTHING", g.id, viewer.id, nowIso());
  redirect(`/chat?g=${g.id}`);
}
