import Link from "next/link";
import { BrandMark } from "@/components/app/brand-mark";
import { identity } from "@/server/identity";

export const metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy and Google API Services User Data disclosure for MySeed Content Manager.",
};

export default async function PrivacyPolicyPage() {
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
            <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: November 10, 2026 &bull; Effective for all users of MySeed Content Manager
            </p>
          </div>

          <div className="prose prose-sm dark:prose-invert mt-8 max-w-none space-y-6 text-foreground/90">
            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">1. Overview and Scope</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                This Privacy Policy explains how <strong>{id.name}</strong> (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;), accessible at{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">https://ops.myseed.com.et</code> and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">https://myseedops.tech</code>, collects, uses, protects, and discloses personal
                information when you access our platform, use our operational tools, or sign in through identity providers including Google OAuth.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">2. Information We Collect</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                We only collect information necessary to operate content workflows, manage equipment and finance requests, and authenticate authorized personnel:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  <strong>Account &amp; Profile Details:</strong> Full name, organizational email address, phone number, job title, department, and profile photo.
                </li>
                <li>
                  <strong>Google User Data (Google OAuth):</strong> When you sign in using &quot;Sign in with Google&quot; or connect your Google account to your profile,
                  we collect your Google email address, display name, verified account identifier, and profile avatar.
                </li>
                <li>
                  <strong>Workflow &amp; Operations Data:</strong> Assigned content tasks, equipment checkouts, finance requests, leave applications, attendance records, and system audit logs.
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">3. How We Use Your Information</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">Your information is used strictly to deliver and secure our core services:</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Authenticating your identity and verifying your permission to access operational workspaces.</li>
                <li>Linking your verified Google email address with your internal team member profile for single sign-on (SSO).</li>
                <li>Routing notifications, approvals, workflow handovers, and password reset communications.</li>
                <li>Maintaining organizational accountability and audit logging of actions performed in the system.</li>
                <li>
                  <strong>No Sale or Marketing:</strong> We never sell, rent, or monetize your personal data. We do not share your information with advertisers or data brokers.
                </li>
              </ul>
            </section>

            <section className="space-y-2 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 dark:border-blue-500/30 dark:bg-blue-500/10">
              <h2 className="text-base font-semibold text-blue-900 dark:text-blue-200">
                4. Google API Services User Data Policy &amp; Limited Use Disclosure
              </h2>
              <p className="text-sm leading-relaxed text-blue-950/80 dark:text-blue-100/80">
                {id.name}&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-blue-800 dark:hover:text-blue-300"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-blue-950/80 dark:text-blue-100/80">
                <li>
                  We only request basic authentication scopes (<code className="rounded bg-muted/60 px-1 py-0.5">openid</code>,{" "}
                  <code className="rounded bg-muted/60 px-1 py-0.5">email</code>, <code className="rounded bg-muted/60 px-1 py-0.5">profile</code>).
                </li>
                <li>We do not transfer Google user data to third parties, except as required to fulfill authentication via secure hosting infrastructure.</li>
                <li>We never use Google user data to serve advertisements or train generalized artificial intelligence / machine learning models.</li>
                <li>Human staff do not read your private Google data unless you explicitly request technical support or where required by applicable law.</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">5. Data Storage, Security &amp; Retention</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                All data is encrypted in transit using industry-standard TLS/HTTPS protocols and stored on private, secured database servers.
                API keys, passwords, and sensitive credentials are sealed using authenticated encryption. Data retention follows organizational policies,
                and obsolete logs or session records are automatically purged according to retention schedules.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">6. Your Rights &amp; Data Deletion</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You have full control over your personal information:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>
                  <strong>Download Your Data:</strong> You can download a complete archive of your profile, attendance, leave, and activity records directly from your Profile settings.
                </li>
                <li>
                  <strong>Unlink Google Account:</strong> You can disconnect or update your linked Google email address in your profile at any time.
                </li>
                <li>
                  <strong>Account Deletion:</strong> You may request the deletion of your account and personal records by contacting the system administrator.
                </li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-foreground">7. Contact Information</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                If you have questions, concerns, or requests regarding this Privacy Policy or your data, please contact:
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground">
                <div><strong>Application:</strong> {id.name}</div>
                <div><strong>Homepage:</strong> https://ops.myseed.com.et &bull; https://myseedops.tech</div>
                <div><strong>Support &amp; Developer Email:</strong> iwfm@myseed.com.et</div>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link href="/terms" className="underline hover:text-foreground">
            Terms of Service
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
