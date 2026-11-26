import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { clientById, mayConnect, redirectAllowed } from "@/server/oauth";
import { AuthShell } from "../../login/auth-shell";
import { Button } from "@/components/ui/button";
import { approveAction, denyAction } from "./actions";

export const metadata = { title: "Connect an app" };

type Q = Record<string, string | undefined>;

// The consent screen for Claude (MCP) and ChatGPT (actions): the person signs in, sees what the app may do, and
// allows or denies it. Nothing is granted without this screen.
export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const qs = new URLSearchParams(Object.entries(q).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
  const client = q.client_id ? await clientById(q.client_id) : null;
  if (!client || !q.redirect_uri || !redirectAllowed(client, q.redirect_uri) || q.response_type !== "code")
    return (
      <AuthShell title="This link is not valid" subtitle="The app that sent you here is unknown, or its return address is not allowed.">
        <p className="text-sm text-muted-foreground">Start connecting again from Claude or ChatGPT. If it keeps happening, ask Admin.</p>
      </AuthShell>
    );
  if (viewer.previewBy)
    return (
      <AuthShell title="Leave View as first" subtitle="Apps connect to your own account only.">
        <p className="text-sm text-muted-foreground">Exit View as at the top of the app, then try again.</p>
      </AuthShell>
    );
  const allowed = await mayConnect(viewer, client);
  const host = new URL(q.redirect_uri).host;
  return (
    <AuthShell title={`Connect ${client.name}`} subtitle={`${client.name} (${host}) wants to use your Myseed Tools hub as ${viewer.name}.`}>
      {allowed ? (
        <div className="space-y-4">
          <div className="rounded-md border p-3 text-sm">
            <p className="font-medium">It will be able to</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>read your own notes, tasks and reminders</li>
              <li>create notes and add checklist items</li>
              <li>look up production records by code, title or teacher, only those you can already see</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">It cannot see anyone else&apos;s notes, change production work, or act outside your Tools hub. Disconnect it any time in Tools, Connections.</p>
          </div>
          <div className="flex gap-2">
            <form action={approveAction} className="flex-1">
              <input type="hidden" name="q" value={qs} />
              <Button type="submit" className="w-full">
                Allow
              </Button>
            </form>
            <form action={denyAction} className="flex-1">
              <input type="hidden" name="q" value={qs} />
              <Button type="submit" variant="outline" className="w-full">
                Deny
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Admin has not switched this connection on for your role (Admin, Tools hub).</p>
          <form action={denyAction}>
            <input type="hidden" name="q" value={qs} />
            <Button type="submit" variant="outline">
              Go back
            </Button>
          </form>
        </div>
      )}
    </AuthShell>
  );
}
