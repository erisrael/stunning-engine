import { MyseedLogo } from "@/components/app/logo";

// The sign-in look, shared by sign-in, forgot password and reset.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#f6f7fb] px-4 py-10 dark:bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-[#7b68ee]/20 blur-3xl" />
        <div className="absolute -right-32 -bottom-40 size-[34rem] rounded-full bg-[#5dba47]/20 blur-3xl" />
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
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
