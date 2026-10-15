import type { PlaidEnv } from "../../config/env.js";

export interface PlaidSyncedTransaction {
  readonly transactionId: string;
  readonly amountCents: number;
  readonly currencyCode: string | null;
  readonly date: string;
  readonly merchantName: string | null;
  readonly category: string | null;
  readonly detailedCategory: string | null;
  readonly merchantEntityId: string | null;
  readonly paymentChannel: string | null;
  readonly pending: boolean;
}

export interface PlaidTransactionSyncPage {
  readonly added: readonly PlaidSyncedTransaction[];
  readonly modified: readonly PlaidSyncedTransaction[];
  readonly removed: readonly string[];
  readonly nextCursor: string;
  readonly hasMore: boolean;
}

export interface PlaidApiClientOptions {
  readonly clientId: string;
  readonly secret: string;
  readonly environment: PlaidEnv;
  readonly apiVersion?: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

export class PlaidApiError extends Error {
  constructor(readonly status: number, readonly retryable: boolean) {
    super("Plaid API request failed.");
    this.name = "PlaidApiError";
  }
}

interface PlaidTransactionPayload {
  transaction_id?: unknown;
  amount?: unknown;
  iso_currency_code?: unknown;
  date?: unknown;
  merchant_name?: unknown;
  name?: unknown;
  pending?: unknown;
  personal_finance_category?: { primary?: unknown; detailed?: unknown } | null;
  merchant_entity_id?: unknown;
  payment_channel?: unknown;
}

/** Plaid Items and Transactions client. Secrets and access tokens never leave server calls. */
export class PlaidApiClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: PlaidApiClientOptions) {
    if (!options.clientId.trim() || !options.secret.trim()) throw new Error("Plaid client credentials are required.");
    if (options.environment !== "sandbox") throw new Error("Only the Plaid sandbox environment is enabled.");
    this.fetcher = options.fetcher ?? fetch;
    this.baseUrl = "https://sandbox.plaid.com";
  }

  async exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
    if (typeof publicToken !== "string" || !publicToken.trim() || publicToken.length > 2048) {
      throw new Error("Invalid Plaid public token.");
    }
    const result = await this.post("/item/public_token/exchange", { public_token: publicToken });
    const accessToken = readString(result, "access_token");
    const itemId = readString(result, "item_id");
    return { accessToken, itemId };
  }

  async syncTransactions(input: { accessToken: string; cursor: string | null }): Promise<PlaidTransactionSyncPage> {
    if (!input.accessToken.trim()) throw new Error("A Plaid access token is required.");
    const result = await this.post("/transactions/sync", {
      access_token: input.accessToken,
      ...(input.cursor ? { cursor: input.cursor } : {}),
      count: 500,
      options: { include_original_description: false }
    });
    if (!Array.isArray(result.added) || !Array.isArray(result.modified) || !Array.isArray(result.removed) ||
        typeof result.has_more !== "boolean") throw new Error("Invalid Plaid transactions sync response.");
    const nextCursor = readString(result, "next_cursor");
    const removed = result.removed.map((entry) => {
      if (!entry || typeof entry !== "object") throw new Error("Invalid Plaid removed transaction.");
      return readString(entry as Record<string, unknown>, "transaction_id");
    });
    return Object.freeze({
      added: Object.freeze(result.added.map(parseTransaction)),
      modified: Object.freeze(result.modified.map(parseTransaction)),
      removed: Object.freeze(removed),
      nextCursor,
      hasMore: result.has_more
    });
  }

  async revokeItem(accessToken: string): Promise<void> {
    if (typeof accessToken !== "string" || !accessToken.trim() || accessToken.length > 2048) throw new Error("A valid Plaid access token is required.");
    await this.post("/item/remove", { access_token: accessToken });
  }

  private async post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      headers: {
        "Content-Type": "application/json",
        "PLAID-CLIENT-ID": this.options.clientId,
        "PLAID-SECRET": this.options.secret,
        "Plaid-Version": this.options.apiVersion ?? "2020-09-14"
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    if (!response.ok) throw new PlaidApiError(response.status, response.status === 429 || response.status >= 500);
    let result: unknown;
    try { result = await response.json(); } catch { throw new Error("Invalid Plaid API response."); }
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid Plaid API response.");
    return result as Record<string, unknown>;
  }
}

function parseTransaction(value: unknown): PlaidSyncedTransaction {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Plaid transaction.");
  const transaction = value as PlaidTransactionPayload;
  if (typeof transaction.transaction_id !== "string" || !transaction.transaction_id.trim() ||
      typeof transaction.amount !== "number" || !Number.isFinite(transaction.amount) ||
      typeof transaction.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date) ||
      typeof transaction.pending !== "boolean") throw new Error("Invalid Plaid transaction.");
  const amountCents = Math.round(transaction.amount * 100);
  if (!Number.isSafeInteger(amountCents) || Math.abs(transaction.amount * 100 - amountCents) > 1e-6) {
    throw new Error("Invalid Plaid transaction amount.");
  }
  const merchant = typeof transaction.merchant_name === "string" && transaction.merchant_name.trim()
    ? transaction.merchant_name.trim()
    : typeof transaction.name === "string" ? transaction.name.trim() : "";
  const primaryCategory = transaction.personal_finance_category?.primary;
  const paymentChannel = typeof transaction.payment_channel === "string"
    ? transaction.payment_channel.toLowerCase().replace(/[_-]+/g, " ").trim()
    : null;
  return Object.freeze({
    transactionId: transaction.transaction_id,
    amountCents,
    currencyCode: typeof transaction.iso_currency_code === "string" ? transaction.iso_currency_code : null,
    date: transaction.date,
    merchantName: merchant || null,
    category: typeof primaryCategory === "string" && primaryCategory.trim() ? primaryCategory.trim() : null,
    detailedCategory: typeof transaction.personal_finance_category?.detailed === "string" && transaction.personal_finance_category.detailed.trim()
      ? transaction.personal_finance_category.detailed.trim() : null,
    merchantEntityId: typeof transaction.merchant_entity_id === "string" && transaction.merchant_entity_id.trim()
      ? transaction.merchant_entity_id.trim() : null,
    paymentChannel: paymentChannel === "in store" || paymentChannel === "online" || paymentChannel === "other"
      ? paymentChannel : null,
    pending: transaction.pending
  });
}

function readString(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== "string" || !result.trim()) throw new Error("Invalid Plaid API response.");
  return result.trim();
}
