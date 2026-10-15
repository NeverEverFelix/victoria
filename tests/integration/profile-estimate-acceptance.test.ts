import { describe, expect, it, vi } from "vitest";
import { MockLlmAdapter } from "../../src/agent/llm/mock-llm.js";
import { MockMemoryProvider } from "../../src/agent/memory/mock-memory.js";
import { MockVictoriaTools } from "../../src/agent/tools/mock-tools.js";
import { VictoriaAgent } from "../../src/agent/victoria-agent.js";
import { MockProfileTransactionHistoryProvider } from "../../src/app/financial-profile/mock-profile-transaction-history-provider.js";
import { createFinancialProfileSyncHandler } from "../../src/app/plaid/financial-profile-sync-handler.js";
import { FinancialProfileSyncService } from "../../src/app/plaid/financial-profile-sync.js";
import { PlaidAccessTokenCipher } from "../../src/app/plaid/access-token-cipher.js";
import type { PlaidSyncedTransaction } from "../../src/app/plaid/plaid-api-client.js";
import type { TransactionFinancialProfile } from "../../src/domain/financial-profile.js";

const transactions: readonly PlaidSyncedTransaction[] = [600, 800, 1_000].map((amountCents, index) => ({
  transactionId: `transaction-${index}`,
  amountCents,
  currencyCode: "USD",
  date: `2026-10-${String(12 + index).padStart(2, "0")}`,
  merchantName: "Blue Bottle",
  category: "FOOD_AND_DRINK",
  detailedCategory: "FOOD_AND_DRINK_COFFEE",
  merchantEntityId: null,
  paymentChannel: "in store",
  pending: false
}));

describe("authenticated profile-to-estimate flow", () => {
  it("uses only the authenticated user's profile and still requires confirmation", async () => {
    const userId = "user-authenticated";
    const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(9));
    let writtenProfile: TransactionFinancialProfile | undefined;
    const profileWriter = {
      rememberFinancialProfile: vi.fn(async (profile: TransactionFinancialProfile) => {
        writtenProfile = profile;
        return [];
      })
    };
    const listItems = vi.fn(async (requestedUserId: string) => requestedUserId === userId
      ? [{ userId, itemId: "item-1", token: cipher.encrypt("test-access-token"), cursor: null }]
      : []);
    const sync = new FinancialProfileSyncService({
      consent: {
        getConsent: vi.fn(async (requestedUserId: string) => requestedUserId === userId
          ? { userId, status: "active", products: ["transactions"] }
          : null)
      },
      data: {
        listItems,
        applySyncPage: vi.fn(async () => undefined),
        listTransactions: vi.fn(async (requestedUserId: string) => requestedUserId === userId
          ? transactions.map((transaction) => ({ ...transaction, itemId: "item-1" }))
          : [])
      },
      plaid: {
        syncTransactions: vi.fn(async () => ({
          added: [], modified: [], removed: [], nextCursor: "cursor-1", hasMore: false
        }))
      },
      cipher,
      profiles: profileWriter,
      now: () => new Date("2026-10-15T12:00:00.000Z")
    });
    const authenticate = vi.fn(async () => ({ userId }));
    const refresh = createFinancialProfileSyncHandler({ authenticate, sync });
    const refreshResponse = await refresh(new Request("https://victoria.test/api/profile/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "attacker-controlled-user" })
    }));

    expect(refreshResponse.status).toBe(200);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(listItems).toHaveBeenCalledTimes(1);
    expect(listItems).toHaveBeenCalledWith(userId);
    expect(profileWriter.rememberFinancialProfile).toHaveBeenCalledOnce();
    const profile = writtenProfile;
    expect(profile?.userId).toBe(userId);

    const profileProvider = new MockProfileTransactionHistoryProvider(profile ? [profile] : []);
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      transactionHistory: profileProvider
    });

    const userEstimate = await agent.respond({
      userId, conversationId: "profile-acceptance",
      message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(profileProvider.lookupLog).toEqual([{ userId, merchantName: "Blue Bottle" }]);
    expect(userEstimate.decision.suggestion).toMatchObject({
      amountCents: 800, source: "transaction_history",
      reason: expect.stringContaining("3 recent transactions")
    });
    expect(userEstimate.message).toContain("Based on your usual spend at Blue Bottle");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const otherUserEstimate = await agent.respond({
      userId: "different-user", conversationId: "different-user-conversation",
      message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(otherUserEstimate.decision.action).toBe("ask_follow_up");
    expect(otherUserEstimate.decision.suggestion).toBeUndefined();
    expect(profileProvider.lookupLog.at(-1)?.userId).toBe("different-user");
    expect(await tools.listSavingsEntries("different-user")).toEqual([]);

    const confirmation = await agent.respond({
      userId, conversationId: "profile-acceptance", message: "Yes"
    });
    expect(confirmation.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toMatchObject([{
      amountCents: 800, movementMode: "mock_ledger"
    }]);
  });

  it("does not refresh or estimate after consent is revoked", async () => {
    const userId = "user-revoked";
    const syncTransactions = vi.fn();
    const rememberFinancialProfile = vi.fn();
    const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(10));
    const sync = new FinancialProfileSyncService({
      consent: { getConsent: vi.fn(async () => ({ userId, status: "revoked", products: ["transactions"] })) },
      data: {
        listItems: vi.fn(async () => [{ userId, itemId: "item-1", token: cipher.encrypt("test-access-token"), cursor: null }]),
        applySyncPage: vi.fn(), listTransactions: vi.fn(async () => [])
      },
      plaid: { syncTransactions }, cipher, profiles: { rememberFinancialProfile }
    });
    const refresh = createFinancialProfileSyncHandler({
      authenticate: async () => ({ userId }), sync
    });

    const response = await refresh(new Request("https://victoria.test/api/profile/refresh", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(syncTransactions).not.toHaveBeenCalled();
    expect(rememberFinancialProfile).not.toHaveBeenCalled();
  });
});
