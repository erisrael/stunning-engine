"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as h from "@/server/chapa-hub";
import * as inv from "@/server/cms-invoices";
import type { ChapaSettings } from "@/lib/chapa";

// Chapa for every business, and payment follow-up (Update 1.0, Phase 3).
const read = { revalidate: false } as const;
export const chapaBusinessesAction = async () => wrap(async () => h.chapaBusinesses(await requireViewer()), read);
export const chapaOverviewAction = async (biz: string | null) => wrap(async () => h.chapaOverview(await requireViewer(), biz), read);
export const chapaTxAction = async (f: h.TxFilter) => wrap(async () => h.listChapaTx(await requireViewer(), f), read);
export const chapaTxDetailAction = async (accountId: string, txRef: string) => wrap(async () => h.chapaTxDetail(await requireViewer(), accountId, txRef), read);
export const chapaVerifyAction = async (accountId: string, txRef: string) => wrap(async () => h.verifyChapaTx(await requireViewer(), accountId, txRef));
export const chapaDailyAction = async (day: string, biz: string | null) => wrap(async () => h.chapaDailyBoard(await requireViewer(), day, biz), read);
export const chapaCustomersAction = async (biz: string | null, q: string) => wrap(async () => h.chapaCustomers(await requireViewer(), { biz, q }), read);
export const chapaFollowupsAction = async (day: string, biz: string | null) => wrap(async () => h.chapaFollowups(await requireViewer(), day, biz), read);
export const chapaSendFollowupsAction = async (day: string, keys: string[] | "all", biz: string | null) => wrap(async () => h.sendFollowups(await requireViewer(), day, keys, biz));
export const chapaBalancesAction = async (biz: string | null) => wrap(async () => h.chapaBalances(await requireViewer(), biz), read);
export const chapaBanksAction = async (accountId: string) => wrap(async () => h.chapaBanks(await requireViewer(), accountId), read);
export const chapaOpsAction = async (biz: string | null, kinds?: h.OpKind[]) => wrap(async () => h.listChapaOps(await requireViewer(), { biz, kinds }), read);
export const chapaRequestOpAction = async (input: Parameters<typeof h.requestChapaOp>[1]) => wrap(async () => h.requestChapaOp(await requireViewer(), input));
export const chapaDecideOpAction = async (id: string, approve: boolean, note?: string) => wrap(async () => h.decideChapaOp(await requireViewer(), id, approve, note));
export const chapaVerifyTransferAction = async (id: string) => wrap(async () => h.verifyTransfer(await requireViewer(), id));
export const chapaRemoteTransfersAction = async (accountId: string) => wrap(async () => h.chapaTransfersRemote(await requireViewer(), accountId), read);
export const chapaBeneficiariesAction = async (accountId: string) => wrap(async () => h.listBeneficiaries(await requireViewer(), accountId), read);
export const chapaSaveBeneficiaryAction = async (input: Parameters<typeof h.saveBeneficiary>[1]) => wrap(async () => void (await h.saveBeneficiary(await requireViewer(), input)));
export const chapaFundsAction = async (biz: string | null) => wrap(async () => h.chapaFunds(await requireViewer(), biz), read);
export const chapaMatchAction = async (f: { from: string; until: string; biz?: string | null }) => wrap(async () => h.matchChapaToNoor(await requireViewer(), f), read);
export const chapaSyncAction = async (biz: string | null, full = false) => wrap(async () => h.syncNow(await requireViewer(), biz, full));
export const chapaProbeAction = async (accountId: string) => wrap(async () => h.probeChapaBusiness(await requireViewer(), accountId));
export const chapaSettingsAction = async () => wrap(async () => (await requireViewer(), h.chapaSettings()), read);
export const chapaSaveSettingsAction = async (s: ChapaSettings) => wrap(async () => h.saveChapaSettings(await requireViewer(), s));
export const chapaUpdateBusinessAction = async (id: string, input: Parameters<typeof h.updateBusiness>[2]) => wrap(async () => h.updateBusiness(await requireViewer(), id, input));

// CMS invoices that could not be verified: to Support or kept in Finance, and their outcome.
export const invoicesToSupportAction = async (ids: string[]) => wrap(async () => inv.sendInvoicesToSupport(await requireViewer(), ids));
export const invoicesToFinanceAction = async (ids: string[], assigneeId: string) => wrap(async () => inv.handleInvoicesInFinance(await requireViewer(), ids, assigneeId));
export const invoiceOutcomeAction = async (id: string, outcome: string) => wrap(async () => inv.setInvoiceOutcome(await requireViewer(), id, outcome));
export const invoiceFollowupsAction = async (ids: string[]) => wrap(async () => inv.invoiceFollowups(await requireViewer(), ids), read);
export const financeMembersAction = async () => wrap(async () => inv.financeMembers(await requireViewer()), read);
