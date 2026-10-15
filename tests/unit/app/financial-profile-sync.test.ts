import { describe, expect, it, vi } from "vitest";
import { PlaidAccessTokenCipher } from "../../../src/app/plaid/access-token-cipher.js";
import { FinancialProfileSyncService } from "../../../src/app/plaid/financial-profile-sync.js";
import type { PlaidSyncedTransaction } from "../../../src/app/plaid/plaid-api-client.js";

const transaction: PlaidSyncedTransaction = {
  transactionId: "tx-1", amountCents: 1299, currencyCode: "USD", date: "2026-10-01",
  merchantName: "Cafe", category: "FOOD_AND_DRINK", detailedCategory: "FOOD_AND_DRINK_COFFEE",
  merchantEntityId: "merchant-1", paymentChannel: "online", pending: false
};

describe("FinancialProfileSyncService", () => {
  it("persists each cursor page and refreshes transaction profile memory when complete", async () => {
    const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(8));
    const item = { userId: "user-1", itemId: "item-1", token: cipher.encrypt("access-token"), cursor: null };
    const applySyncPage = vi.fn(async () => undefined);
    const pruneTransactionsBefore = vi.fn(async () => undefined);
    const syncTransactions = vi.fn()
      .mockResolvedValueOnce({ added: [transaction], modified: [], removed: [], nextCursor: "page-1", hasMore: true })
      .mockResolvedValueOnce({ added: [], modified: [], removed: [], nextCursor: "page-2", hasMore: false });
    const rememberFinancialProfile = vi.fn(async () => []);
    const service = new FinancialProfileSyncService({
      consent: { getConsent: vi.fn(async () => ({ userId: "user-1", status: "active", products: ["transactions"] })) },
      data: { listItems: vi.fn(async () => [item]), applySyncPage, listTransactions: vi.fn(async () => [
        { ...transaction, itemId: "item-1" }
      ]), pruneTransactionsBefore },
      plaid: { syncTransactions }, cipher, profiles: { rememberFinancialProfile },
      now: () => new Date("2026-10-13T12:00:00Z")
    });

    const result = await service.syncUser("user-1");

    expect(syncTransactions).toHaveBeenNthCalledWith(1, { accessToken: "access-token", cursor: null });
    expect(syncTransactions).toHaveBeenNthCalledWith(2, { accessToken: "access-token", cursor: "page-1" });
    expect(applySyncPage).toHaveBeenCalledTimes(2);
    expect(rememberFinancialProfile).toHaveBeenCalledWith(result.profile);
    expect(pruneTransactionsBefore).toHaveBeenCalledWith("user-1", "2026-07-15");
    expect(result.profile.facts).toHaveLength(3);
    expect(result.profile.metadataAvailability.hasEnrichableMetadata).toBe(true);
    expect(result.profile.metadataAvailability.fields.detailedCategory.coverage).toBe(1);
    expect(result.syncedPages).toBe(2);
  });

  it("does not prune transaction rows when profile persistence fails", async () => {
    const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(8));
    const pruneTransactionsBefore = vi.fn(async () => undefined);
    const service = new FinancialProfileSyncService({
      consent: { getConsent: vi.fn(async () => ({ userId: "user-1", status: "active", products: ["transactions"] })) },
      data: { listItems: vi.fn(async () => []), applySyncPage: vi.fn(), listTransactions: vi.fn(async () => []), pruneTransactionsBefore },
      plaid: { syncTransactions: vi.fn() }, cipher,
      profiles: { rememberFinancialProfile: vi.fn(async () => { throw new Error("storage unavailable"); }) },
      now: () => new Date("2026-10-13T12:00:00Z")
    });
    await expect(service.syncUser("user-1")).rejects.toThrow("storage unavailable");
    expect(pruneTransactionsBefore).not.toHaveBeenCalled();
  });

  it("does not call Plaid or refresh memories without active transaction consent", async () => {
    const syncTransactions = vi.fn();
    const rememberFinancialProfile = vi.fn();
    const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(8));
    const service = new FinancialProfileSyncService({
      consent: { getConsent: vi.fn(async () => ({ userId: "user-1", status: "revoked", products: ["transactions"] })) },
      data: { listItems: vi.fn(async () => []), applySyncPage: vi.fn(), listTransactions: vi.fn(async () => []), pruneTransactionsBefore: vi.fn() },
      plaid: { syncTransactions }, cipher, profiles: { rememberFinancialProfile }
    });

    await expect(service.syncUser("user-1")).rejects.toThrow("Active Transactions consent is required.");
    expect(syncTransactions).not.toHaveBeenCalled();
    expect(rememberFinancialProfile).not.toHaveBeenCalled();
  });
});
