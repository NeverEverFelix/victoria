import { describe, expect, it, vi } from "vitest";
import { PlaidAccessTokenCipher } from "../../../src/app/plaid/access-token-cipher.js";
import { FinancialProfileLifecycleService } from "../../../src/app/plaid/financial-profile-lifecycle.js";

describe("FinancialProfileLifecycleService", () => {
  it("revokes access, removes local Plaid data, preserves non-Plaid memory, and reports retryable provider failure", async () => {
    const order: string[] = [];
    const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(3));
    const item = { userId: "user-a", itemId: "item-a", token: cipher.encrypt("access-token"), cursor: null, disconnectPending: true };
    const consent = {
      getConsent: vi.fn(async () => ({ consentId: "grant-a", userId: "user-a", status: "active" as const,
        products: ["transactions" as const], purpose: "financial_profile" as const, grantedAt: "2026-10-01T00:00:00.000Z", revokedAt: null })),
      revoke: vi.fn(async () => { order.push("revoke"); return null; }),
      eraseConsentHistoryForDeletedAccount: vi.fn(async () => undefined)
    };
    const data = {
      markDisconnectPending: vi.fn(async () => { order.push("disable-sync"); }),
      deleteTransactionsForUser: vi.fn(async () => { order.push("delete-transactions"); }),
      listItemsForRemoval: vi.fn(async () => [item]),
      deleteItem: vi.fn(async () => undefined)
    };
    const memories = { erasePlaidFinancialProfile: vi.fn(async () => { order.push("erase-plaid-memory"); }) };
    const plaid = { removeItem: vi.fn(async () => { order.push("remove-provider"); throw new Error("temporary provider failure"); }) };
    const service = new FinancialProfileLifecycleService({ consent, data, plaid, cipher, memories, now: () => new Date("2026-10-15T12:00:00Z") });

    await expect(service.disconnectUser("user-a")).resolves.toEqual({ disconnected: false, pendingProviderRemovals: 1 });
    expect(order).toEqual(["revoke", "disable-sync", "delete-transactions", "erase-plaid-memory", "remove-provider"]);
    expect(plaid.removeItem).toHaveBeenCalledWith("access-token");
    expect(data.deleteItem).not.toHaveBeenCalled();
  });

  it("does not erase consent history until all Items are removed", async () => {
    const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(4));
    const service = new FinancialProfileLifecycleService({
      consent: { getConsent: vi.fn(async () => null), revoke: vi.fn(), eraseConsentHistoryForDeletedAccount: vi.fn() },
      data: { markDisconnectPending: vi.fn(), deleteTransactionsForUser: vi.fn(), listItemsForRemoval: vi.fn(async () => [
        { userId: "user-a", itemId: "item-a", token: cipher.encrypt("token"), cursor: null }
      ]), deleteItem: vi.fn() },
      plaid: { removeItem: vi.fn() }, cipher, memories: { erasePlaidFinancialProfile: vi.fn() }
    });
    await expect(service.completeAccountDeletion("user-a")).rejects.toThrow("must complete before consent history erasure");
  });
});
