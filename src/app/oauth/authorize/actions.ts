"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { clientById, issueCode, redirectAllowed } from "@/server/oauth";

function back(uri: string, params: Record<string, string | undefined>) {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  redirect(u.toString());
}

async function parse(form: FormData) {
  const q = new URLSearchParams(String(form.get("q") ?? ""));
  const client = await clientById(q.get("client_id") ?? "");
  const uri = q.get("redirect_uri") ?? "";
  if (!client || !redirectAllowed(client, uri)) redirect("/tools");
  return { q, client, uri };
}

export async function approveAction(form: FormData) {
  const viewer = await getViewer();
  if (!viewer || viewer.previewBy) redirect("/login");
  const { q, client, uri } = await parse(form);
  let code: string;
  try {
    code = await issueCode(viewer, { clientId: client.client_id, redirectUri: uri, codeChallenge: q.get("code_challenge"), method: q.get("code_challenge_method"), scope: q.get("scope"), resource: q.get("resource") });
  } catch (e) {
    return back(uri, { error: "access_denied", error_description: (e as Error).message, state: q.get("state") ?? undefined });
  }
  back(uri, { code, state: q.get("state") ?? undefined, iss: undefined });
}

export async function denyAction(form: FormData) {
  const { q, uri } = await parse(form);
  back(uri, { error: "access_denied", state: q.get("state") ?? undefined });
}
