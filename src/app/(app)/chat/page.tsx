import { requireViewer } from "@/server/auth";
import { run, nowIso } from "@/server/db";
import { canManageChat, groupMessages, listGroups, membership } from "@/server/chat";
import { getSettings } from "@/server/settings";
import { can, userDirectory } from "@/server/users";
import { ChatClient } from "./chat-client";

export const metadata = { title: "Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const viewer = await requireViewer();
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
      directory={(await userDirectory()).map((u) => ({ id: u.id, name: u.name, handle: u.handle, roles: u.roles }))}
      timezone={settings.workspace.timezone}
    />
  );
}
