import { EmptyState } from "@/components/app/primitives";
import { requireViewer } from "@/server/auth";
import { run, nowIso } from "@/server/db";
import { canManageChat, groupMessages, listGroups, membership } from "@/server/chat";
import { getSettings } from "@/server/settings";
import { can, userDirectory } from "@/server/users";
import { ChatClient } from "./chat-client";
import { canContactOwners, ownerIds } from "@/server/departments";

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const viewer = await requireViewer();
  // Conversations and mail are private; View as does not open them.
  if (viewer.previewBy) return <EmptyState title="Private in View as" description={`${viewer.name}'s ${"chat"} is private, so View as does not show it.`} />;
  const { g } = await searchParams;
  const groups = await listGroups(viewer, { includeArchived: canManageChat(viewer) });
  const active = groups.find((x) => x.id === g) ?? null;
  const messages = active ? await groupMessages(active.id, { viewerId: viewer.id }) : [];
  if (active && (await membership(active.id, viewer.id))) {
    await run("UPDATE chat_members SET last_read_at = ? WHERE group_id = ? AND user_id = ?", nowIso(), active.id, viewer.id);
    active.unread = 0;
  }
  const settings = await getSettings();
  return (
    <ChatClient
      key={active?.id ?? "none"}
      viewer={{ id: viewer.id, name: viewer.name, handle: viewer.handle }}
      canManage={canManageChat(viewer)}
      canCreateChannel={can(viewer, "chat.channels")}
      groups={groups}
      activeId={active?.id ?? null}
      initialMessages={messages}
      directory={await (async () => {
        // Owners are listed only for people allowed to contact them (an owner can still start a chat with anyone).
        const owners = canContactOwners(viewer) ? new Set<string>() : await ownerIds();
        return (await userDirectory()).filter((u) => !owners.has(u.id)).map((u) => ({ id: u.id, name: u.name, handle: u.handle, roles: u.roles }));
      })()}
      timezone={settings.workspace.timezone}
    />
  );
}
