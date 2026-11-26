import Link from "next/link";
import type { VerifyResult } from "@/server/corr/signing";

const TONE: Record<VerifyResult["result"], { title: string; cls: string; text: string }> = {
  genuine: { title: "Genuine", cls: "border-emerald-500 bg-emerald-50 text-emerald-900", text: "This letter was issued by the company and has not been changed." },
  void: { title: "Void", cls: "border-red-500 bg-red-50 text-red-900", text: "This letter was issued but has since been voided. Do not rely on it." },
  replaced: { title: "Replaced", cls: "border-amber-500 bg-amber-50 text-amber-900", text: "This letter was replaced by a newer one. Ask the company for the current letter." },
  tampered: { title: "Does not match", cls: "border-red-600 bg-red-50 text-red-900", text: "The record of this letter fails its integrity checks. Treat any copy as suspect and contact the company." },
  not_found: { title: "Not found", cls: "border-slate-400 bg-slate-50 text-slate-900", text: "No issued letter has this code or reference. Check what you typed; a letter without a match should not be trusted." },
  not_issued: { title: "Not issued", cls: "border-slate-400 bg-slate-50 text-slate-900", text: "This document exists but was never issued as an official letter." },
};

// The public result of checking a letter: never its text; for confidential letters only the reference and dates.
export function VerifyView({ r, query }: { r: VerifyResult | null; query: string }) {
  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="text-2xl font-bold">Check an official letter</h1>
        <form action="/verify" className="flex gap-2">
          <input name="q" defaultValue={query} placeholder="Verification code (XXXX-XXXX-XXXX) or reference number" className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm" aria-label="Code or reference" />
          <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-medium text-white">Check</button>
        </form>
        {r && (
          <div className={`space-y-3 rounded-lg border-l-4 p-4 ${TONE[r.result].cls}`}>
            <p className="text-lg font-semibold">{TONE[r.result].title}</p>
            <p className="text-sm">{TONE[r.result].text}</p>
            {r.found && r.ref && (
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-slate-500">Issued by</dt>
                <dd>{r.issuer}</dd>
                <dt className="text-slate-500">Reference</dt>
                <dd className="font-mono break-all">{r.ref}</dd>
                <dt className="text-slate-500">Issued</dt>
                <dd>{r.issuedAt ? new Date(r.issuedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "-"}</dd>
                <dt className="text-slate-500">Kind</dt>
                <dd>{r.category}</dd>
                {r.subject && (
                  <>
                    <dt className="text-slate-500">Subject</dt>
                    <dd>{r.subject}</dd>
                  </>
                )}
                {r.recipient && (
                  <>
                    <dt className="text-slate-500">Addressed to</dt>
                    <dd>{r.recipient}</dd>
                  </>
                )}
                {r.replacedBy && (
                  <>
                    <dt className="text-slate-500">Replaced by</dt>
                    <dd className="font-mono">{r.replacedBy}</dd>
                  </>
                )}
                {r.voidReason && (
                  <>
                    <dt className="text-slate-500">Voided because</dt>
                    <dd>{r.voidReason}</dd>
                  </>
                )}
                <dt className="text-slate-500">Fingerprint</dt>
                <dd className="font-mono text-xs">{r.fingerprint}</dd>
              </dl>
            )}
            {!!r.signatories?.length && (
              <div className="text-sm">
                <p className="font-medium">Signed by</p>
                <ul className="list-disc pl-5">
                  {r.signatories.map((s, i) => (
                    <li key={i}>
                      {s.name}, {s.position}
                      {s.date ? ` (${new Date(s.date).toLocaleDateString("en-GB")})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!!r.checks?.length && (
              <ul className="space-y-0.5 text-sm">
                {r.checks.map((c) => (
                  <li key={c.name}>
                    {c.ok ? "✓" : "✗"} {c.name}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-500">Compare the reference, date and fingerprint with the paper or PDF you hold. If anything differs, the copy is not genuine.</p>
          </div>
        )}
        <p className="text-xs text-slate-500">
          Checks are recorded. The issuing server signs each letter; its public key is at <Link className="underline" href="/api/corr/public-key">/api/corr/public-key</Link>.
        </p>
      </div>
    </div>
  );
}
