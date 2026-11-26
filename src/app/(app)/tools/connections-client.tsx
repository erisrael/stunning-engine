"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BotIcon, CalendarIcon, CopyIcon, NotebookIcon, UnplugIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { connectNotionTokenAction, disconnectAppAction, disconnectNotionAction, setNotionParentAction } from "@/app/actions/tools";
import { copyText } from "@/components/app/tools/shared";

type Notion = { connected: false; oauth: boolean } | { connected: true; oauth: boolean; workspace: string | null; parentPageId: string | null; parentTitle: string | null; via: string; since: string };
type App = { client_id: string; name: string; kind: string; since: string; last_used: string | null };

function Copyable({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex gap-1">
      <Input readOnly value={value} className="h-8 font-mono text-xs" aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <Button size="icon" variant="outline" className="size-8" aria-label={`Copy ${label}`} onClick={() => copyText(value, "Copied")}>
        <CopyIcon />
      </Button>
    </div>
  );
}

export function ConnectionsClient({ features, origin, feed, notion: initialNotion, apps: initialApps, notice, calendarApp }: { features: string[]; origin: string; feed: { url: string; expired: boolean } | null; notion: Notion | null; apps: App[]; notice: string | null; calendarApp: boolean }) {
  const [notion, setNotion] = React.useState(initialNotion);
  const [apps, setApps] = React.useState(initialApps);
  const [token, setToken] = React.useState("");
  const [page, setPage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (notice === "connected") toast.success("Notion connected");
    else if (notice === "failed") toast.error("Notion did not connect. Try again.");
    else if (notice === "not-configured") toast.error("Connect with Notion is not set up; paste an integration secret instead.");
  }, [notice]);

  return (
    <section id="connections" className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Connections</h2>
        <p className="text-sm text-muted-foreground">Optional. Each connection works only for you and can be turned off at any time.</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {features.includes("ics") && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarIcon className="size-4" /> Calendar subscription (.ics)
              </CardTitle>
              <CardDescription className="text-xs">Your reminders and dated tasks in Google Calendar, Outlook or Apple Calendar.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {feed ? <Copyable value={feed.url} label="calendar link" /> : <p className="text-muted-foreground">No link yet.</p>}
              {calendarApp && (
                <Link href="/tools/calendar#subscribe" className="mt-2 inline-block text-xs underline">
                  {feed ? "Manage the link" : "Make your private link"}
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {features.includes("notion") && notion && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <NotebookIcon className="size-4" /> Notion
              </CardTitle>
              <CardDescription className="text-xs">Send notes and documents to your own Notion workspace. Markdown and CSV downloads work without it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {notion.connected ? (
                <>
                  <p>
                    Connected{notion.workspace ? ` to ${notion.workspace}` : ""}. Notes go under <b>{notion.parentTitle ?? "a page you choose"}</b>.
                  </p>
                  <div className="flex gap-1">
                    <Input value={page} onChange={(e) => setPage(e.target.value)} placeholder="Another Notion page link" className="h-8 text-xs" aria-label="Notion page link" />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!page || busy}
                      onClick={async () => {
                        setBusy(true);
                        const r = await setNotionParentAction(page);
                        setBusy(false);
                        if (!r.ok) return toast.error(r.error);
                        setNotion(r.data as Notion);
                        setPage("");
                      }}
                    >
                      Use
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      const r = await disconnectNotionAction();
                      if (!r.ok) return toast.error(r.error);
                      setNotion({ connected: false, oauth: notion.oauth });
                    }}
                  >
                    <UnplugIcon /> Disconnect
                  </Button>
                </>
              ) : (
                <>
                  {notion.oauth && (
                    <Button size="sm" asChild>
                      <a href="/api/tools/notion/start">Connect with Notion</a>
                    </Button>
                  )}
                  <details open={!notion.oauth}>
                    <summary className="cursor-pointer text-xs text-muted-foreground">{notion.oauth ? "Or paste an integration secret" : "Connect with an integration secret"}</summary>
                    <ol className="my-2 list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                      <li>
                        At{" "}
                        <a className="underline" href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer">
                          notion.so/my-integrations
                        </a>{" "}
                        make an internal integration and copy its secret.
                      </li>
                      <li>In Notion, open the page your notes should go under, ••• menu, Connections, add the integration.</li>
                      <li>Paste the secret and that page&apos;s link here.</li>
                    </ol>
                    <div className="space-y-1">
                      <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ntn_…" className="h-8 text-xs" aria-label="Integration secret" autoComplete="off" />
                      <Input value={page} onChange={(e) => setPage(e.target.value)} placeholder="https://www.notion.so/…" className="h-8 text-xs" aria-label="Notion page link" />
                      <Button
                        size="sm"
                        disabled={!token || !page || busy}
                        onClick={async () => {
                          setBusy(true);
                          const r = await connectNotionTokenAction({ token, page });
                          setBusy(false);
                          if (!r.ok) return toast.error(r.error);
                          setNotion(r.data as Notion);
                          setToken("");
                          setPage("");
                          toast.success("Notion connected");
                        }}
                      >
                        Connect
                      </Button>
                    </div>
                  </details>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {features.includes("mcp") && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BotIcon className="size-4" /> Claude (MCP connector)
              </CardTitle>
              <CardDescription className="text-xs">Let your own Claude account read your notes and reminders, add checklist items and look up production codes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ol className="list-decimal space-y-0.5 pl-5 text-xs text-muted-foreground">
                <li>In Claude: Settings, Connectors, Add custom connector.</li>
                <li>Paste this address, then sign in to Myseed and press Allow.</li>
              </ol>
              <Copyable value={`${origin}/api/mcp`} label="MCP server address" />
            </CardContent>
          </Card>
        )}

        {features.includes("gpt") && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BotIcon className="size-4" /> ChatGPT (Custom GPT actions)
              </CardTitle>
              <CardDescription className="text-xs">Use the company&apos;s Myseed GPT, or build one: Configure, Actions, Import from URL, then OAuth with the client from Admin.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Copyable value={`${origin}/api/v1/gpt/schema.json`} label="OpenAPI schema address" />
              <p className="text-xs text-muted-foreground">
                Authorization URL <code>{origin}/oauth/authorize</code>, token URL <code>{origin}/api/oauth/token</code>, scope <code>tools</code>.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {(features.includes("mcp") || features.includes("gpt")) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Apps connected to your account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {apps.map((a) => (
              <div key={a.client_id} className="flex items-center gap-2">
                <span className="flex-1">
                  {a.name} <span className="text-xs text-muted-foreground">({a.kind === "gpt" ? "ChatGPT" : "MCP"}, since {new Date(a.since).toLocaleDateString()}{a.last_used ? `, last used ${new Date(a.last_used).toLocaleString()}` : ""})</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const r = await disconnectAppAction(a.client_id);
                    if (!r.ok) return toast.error(r.error);
                    setApps(apps.filter((x) => x.client_id !== a.client_id));
                    toast.success(`${a.name} disconnected`);
                  }}
                >
                  <UnplugIcon /> Disconnect
                </Button>
              </div>
            ))}
            {!apps.length && <p className="text-muted-foreground">None.</p>}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
