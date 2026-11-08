import { buildTransactionFinancialProfile, FINANCIAL_PROFILE_LOOKBACK_DAYS } from "../../domain/financial-profile.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";
import type { PlaidAccessTokenCipher } from "./access-token-cipher.js";
import type { PlaidApiClient } from "./plaid-api-client.js";
import type { PlaidDataRepository } from "./plaid-data-repository.js";

export interface FinancialProfileWriter {
  rememberFinancialProfile(profile: TransactionFinancialProfile): Promise<readonly unknown[]>;
}

export class FinancialProfileSyncService {
  constructor(private readonly dependencies: {
    consent: { getConsent(userId: string): Promise<{ readonly userId: string; readonly status: string; readonly products: readonly string[] } | null> };
    data: Pick<PlaidDataRepository, "listItems" | "applySyncPage" | "listTransactions">;
    plaid: Pick<PlaidApiClient, "syncTransactions">;
    cipher: PlaidAccessTokenCipher;
    profiles: FinancialProfileWriter;
    now?: () => Date;
    maxPagesPerItem?: number;
    maxItems?: number;
    maxTotalPages?: number;
  }) {}

  async syncUser(userId: string): Promise<{ readonly profile: TransactionFinancialProfile; readonly syncedPages: number }> {
    if (!userId.trim()) throw new Error("A user ID is required.");
    const consent = await this.dependencies.consent.getConsent(userId);
    if (!consent || consent.userId !== userId || consent.status !== "active" ||
        !consent.products.includes("transactions")) throw new Error("Active Transactions consent is required.");
    const items = await this.dependencies.data.listItems(userId);
    if (items.length > (this.dependencies.maxItems ?? 10)) throw new Error("Plaid Item limit reached; profile refresh deferred.");
    let syncedPages = 0;
    for (const item of items) {
      if (item.userId !== userId) throw new Error("Plaid Item ownership mismatch.");
      const accessToken = this.dependencies.cipher.decrypt(item.token);
      let cursor = item.cursor;
      let hasMore = true;
      let pages = 0;
      while (hasMore) {
        const currentConsent = await this.dependencies.consent.getConsent(userId);
        if (!currentConsent || currentConsent.userId !== userId || currentConsent.status !== "active" ||
            !currentConsent.products.includes("transactions")) throw new Error("Active Transactions consent is required.");
        if (++pages > (this.dependencies.maxPagesPerItem ?? 100)) throw new Error("Plaid sync page limit reached; profile refresh deferred.");
        if (syncedPages >= (this.dependencies.maxTotalPages ?? 100)) throw new Error("Plaid total sync page limit reached; profile refresh deferred.");
        const page = await this.dependencies.plaid.syncTransactions({ accessToken, cursor });
        await this.dependencies.data.applySyncPage(userId, item.itemId, page);
        cursor = page.nextCursor;
        hasMore = page.hasMore;
        syncedPages++;
      }
    }

    const now = this.dependencies.now?.() ?? new Date();
    const since = new Date(now.getTime() - FINANCIAL_PROFILE_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
    const transactions = await this.dependencies.data.listTransactions(userId, since);
    const profile = buildTransactionFinancialProfile({
      userId,
      now,
      transactions: transactions.map((transaction) => ({
        transactionId: `${transaction.itemId}:${transaction.transactionId}`,
        amountCents: transaction.amountCents,
        isoCurrencyCode: transaction.currencyCode,
        date: transaction.date,
        merchantName: transaction.merchantName,
        category: transaction.category,
        detailedCategory: transaction.detailedCategory,
        merchantEntityId: transaction.merchantEntityId,
        paymentChannel: transaction.paymentChannel,
        pending: transaction.pending
      }))
    });
    await this.dependencies.profiles.rememberFinancialProfile(profile);
    return Object.freeze({ profile, syncedPages });
  }
}
