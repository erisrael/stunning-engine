import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { LoginForm } from "./login-form";
import { MyseedLogo } from "@/components/app/logo";
import { readyProviders } from "@/server/oidc";
import { signInPolicy } from "@/server/signin-config";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; notice?: string }> }) {
  if (await getViewer()) redirect("/dashboard");
  const { next, error, notice } = await searchParams;
  const signup = (await signInPolicy()).signup.mode;
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#f6f7fb] px-4 py-10 dark:bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-[#7b68ee]/20 blur-3xl" />
        <div className="absolute -right-32 -bottom-40 size-[34rem] rounded-full bg-[#5dba47]/20 blur-3xl" />
        <div className="absolute top-1/3 left-1/2 size-80 -translate-x-1/2 rounded-full bg-[#1fa7e0]/10 blur-3xl" />
      </div>

      <div className="relative flex w-full max-w-[420px] flex-col items-center">
        <div className="mb-6 flex items-center gap-2.5">
          <MyseedLogo className="size-11" />
          <div className="leading-tight">
            <div className="text-xl font-bold tracking-tight">Myseed</div>
            <div className="text-xs font-medium text-muted-foreground">Content Manager</div>
          </div>
        </div>

        <div className="w-full rounded-2xl border bg-card p-6 shadow-[0_8px_40px_-12px_rgba(41,45,52,0.25)] sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back!</h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
          </div>
          <LoginForm
            next={next}
            providers={await readyProviders().catch(() => [])}
            signup={signup}
            message={notice === "requested" ? { ok: true, text: "Thanks. Your request for an account went to the administrator. You will get an email when it is approved." } : error ? { ok: false, text: error.slice(0, 200) } : null}
          />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Recording, editing, uploading and publication in one place.
          <br />
          Times are shown in Africa/Addis_Ababa.
        </p>
      </div>
    </div>
  );
}
