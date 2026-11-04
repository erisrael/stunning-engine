"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/app/brand-mark";
import { saveIdentityAction } from "@/app/actions/identity";
import type { Identity } from "@/server/identity";

const read = (f: File) =>
  new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(f);
  });

// Admin, Branding: the site's name, the line under it, the installed app's short name, the theme colour, the logo
// and the favicon.
export function IdentityAdmin({ value }: { value: Identity }) {
  const router = useRouter();
  const [f, setF] = React.useState({ name: value.name, tagline: value.tagline, shortName: value.shortName, color: value.color });
  const [logo, setLogo] = React.useState<string | null | undefined>(undefined);
  const [favicon, setFavicon] = React.useState<string | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const shownLogo = logo === undefined ? null : logo;
  return (
    <Card data-identity-admin>
      <CardHeader>
        <CardTitle className="text-base">Name and logo</CardTitle>
        <CardDescription>Shown in the sidebar, on the sign-in page, in the browser tab and on the app installed on phones.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <span className="flex size-10 items-center justify-center rounded-md bg-white ring-1 ring-border">
            {shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview of the chosen picture
              <img src={shownLogo} alt="" className="size-8 object-contain" />
            ) : (
              <BrandMark logo={logo === null ? false : value.logo} version={value.version} className="size-8" />
            )}
          </span>
          <span className="grid leading-tight">
            <span className="font-semibold">{f.name || "Name"}</span>
            <span className="text-xs text-muted-foreground">{f.tagline}</span>
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="id-name">Name</Label>
            <Input id="id-name" value={f.name} maxLength={40} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="id-tag">Line under the name</Label>
            <Input id="id-tag" value={f.tagline} maxLength={60} onChange={(e) => setF({ ...f, tagline: e.target.value })} placeholder="Content Manager" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="id-short">Short name (under the app icon on phones)</Label>
            <Input id="id-short" value={f.shortName} maxLength={20} onChange={(e) => setF({ ...f, shortName: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="id-color">App colour</Label>
            <div className="flex items-center gap-2">
              <input id="id-color" type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-9 w-12 rounded border" />
              <span className="font-mono text-xs">{f.color}</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="id-logo">Logo (square PNG, SVG or WebP, up to 1 MB)</Label>
            <Input id="id-logo" type="file" accept="image/*" onChange={async (e) => e.target.files?.[0] && setLogo(await read(e.target.files[0]))} />
            {(value.logo || logo) && (
              <Button size="xs" variant="ghost" onClick={() => setLogo(null)}>
                Use the Myseed mark
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="id-fav">Favicon (the browser tab; the logo if left empty)</Label>
            <Input id="id-fav" type="file" accept="image/*,.ico" onChange={async (e) => e.target.files?.[0] && setFavicon(await read(e.target.files[0]))} />
            {(value.favicon || favicon) && (
              <Button size="xs" variant="ghost" onClick={() => setFavicon(null)}>
                Remove the favicon
              </Button>
            )}
          </div>
        </div>
        <Button
          size="sm"
          disabled={busy || !f.name.trim()}
          onClick={async () => {
            setBusy(true);
            const r = await saveIdentityAction({ ...f, ...(logo !== undefined ? { logo } : {}), ...(favicon !== undefined ? { favicon } : {}) });
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success("Name and logo saved");
            router.refresh();
          }}
        >
          {busy && <Loader2Icon className="animate-spin" />} Save
        </Button>
      </CardContent>
    </Card>
  );
}
