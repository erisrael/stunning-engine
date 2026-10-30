import { checkResetToken } from "@/server/password-reset";
import { AuthShell } from "../auth-shell";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const r = token ? await checkResetToken(token) : null;
  return (
    <AuthShell title="Choose a new password" subtitle={r ? `For ${r.email}` : undefined}>
      {r ? (
        <ResetForm token={token} />
      ) : (
        <div className="space-y-4 text-center text-sm">
          <p className="text-muted-foreground">This link has expired or was already used.</p>
          <a href="/login/forgot" className="text-primary hover:underline">
            Ask for a new one
          </a>
        </div>
      )}
    </AuthShell>
  );
}
