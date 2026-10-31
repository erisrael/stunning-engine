"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import * as f from "@/server/finance";
import type { FinanceSettings, PayLine } from "@/lib/finance";

// Every action checks the Finance permissions and separation of duties on the server (finance.ts).
type File = { name: string; mime: string; base64: string };

export async function saveFinanceSettingsAction(input: Partial<FinanceSettings>) {
  return wrap(async () => f.saveFinanceSettings(await requireViewer(), input));
}
export async function saveLedgerAction(input: { code: string; name: string; type: string; active?: boolean }) {
  return wrap(async () => f.saveLedger(await requireViewer(), input));
}
export async function lockPeriodAction(period: string, locked: boolean) {
  return wrap(async () => f.lockPeriod(await requireViewer(), period, locked));
}
export async function saveAccountAction(input: Parameters<typeof f.saveAccount>[1]) {
  return wrap(async () => f.saveAccount(await requireViewer(), input));
}
export async function savePartyAction(input: Parameters<typeof f.saveParty>[1]) {
  return wrap(async () => f.saveParty(await requireViewer(), input));
}
export async function postTransactionAction(input: f.TxInput) {
  return wrap(async () => f.postTransaction(await requireViewer(), input));
}
export async function transferAction(input: { date: string; amount: number; fromId: string; toId: string; description?: string }) {
  return wrap(async () => f.transfer(await requireViewer(), input));
}
export async function voidTransactionAction(id: string) {
  return wrap(async () => f.voidTransaction(await requireViewer(), id));
}
export async function saveBillAction(input: Parameters<typeof f.saveBill>[1]) {
  return wrap(async () => f.saveBill(await requireViewer(), input));
}
export async function approveBillAction(id: string, approve: boolean) {
  return wrap(async () => f.approveBill(await requireViewer(), id, approve));
}
export async function payBillAction(id: string, input: { accountId: string; date: string; reference?: string }) {
  return wrap(async () => f.payBill(await requireViewer(), id, input));
}
export async function saveInvoiceAction(input: Parameters<typeof f.saveInvoice>[1]) {
  return wrap(async () => f.saveInvoice(await requireViewer(), input));
}
export async function setInvoiceStatusAction(id: string, status: "sent" | "void") {
  return wrap(async () => f.setInvoiceStatus(await requireViewer(), id, status));
}
export async function receiveInvoiceAction(id: string, input: { accountId: string; date: string; reference?: string }) {
  return wrap(async () => f.receiveInvoice(await requireViewer(), id, input));
}
export async function submitClaimAction(input: { date: string; amount: number; ledgerCode?: string; department?: string; project?: string; description: string; receipt?: File | null }) {
  return wrap(async () => f.submitClaim(await requireViewer(), input));
}
export async function decideClaimAction(id: string, input: { approve: boolean; note?: string }) {
  return wrap(async () => f.decideClaim(await requireViewer(), id, input));
}
export async function payClaimAction(id: string, input: { accountId: string; date: string }) {
  return wrap(async () => f.payClaim(await requireViewer(), id, input));
}
export async function requestPurchaseAction(input: Parameters<typeof f.requestPurchase>[1]) {
  return wrap(async () => f.requestPurchase(await requireViewer(), input));
}
export async function movePurchaseAction(id: string, input: Parameters<typeof f.movePurchase>[2]) {
  return wrap(async () => f.movePurchase(await requireViewer(), id, input));
}
export async function saveBudgetAction(input: Parameters<typeof f.saveBudget>[1]) {
  return wrap(async () => f.saveBudget(await requireViewer(), input));
}
export async function savePayStructureAction(employeeId: string, input: { basic: number; allowances: PayLine[]; deductions: PayLine[] }) {
  return wrap(async () => f.savePayStructure(await requireViewer(), employeeId, input));
}
export async function createPayrollRunAction(period: string) {
  return wrap(async () => f.createPayrollRun(await requireViewer(), period));
}
export async function updatePayslipAction(id: string, input: Parameters<typeof f.updatePayslip>[2]) {
  return wrap(async () => f.updatePayslip(await requireViewer(), id, input));
}
export async function fillFromAttendanceAction(runId: string) {
  return wrap(async () => f.fillFromAttendance(await requireViewer(), runId));
}
export async function movePayrollAction(runId: string, input: Parameters<typeof f.movePayroll>[2]) {
  return wrap(async () => f.movePayroll(await requireViewer(), runId, input));
}
export async function payslipsOfAction(runId: string) {
  return wrap(async () => f.payslipsOf(await requireViewer(), runId), { revalidate: false });
}
