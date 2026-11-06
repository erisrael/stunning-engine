"use server";

import { requireViewer } from "@/server/auth";
import * as cp from "@/server/chapa";
import type { ChapaAccountInput } from "@/server/chapa";

export async function listChapaAccountsAction() {
  try {
    const viewer = await requireViewer();
    const data = await cp.listChapaAccounts(viewer);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err), data: [] };
  }
}

export async function saveChapaAccountAction(input: ChapaAccountInput) {
  try {
    const viewer = await requireViewer();
    const id = await cp.saveChapaAccount(viewer, input);
    return { ok: true, id };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function deleteChapaAccountAction(id: string) {
  try {
    const viewer = await requireViewer();
    await cp.deleteChapaAccount(viewer, id);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function testChapaAccountAction(id: string) {
  try {
    const viewer = await requireViewer();
    const res = await cp.testChapaAccount(viewer, id);
    return res;
  } catch (err: any) {
    return { ok: false, message: String(err?.message || err) };
  }
}

export async function fetchChapaBalancesAction() {
  try {
    const viewer = await requireViewer();
    const data = await cp.fetchChapaBalances(viewer);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err), data: [] };
  }
}

export async function listChapaTransactionsAction(accountId?: string) {
  try {
    const viewer = await requireViewer();
    const data = await cp.listChapaTransactions(viewer, accountId);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err), data: [] };
  }
}

export async function clearAllChapaAccountsAction() {
  try {
    const viewer = await requireViewer();
    await cp.clearAllChapaAccounts(viewer);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}

