"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckIcon,
  KeyRoundIcon,
  Loader2Icon,
  PlusIcon,
  ShieldAlertIcon,
  Trash2Icon,
  UserCheckIcon,
  UserCogIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  deleteUserCmsOverrideAction,
  listUserCmsOverridesAction,
  saveUserCmsOverrideAction,
} from "@/app/actions/legacy-cms";
import { LEGACY_CMS_CATEGORIES, type LegacyCmsCategory, type UserCmsOverride } from "@/lib/legacy-cms";

type AdminUser = { id: string; name: string; email: string; role: string };

export function LegacyCmsAdmin({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [overrides, setOverrides] = React.useState<UserCmsOverride[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Form state
  const [selectedUserId, setSelectedUserId] = React.useState(users[0]?.id || "");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [allowedTabs, setAllowedTabs] = React.useState<LegacyCmsCategory[]>([
    "students",
    "parents",
    "feedback",
  ]);

  const loadOverrides = React.useCallback(async () => {
    setLoading(true);
    const res = await listUserCmsOverridesAction();
    if (res.ok && res.data) {
      setOverrides(res.data);
    }
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  const handleToggleTab = (tabKey: LegacyCmsCategory) => {
    setAllowedTabs((prev) =>
      prev.includes(tabKey) ? prev.filter((t) => t !== tabKey) : [...prev, tabKey]
    );
  };

  const handleSave = async () => {
    if (!selectedUserId) {
      toast.error("Please select a user");
      return;
    }
    if (allowedTabs.length === 0) {
      toast.error("Please select at least one allowed tab");
      return;
    }
    setBusy(true);
    const res = await saveUserCmsOverrideAction({
      userId: selectedUserId,
      username: username.trim() || undefined,
      password: password.trim() || undefined,
      allowedTabs,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(res.message);
      setDialogOpen(false);
      setUsername("");
      setPassword("");
      void loadOverrides();
      router.refresh();
    } else {
      toast.error(res.message || "Failed to save configuration");
    }
  };

  const handleDelete = async (userId: string) => {
    setBusy(true);
    const res = await deleteUserCmsOverrideAction(userId);
    setBusy(false);
    if (res.ok) {
      toast.success(res.message);
      void loadOverrides();
      router.refresh();
    } else {
      toast.error(res.message || "Failed to remove override");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCogIcon className="size-4 text-emerald-500" />
            Noor Legacy CMS: User Access &amp; Credentials
          </CardTitle>
          <CardDescription>
            Grant specific staff members access to Noor Ethiopia CMS with customized login credentials and tab restrictions.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-1.5">
          <PlusIcon className="size-4" /> Grant User Access
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground gap-2">
            <Loader2Icon className="size-5 animate-spin" />
            Loading access configurations...
          </div>
        ) : overrides.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No custom user overrides configured. Users see tabs based on their default role permissions.
          </div>
        ) : (
          <div className="divide-y rounded-xl border">
            {overrides.map((ov) => (
              <div key={ov.userId} className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{ov.userName || ov.userId}</span>
                    {ov.username && (
                      <Badge variant="outline" className="font-mono text-xs">
                        CMS: {ov.username}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {ov.allowedTabs.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {LEGACY_CMS_CATEGORIES.find((c) => c.key === t)?.label || t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 gap-1.5"
                  disabled={busy}
                  onClick={() => handleDelete(ov.userId)}
                >
                  <Trash2Icon className="size-4" /> Remove Override
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Modal to configure user */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configure Noor CMS User Access</DialogTitle>
              <DialogDescription>
                Assign dedicated CMS credentials and restrict allowed category tabs for this user.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Select User</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.email}) - {u.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Custom Noor CMS Username (Optional)</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. staff@noorethiopia.com"
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to use the shared Noor CMS organization account.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Custom Password (Optional)</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                />
              </div>

              <div className="space-y-2">
                <Label>Allowed Categories / Tabs</Label>
                <div className="grid grid-cols-2 gap-2">
                  {LEGACY_CMS_CATEGORIES.map((cat) => {
                    const checked = allowedTabs.includes(cat.key);
                    return (
                      <button
                        key={cat.key}
                        type="button"
                        onClick={() => handleToggleTab(cat.key)}
                        className={`flex items-center gap-2 rounded-lg border p-2 text-xs font-medium text-left transition-all ${
                          checked
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        <div
                          className={`flex size-4 items-center justify-center rounded border ${
                            checked ? "border-emerald-500 bg-emerald-500 text-black" : "border-muted-foreground"
                          }`}
                        >
                          {checked && <CheckIcon className="size-3" />}
                        </div>
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : "Save Configuration"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

