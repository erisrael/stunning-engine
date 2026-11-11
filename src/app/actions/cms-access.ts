"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as a from "@/server/cms-access";
import { checkLegacyCmsAuth, loginLegacyCms, logoutLegacyCms, saveCmsRoleVisibility, saveLegacyCmsConfig, type CmsRoleVisibility } from "@/server/legacy-cms";

// Admin, Noor access (Update 1.0).
export const cmsAccessOverviewAction = async () => wrap(async () => a.cmsAccessOverview(await requireViewer()), { revalidate: false });
export const saveCmsAccountAction = async (input: Parameters<typeof a.saveCmsAccount>[1]) => wrap(async () => a.saveCmsAccount(await requireViewer(), input));
export const deleteCmsAccountAction = async (id: string) => wrap(async () => a.deleteCmsAccount(await requireViewer(), id));
export const testCmsLoginAction = async (id: string) => wrap(async () => a.testCmsLogin(await requireViewer(), id));
export const grantCmsAccessAction = async (input: Parameters<typeof a.grantCmsAccess>[1]) => wrap(async () => a.grantCmsAccess(await requireViewer(), input));
export const resetCmsAccessAction = async (ids: string[]) => wrap(async () => a.resetCmsAccess(await requireViewer(), ids));
export const revokeCmsAccessAction = async (ids: string[]) => wrap(async () => a.revokeCmsAccess(await requireViewer(), ids));
export const setCmsDataPolicyAction = async (p: "admin" | "granted") => wrap(async () => a.setCmsDataPolicy(await requireViewer(), p));
export const clearCmsRangeCacheAction = async () => wrap(async () => a.clearCmsRangeCache(await requireViewer()));
export const saveCmsRolesAction = async (v: CmsRoleVisibility) => wrap(async () => saveCmsRoleVisibility(await requireViewer(), v));
export const saveCmsConnectionAction = async (input: Parameters<typeof saveLegacyCmsConfig>[1]) => wrap(async () => saveLegacyCmsConfig(await requireViewer(), input));
export const cmsSignInAction = async () => wrap(async () => loginLegacyCms(await requireViewer()));
export const cmsSignOutAction = async () => wrap(async () => logoutLegacyCms(await requireViewer()));
export const cmsCheckAction = async () => wrap(async () => checkLegacyCmsAuth(await requireViewer()), { revalidate: false });
