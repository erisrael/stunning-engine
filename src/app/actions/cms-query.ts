"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as Q from "@/server/cms-query";
import type { CmsRecordsView } from "@/lib/cms-query";

// Noor records from the mirror: filter, sort, page, export, detail and saved views (Update 1.2, Phase 4).
const read = { revalidate: false } as const;
type Input = Parameters<typeof Q.queryCmsRecords>[1];
export const cmsRecordResourcesAction = async () => wrap(async () => Q.cmsRecordResources(await requireViewer()), read);
export const cmsRecordsAction = async (input: Input) => wrap(async () => Q.queryCmsRecords(await requireViewer(), input), read);
export const cmsRecordDetailAction = async (resource: string, id: string) => wrap(async () => Q.cmsRecordDetail(await requireViewer(), resource, id), read);
export const cmsExportRecordsAction = async (input: Parameters<typeof Q.exportCmsRecords>[1]) => wrap(async () => Q.exportCmsRecords(await requireViewer(), input), read);
export const cmsViewsAction = async (resource: string) => wrap(async () => Q.listCmsViews(await requireViewer(), resource), read);
export const cmsSaveViewAction = async (resource: string, input: { name: string; view: CmsRecordsView; shared?: boolean }) => wrap(async () => Q.saveCmsView(await requireViewer(), resource, input), read);
export const cmsDeleteViewAction = async (resource: string, id: string) => wrap(async () => Q.deleteCmsView(await requireViewer(), resource, id), read);
