"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as pr from "@/server/presenters";

// Presenters, releases and fees (Phase 16.1).
export async function savePresenterAction(input: Parameters<typeof pr.savePresenter>[1]) {
  return wrap(async () => pr.savePresenter(await requireViewer(), input));
}
export async function addReleaseAction(presenterId: string, input: Parameters<typeof pr.addRelease>[2]) {
  return wrap(async () => pr.addRelease(await requireViewer(), presenterId, input));
}
export async function savePresenterConfigAction(input: Partial<pr.PresenterConfig>) {
  return wrap(async () => pr.savePresenterConfig(await requireViewer(), input));
}
export async function sendStatementAction(presenterId: string, month: string) {
  return wrap(async () => pr.sendStatement(await requireViewer(), presenterId, month));
}
export async function billStatementAction(presenterId: string, month: string) {
  return wrap(async () => pr.billStatement(await requireViewer(), presenterId, month));
}
