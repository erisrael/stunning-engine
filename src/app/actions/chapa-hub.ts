"use server";
import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as h from "@/server/chapa-hub";
import * as inv from "@/server/cms-invoices";
import type { ChapaSettings } from "@/lib/chapa";

// Chapa for every business, and payment follow-up (Update 1.0, Phase 3).
const read = { revalidate: false } as const;
export const chapaBusinessesAction = async () => wrap(async () => h.chapaBusinesses(await requireViewer()), read);
export const chapaWebhookSecretAction = async (id: string, secret: string) => wrap(async () => h.setChapaWebhookSecret(await requireViewer(), id, secret));
export const chapaWebhookTestAction = async (id: string) => wrap(async () => h.chapaWebhookSelfTest(await requireViewer(), id));
export const chapaOverviewAction = async (biz: string | null, f: h.OverviewFilter = {}) => wrap(async () => h.chapaOverview(await requireViewer(), biz, f), read);
export const saveChapaOverviewLayoutAction = async (widgets: string[], scope: "me" | "default" | "reset") => wrap(async () => h.saveChapaOverviewLayout(await requireViewer(), widgets, scope));
export const chapaTxAction = async (f: h.TxFilter) => wrap(async () => h.listChapaTx(await requireViewer(), f), read);
export const chapaTxDetailAction = async (accountId: string, txRef: string) => wrap(async () => h.chapaTxDetail(await requireViewer(), accountId, txRef), read);
export const chapaVerifyAction = async (accountId: string, txRef: string) => wrap(async () => h.verifyChapaTx(await requireViewer(), accountId, txRef));
export const chapaDailyAction = async (day: string, biz: string | null) => wrap(async () => h.chapaDailyBoard(await requireViewer(), day, biz), read);
export const chapaCustomersAction = async (biz: string | null, q: string, f: Omit<h.ChapaCustomerFilter, "biz" | "q"> = {}) =>
  wrap(async () => {
    const list = await h.chapaCustomers(await requireViewer(), { ...f, biz, q });
    return { list: list.slice(0, 1000), total: list.length, summary: h.chapaCustomerSummary(list) };
  }, read);
export const chapaCustomerTriesAction = async (accountId: string, key: string) => wrap(async () => h.chapaCustomerTries(await requireViewer(), accountId, key), read);
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

// Update 1.2: the sync run log, full sync and reconciliation (src/server/chapa-sync.ts).
export const chapaSyncStateAction = async (biz: string | null) => wrap(async () => (await import("@/server/chapa-sync")).chapaSyncState(await requireViewer(), biz), read);
export const chapaReconcileAction = async (accountId: string, from: string, until: string) => wrap(async () => (await import("@/server/chapa-sync")).reconcileChapa(await requireViewer(), accountId, from, until));
export const chapaRunErrorsAction = async (runId: string) => wrap(async () => (await import("@/server/chapa-sync")).chapaRunErrors(await requireViewer(), runId), read);
export const chapaTxPageAction = async (f: h.TxPageInput) => wrap(async () => h.chapaTxPage(await requireViewer(), f), read);
export const chapaTxViewsAction = async () => wrap(async () => h.chapaTxViews(await requireViewer()), read);
export const chapaSaveTxViewAction = async (input: { name: string; filter: Record<string, unknown>; shared?: boolean }) => wrap(async () => h.saveChapaTxView(await requireViewer(), input));
export const chapaDeleteTxViewAction = async (id: string) => wrap(async () => h.deleteChapaTxView(await requireViewer(), id));
