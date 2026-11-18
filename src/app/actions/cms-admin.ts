"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as X from "@/server/cms-admin";

// Noor's admin pages worked from here (Update 1.2, System improvements 4).
const read = { revalidate: false } as const;
export const noorAdminListAction = async (slug: string, q: X.AdminListQuery) => wrap(async () => X.noorAdminList(await requireViewer(), slug, q), read);
export const noorAdminFormAction = async (slug: string, target: X.FormTarget) => wrap(async () => X.noorAdminForm(await requireViewer(), slug, target), read);
export const submitNoorAdminFormAction = async (slug: string, target: X.FormTarget, values: Record<string, unknown>) => wrap(async () => X.submitNoorAdminForm(await requireViewer(), slug, target, values), read);
export const deleteNoorAdminRecordAction = async (slug: string, id: string) => wrap(async () => X.deleteNoorAdminRecord(await requireViewer(), slug, id), read);

// Noor's own totals and dashboard cards, read live (src/server/noor-totals.ts).
export const noorTotalsAction = async (refresh = false) => wrap(async () => (await import("@/server/noor-totals")).noorTotals(await requireViewer(), { refresh }), read);
