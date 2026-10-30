import { googleConfig } from "@/server/password-reset";
import { AuthShell } from "../auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

const ERRORS: Record<string, string> = {
  "google-off": "Google is not set up for this workspace yet. Use the email link instead.",
  "google-failed": "Google did not confirm the account. Try again, or use the email link.",
  "no-account": "That Google account's email is not the email of any account here. Use the Gmail address you sign in with, or the email link.",
};

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthShell title="Forgot your password?" subtitle="Choose a new one in a minute.">
      <ForgotForm google={!!(await googleConfig())} error={error ? (ERRORS[error] ?? null) : null} />
    </AuthShell>
  );
}
