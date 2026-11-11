// Chapa Payment Gateway Integration & Multi-Business Accounts (Phase 30):
// Enables managing multiple businesses / sub-accounts (e.g. MySeed Subscription, MySeed Donation)
// Stores encrypted API keys, fetches account balances (ETB/USD), and lists recent transactions.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { seal, unseal } from "./secrets";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

export type ChapaAccount = {
  id: string;
  name: string;
  publicKey: string;
  currency: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  hasSecretKey?: boolean;
  hasWebhookSecret?: boolean;
};

export type ChapaAccountInput = {
  id?: string;
  name: string;
  secretKey?: string;
  publicKey?: string;
  webhookSecret?: string;
  currency?: string;
  active?: boolean;
};

export type ChapaBalance = {
  accountId: string;
  accountName: string;
  currency: string;
  availableBalance: number;
  ledgerBalance: number;
  status: "connected" | "test_mode" | "error";
  error?: string;
};

export type ChapaTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  txRef: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: "success" | "pending" | "failed";
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  createdAt: string;
};

export async function listChapaAccounts(user: AppUser): Promise<ChapaAccount[]> {
  if (!can(user, "finance.view") && !can(user, "finance.access") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Finance officers or Admins can view Chapa accounts.");
  }

  const rows = await all<{
    id: string;
    name: string;
    secret_key_enc: string;
    public_key: string | null;
    webhook_secret_enc: string | null;
    currency: string;
    active: number;
    created_at: string;
    updated_at: string;
  }>("SELECT id, name, secret_key_enc, public_key, webhook_secret_enc, currency, active, created_at, updated_at FROM chapa_accounts ORDER BY created_at ASC");

  if (rows.length === 0) {
    return [];
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    publicKey: r.public_key || "",
    currency: r.currency || "ETB",
    active: !!r.active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    hasSecretKey: !!r.secret_key_enc,
    hasWebhookSecret: !!r.webhook_secret_enc,
  }));
}

export async function saveChapaAccount(user: AppUser, input: ChapaAccountInput): Promise<string> {
  if (!can(user, "finance.access") && !can(user, "users.manage") && !can(user, "settings.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin or Finance Leads can configure payment gateways.");
  }

  const name = input.name.trim();
  if (!name) throw new WorkflowError("INVALID_STATE", "Account business name is required.");

  const currency = (input.currency || "ETB").toUpperCase();
  const active = input.active !== false ? 1 : 0;
  const now = nowIso();

  if (input.id) {
    const existing = await get<{ secret_key_enc: string; webhook_secret_enc: string | null }>(
      "SELECT secret_key_enc, webhook_secret_enc FROM chapa_accounts WHERE id = ?",
      input.id
    );
    if (!existing) throw new WorkflowError("NOT_FOUND", "Chapa account not found.");

    const secretKeyEnc = input.secretKey ? await seal(input.secretKey.trim()) : existing.secret_key_enc;
    const webhookSecretEnc = input.webhookSecret !== undefined ? (input.webhookSecret ? await seal(input.webhookSecret.trim()) : null) : existing.webhook_secret_enc;

    await run(
      "UPDATE chapa_accounts SET name = ?, secret_key_enc = ?, public_key = ?, webhook_secret_enc = ?, currency = ?, active = ?, updated_at = ? WHERE id = ?",
      name,
      secretKeyEnc,
      input.publicKey?.trim() || null,
      webhookSecretEnc,
      currency,
      active,
      now,
      input.id
    );

    if (input.secretKey) await run("UPDATE chapa_accounts SET mode = ? WHERE id = ?", input.secretKey.trim().startsWith("CHASECK_TEST-") ? "test" : "live", input.id);
    await audit({ actor: user }, { action: "finance.chapa_account_update", summary: `${user.name} updated Chapa account "${name}"` });
    return input.id;
  } else {
    if (!input.secretKey?.trim()) {
      throw new WorkflowError("INVALID_STATE", "Secret API key is required when creating a new Chapa account.");
    }
    const id = uid();
    const secretKeyEnc = await seal(input.secretKey.trim());
    const webhookSecretEnc = input.webhookSecret?.trim() ? await seal(input.webhookSecret.trim()) : null;

    await run(
      "INSERT INTO chapa_accounts (id, name, secret_key_enc, public_key, webhook_secret_enc, currency, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      name,
      secretKeyEnc,
      input.publicKey?.trim() || null,
      webhookSecretEnc,
      currency,
      active,
      now,
      now
    );

    // Test keys make a test business, left out of totals (Update 1.0).
    await run("UPDATE chapa_accounts SET mode = ?, currencies = ? WHERE id = ?", input.secretKey.trim().startsWith("CHASECK_TEST-") ? "test" : "live", JSON.stringify([currency]), id);
    await audit({ actor: user }, { action: "finance.chapa_account_create", summary: `${user.name} created Chapa account "${name}"` });
    return id;
  }
}

export async function deleteChapaAccount(user: AppUser, id: string): Promise<void> {
  if (!can(user, "finance.access") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can remove payment gateway accounts.");
  }

  const existing = await get<{ name: string }>("SELECT name FROM chapa_accounts WHERE id = ?", id);
  if (!existing) throw new WorkflowError("NOT_FOUND", "Chapa account not found.");

  await run("DELETE FROM chapa_accounts WHERE id = ?", id);
  await audit({ actor: user }, { action: "finance.chapa_account_delete", summary: `${user.name} deleted Chapa account "${existing.name}"` });
}

export async function testChapaAccount(user: AppUser, id: string): Promise<{ ok: boolean; message: string; balance?: number; mode?: string }> {
  if (!can(user, "finance.view") && !can(user, "finance.access") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Forbidden");
  }

  const row = await get<{ name: string; secret_key_enc: string; currency: string }>(
    "SELECT name, secret_key_enc, currency FROM chapa_accounts WHERE id = ?",
    id
  );
  if (!row) throw new WorkflowError("NOT_FOUND", "Account not found.");

  const secretKey = (await unseal(row.secret_key_enc))?.trim() ?? "";
  if (!secretKey) return { ok: false, message: "Missing secret key." };

  const isTest = secretKey.startsWith("CHASECK_TEST-");
  const mode = isTest ? "Test Mode" : "Live Production";

  try {
    // 1. First test balances endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch("https://api.chapa.co/v1/balances", {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json = await res.json().catch(() => null);
      const balances = Array.isArray(json?.data) ? json.data : (json?.data ? [json.data] : []);
      const matched = balances.find((b: any) => String(b.currency || "").toUpperCase() === (row.currency || "ETB").toUpperCase()) || balances[0];
      const balNum = parseFloat(matched?.available_balance ?? matched?.balance ?? 0) || 0;
      return {
        ok: true,
        message: `Connected successfully to Chapa (${mode}) for "${row.name}". Live Balance: ${balNum.toLocaleString()} ${row.currency || "ETB"}.`,
        balance: balNum,
        mode,
      };
    }

    // 2. If balances returned restricted HTTP (e.g. 400/403 on standard merchant tier), test banks endpoint to verify credentials
    const bCtrl = new AbortController();
    const bTimeout = setTimeout(() => bCtrl.abort(), 8000);
    const bankRes = await fetch("https://api.chapa.co/v1/banks", {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: bCtrl.signal,
    });
    clearTimeout(bTimeout);

    if (bankRes.ok) {
      const bankJson = await bankRes.json().catch(() => null);
      const bankCount = Array.isArray(bankJson?.data) ? bankJson.data.length : 0;
      return {
        ok: true,
        message: `API Key verified with Chapa (${mode}) for "${row.name}". Gateway connection active (${bankCount} banks available).`,
        balance: 0,
        mode,
      };
    }

    const errJson = await res.json().catch(() => null);
    const errMsg = errJson?.message || `HTTP ${res.status}: ${res.statusText}`;
    return { ok: false, message: `Chapa authentication failed: ${errMsg}`, mode };
  } catch (e: any) {
    return { ok: false, message: `Could not reach Chapa API: ${e?.message || e}`, mode };
  }
}

export async function fetchChapaBalances(user: AppUser): Promise<ChapaBalance[]> {
  const accounts = await listChapaAccounts(user);
  const out: ChapaBalance[] = [];

  for (const acc of accounts) {
    if (!acc.active) continue;
    const row = await get<{ secret_key_enc: string }>("SELECT secret_key_enc FROM chapa_accounts WHERE id = ?", acc.id);
    const secretKey = row?.secret_key_enc ? ((await unseal(row.secret_key_enc))?.trim() ?? "") : "";

    let bal: ChapaBalance = {
      accountId: acc.id,
      accountName: acc.name,
      currency: acc.currency,
      availableBalance: 0,
      ledgerBalance: 0,
      status: secretKey.startsWith("CHASECK_TEST-") ? "test_mode" : "connected",
    };

    if (secretKey) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch("https://api.chapa.co/v1/balances", {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const json = await res.json().catch(() => null);
          const balances = Array.isArray(json?.data) ? json.data : (json?.data ? [json.data] : []);
          const matched = balances.find((b: any) => String(b.currency || "").toUpperCase() === acc.currency.toUpperCase()) || balances[0];
          bal.availableBalance = parseFloat(matched?.available_balance ?? matched?.balance ?? 0) || 0;
          bal.ledgerBalance = parseFloat(matched?.ledger_balance ?? matched?.balance ?? 0) || 0;
          bal.status = secretKey.startsWith("CHASECK_TEST-") ? "test_mode" : "connected";
        } else {
          // If balances is not enabled on standard merchant tier, check bank list to confirm auth
          const bRes = await fetch("https://api.chapa.co/v1/banks", {
            headers: { Authorization: `Bearer ${secretKey}` },
          });
          if (bRes.ok) {
            bal.availableBalance = 0;
            bal.ledgerBalance = 0;
            bal.status = secretKey.startsWith("CHASECK_TEST-") ? "test_mode" : "connected";
          } else {
            bal.status = "error";
            bal.error = `HTTP ${res.status}`;
          }
        }
      } catch (err: any) {
        bal.status = "error";
        bal.error = err?.message || "Connection error";
      }
    }
    out.push(bal);
  }

  return out;
}

export async function clearAllChapaAccounts(user: AppUser): Promise<void> {
  if (!can(user, "finance.access") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can clear payment gateway accounts.");
  }
  await run("DELETE FROM chapa_accounts");
  await audit({ actor: user }, { action: "finance.chapa_accounts_clear", summary: `${user.name} cleared all Chapa accounts` });
}

export async function listChapaTransactions(user: AppUser, accountId?: string): Promise<ChapaTransaction[]> {
  const accounts = await listChapaAccounts(user);
  if (accounts.length === 0) return [];
  const targetAccounts = accountId ? accounts.filter((a) => a.id === accountId) : accounts;
  if (targetAccounts.length === 0) return [];

  const realTxs: ChapaTransaction[] = [];

  for (const acc of targetAccounts) {
    const row = await get<{ secret_key_enc: string }>("SELECT secret_key_enc FROM chapa_accounts WHERE id = ?", acc.id);
    const secretKey = row?.secret_key_enc ? ((await unseal(row.secret_key_enc))?.trim() ?? "") : "";
    if (!secretKey) continue;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("https://api.chapa.co/v1/transactions", {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json().catch(() => null);
        const rawList = Array.isArray(json?.data)
          ? json.data
          : Array.isArray(json?.data?.transactions)
          ? json.data.transactions
          : Array.isArray(json?.transactions)
          ? json.transactions
          : [];

        for (const t of rawList) {
          const txStatus = String(t.status || "").toLowerCase();
          realTxs.push({
            id: String(t.id || t.tx_ref || uid("tx_")),
            accountId: acc.id,
            accountName: acc.name,
            txRef: String(t.tx_ref || t.reference || t.id || ""),
            amount: parseFloat(t.amount ?? 0) || 0,
            currency: String(t.currency || acc.currency || "ETB").toUpperCase(),
            paymentMethod: String(t.payment_method || t.method || "Chapa"),
            status: txStatus === "success" || txStatus === "paid" ? "success" : txStatus === "failed" ? "failed" : "pending",
            customerName: `${t.first_name || ""} ${t.last_name || ""}`.trim() || t.customer_name || "Customer",
            customerEmail: t.email || t.customer_email || "—",
            customerPhone: t.phone_number || t.mobile || undefined,
            createdAt: t.created_at || t.createdAt || nowIso(),
          });
        }
      }
    } catch (err) {
      console.warn(`[chapa] Failed to fetch transactions for account ${acc.name}:`, err);
    }
  }

  // Sort descending by date
  realTxs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return realTxs;
}
