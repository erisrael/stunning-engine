"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as F from "@/server/cms-fields";

// Noor resources, the field registry and the mirror (Update 1.2, Phase 3).
const read = { revalidate: false } as const;
export const cmsResourcesAction = async () => wrap(async () => F.cmsResources(await requireViewer()), read);
export const cmsDiscoverAction = async () => wrap(async () => F.discoverCmsResources(await requireViewer()));
export const cmsSetResourceAction = async (slug: string, enabled: boolean) => wrap(async () => F.setCmsResourceEnabled(await requireViewer(), slug, enabled));
export const cmsFieldsAction = async (slug: string) => wrap(async () => F.cmsFields(await requireViewer(), slug), read);
export const cmsRefreshFieldsAction = async (slug: string) => wrap(async () => F.refreshCmsFields(await requireViewer(), slug));
export const cmsUpdateFieldAction = async (slug: string, name: string, input: Parameters<typeof F.updateCmsField>[3]) => wrap(async () => F.updateCmsField(await requireViewer(), slug, name, input));
export const cmsMirrorAction = async (slug: string, restart = false) => wrap(async () => F.startCmsMirror(await requireViewer(), slug, restart));
export const cmsCheckTotalsAction = async () => wrap(async () => F.checkCmsTotals(await requireViewer()));
export const cmsRunsAction = async (slug?: string | null) => wrap(async () => F.cmsRuns(await requireViewer(), slug), read);
export const cmsRunErrorsAction = async (runId: string) => wrap(async () => F.cmsRunErrors(await requireViewer(), runId), read);
