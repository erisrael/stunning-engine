import { revalidatePath } from "next/cache";
import { WorkflowError } from "./workflow";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; duplicate?: boolean }
  | { ok: false; error: string; code?: string; details?: unknown };

export async function wrap<T>(fn: () => T | Promise<T>, opts: { revalidate?: boolean } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (opts.revalidate !== false) revalidatePath("/", "layout");
    if (data && typeof data === "object" && "duplicate" in (data as object)) return { ok: true, duplicate: true };
    return { ok: true, data };
  } catch (err) {
    if (err instanceof WorkflowError) return { ok: false, error: err.message, code: err.code, details: err.details };
    // Next.js uses thrown errors for redirects; let them propagate.
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
    console.error(err);
    return { ok: false, error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}
