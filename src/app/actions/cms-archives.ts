"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as X from "@/server/cms-archives";

// Noor's scraped archives and storage (Update 1.2, System improvements 2).
const read = { revalidate: false } as const;
export const archiveOverviewAction = async () => wrap(async () => X.archiveOverview(await requireViewer()), read);
export const fetchEverythingAction = async () => wrap(async () => X.fetchEverything(await requireViewer()));
export const createSnapshotAction = async (input: { name: string; category: string; description?: string | null }) => wrap(async () => X.createSnapshot(await requireViewer(), input));
export const deleteSnapshotAction = async (id: string) => wrap(async () => X.deleteSnapshot(await requireViewer(), id));
export const snapshotRecordsAction = async (id: string, f: X.RecordQuery) => wrap(async () => X.snapshotRecords(await requireViewer(), id, f), read);
export const exportSnapshotAction = async (id: string, f: X.RecordQuery, columns?: string[] | null) => wrap(async () => X.exportSnapshotRecords(await requireViewer(), id, f, columns), read);
export const compareSnapshotAction = async (id: string, other: string) => wrap(async () => X.compareSnapshot(await requireViewer(), id, other), read);
