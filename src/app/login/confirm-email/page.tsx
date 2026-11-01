import { confirmEmail } from "@/server/email-verify";
import { AuthShell } from "../auth-shell";

export const metadata = { title: "Confirm your email" };

// The link from the confirmation email (Admin, Sign-in, Email verification).
export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const r = token ? await confirmEmail(token) : null;
  return (
    <AuthShell title={r ? "Email confirmed" : "Confirm your email"} subtitle={r ? r.email : undefined}>
      <div className="space-y-4 text-center text-sm">
        <p className="text-muted-foreground">{r ? `Thank you, ${r.name}. You can sign in now.` : "This link has expired or was already used. Sign in to get a new one."}</p>
        <a href="/login" className="text-primary hover:underline">
          Go to sign in
        </a>
      </div>
    </AuthShell>
  );
}
