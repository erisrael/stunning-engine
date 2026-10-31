import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { challengeInfo } from "@/server/signin";
import { AuthShell } from "../auth-shell";
import { VerifyForm } from "./verify-form";

export const metadata = { title: "Two-step sign-in" };

export default async function VerifyPage() {
  if (await getViewer()) redirect("/dashboard");
  const info = await challengeInfo();
  if (!info) redirect("/login?error=" + encodeURIComponent("This sign-in has expired. Sign in again."));
  return (
    <AuthShell
      title={info.mode === "verify" ? "Two-step sign-in" : "Set up two-step sign-in"}
      subtitle={info.mode === "setup" ? `Your role needs a code from your phone as well as the password, ${info.name.split(" ")[0]}.` : `Hello ${info.name.split(" ")[0]}. One more step to prove it is you.`}
    >
      <VerifyForm info={info} />
    </AuthShell>
  );
}
