import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { checkInvite } from "@/server/signin";
import { signInPolicy } from "@/server/signin-config";
import { readyProviders } from "@/server/oidc";
import { ROLE_LABELS } from "@/lib/domain";
import { AuthShell } from "../login/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Create your account" };

// Sign-up as Admin allows it: with an invitation link, or (open sign-up) a request from an allowed email domain.
export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (await getViewer()) redirect("/dashboard");
  const { invite = "" } = await searchParams;
  const p = await signInPolicy();
  const inv = invite ? await checkInvite(invite) : null;
  if (inv)
    return (
      <AuthShell title="Create your account" subtitle={`You were invited as ${ROLE_LABELS[inv.role]}.`}>
        <SignupForm mode="invite" token={invite} email={inv.email} />
      </AuthShell>
    );
  if (!invite && p.signup.mode === "domain")
    return (
      <AuthShell title="Ask for an account" subtitle={`With your company email (${p.signup.domains.map((d) => `@${d}`).join(", ")}). Admin approves new accounts.`}>
        <SignupForm mode="request" providers={await readyProviders().catch(() => [])} />
      </AuthShell>
    );
  return (
    <AuthShell title={invite ? "Invitation not valid" : "Sign-up is by invitation"}>
      <div className="space-y-4 text-center text-sm">
        <p className="text-muted-foreground">
          {invite ? "This invitation has expired or was already used. Ask the person who invited you for a new one." : "Ask your administrator to invite you. The invitation email has a link to create your account."}
        </p>
        <a href="/login" className="text-primary hover:underline">
          Back to sign in
        </a>
      </div>
    </AuthShell>
  );
}
