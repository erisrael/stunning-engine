import Link from "next/link";
import { BrandMark } from "@/components/app/brand-mark";
import { identity } from "@/server/identity";

export const metadata = {
  title: "Terms of Service",
  description: "Terms of Service for MySeed Content Manager.",
};

export default async function TermsOfServicePage() {
  const id = await identity().catch(() => ({
    name: "MySeed Content Manager",
    shortName: "MySeed",
    tagline: "Educational Content & Operations Management",
    version: "1",
    logo: false,
  }));

  return (
    <div className="relative min-h-dvh bg-[#f6f7fb] px-4 py-10 dark:bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-[#7b68ee]/15 blur-3xl" />
        <div className="absolute -right-32 -bottom-40 size-[34rem] rounded-full bg-[#5dba47]/15 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2.5 transition-opacity hover:opacity-85">
            <BrandMark logo={Boolean(id.logo)} version={id.version} className="size-10" />
            <div className="leading-tight">
              <div className="text-lg font-bold tracking-tight">{id.name}</div>
              <div className="text-xs font-medium text-muted-foreground">{id.tagline}</div>
            </div>
          </Link>
          <Link
            href="/login"
            className="rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Back to Sign in
          </Link>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
          <div className="border-b pb-6">
            <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: November 10, 2026 &bull; Effective for all users of MySeed Content Manager
            </p>
          </div>

          <div className="prose prose-sm dark:prose-invert mt-8 max-w-none space-y-6 text-foreground/90">
            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                By accessing or using <strong>{id.name}</strong> (&quot;the Service&quot;), hosted at{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">https://ops.myseed.com.et</code> and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">https://myseedops.tech</code>, you agree to be bound by these Terms of Service.
                If you do not agree, you may not access or use the Service.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">2. Description of the Service</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The Service is an operational management platform used for educational content production, video recording, editing workflows, equipment checkout,
                finance tracking, routine verification, and internal team collaboration.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">3. User Accounts and Authentication</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Access is restricted to authorized personnel. You are responsible for maintaining the confidentiality of your login credentials, passwords, and connected accounts
                (including linked Google OAuth credentials). You agree to notify the system administrator immediately of any unauthorized use of your account.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">4. Acceptable Use</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You agree not to misuse the Service, attempt unauthorized access to other users&apos; accounts or databases, interfere with system availability,
                or upload malicious content or unauthorized media.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">5. Termination</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                We reserve the right to suspend or terminate access to the Service for any user who violates organizational policies or these Terms of Service.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">6. Contact Information</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                For questions regarding these Terms of Service, please contact:
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <div><strong>Support:</strong> iwfm@myseed.com.et</div>
                <div><strong>Platform:</strong> https://ops.myseed.com.et &bull; https://myseedops.tech</div>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link href="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          <span>&bull;</span>
          <Link href="/login" className="underline hover:text-foreground">
            Sign In
          </Link>
          <span>&bull;</span>
          <span>&copy; {new Date().getFullYear()} {id.name}</span>
        </div>
      </div>
    </div>
  );
}
