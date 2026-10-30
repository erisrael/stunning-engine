"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireViewer, setActiveRole, signIn, signOut, startSession } from "@/server/auth";
import { completeReset, requestEmailReset, saveGoogleSettings } from "@/server/password-reset";
import { get, run } from "@/server/db";
import { hashPassword, passwordProblems, verifyPassword } from "@/server/passwords";
import { wrap } from "@/server/action-result";
import { ROLES, type Role } from "@/lib/domain";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  if (!email || !password) return { error: "Enter your email and password." };
  const result = await signIn(email, password);
  if (!result.ok) return { error: result.error };
  let target = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (target === "/dashboard") {
    const row = await get<{ prefs: string }>("SELECT prefs FROM users WHERE lower(email) = lower(?)", email);
    const landing = (JSON.parse(row?.prefs ?? "{}") as { defaultLanding?: string }).defaultLanding;
    if (landing && /^\/[a-z-]+$/.test(landing)) target = landing;
  }
  redirect(target);
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}

export async function switchRoleAction(role: Role) {
  if (!ROLES.includes(role)) return { ok: false as const, error: "Unknown role." };
  await setActiveRole(role);
  revalidatePath("/", "layout");
  return { ok: true as const };
}

export async function changePasswordAction(input: { current: string; next: string }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const row = await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", viewer.id);
    if (!verifyPassword(input.current, row?.password_hash)) throw new Error("Your current password is incorrect.");
    const problem = passwordProblems(input.next);
    if (problem) throw new Error(problem);
    await run("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?", hashPassword(input.next), viewer.id);
    await run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", viewer.id, viewer.sessionId);
  });
}

// Forgotten password: always the same answer, so nobody learns which emails have accounts.
export async function forgotPasswordAction(_prev: { sent?: boolean; error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter the email you sign in with." };
  await requestEmailReset(email);
  return { sent: true };
}

export async function resetPasswordAction(_prev: { error?: string } | undefined, formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { error: "The two passwords are different." };
  try {
    const r = await completeReset(token, password);
    const s = await startSession(r.userId);
    if (!s.ok) return { error: s.error };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong. Try again." };
  }
  redirect("/dashboard");
}

export async function saveGoogleSettingsAction(input: { clientId: string; secret?: string | null }) {
  return wrap(async () => saveGoogleSettings(await requireViewer(), input));
}
