import { describe, expect, it, vi } from "vitest";
import { PlaidAccessTokenCipher } from "../../../src/app/plaid/access-token-cipher.js";
import { PlaidDataLifecycleService } from "../../../src/app/plaid/plaid-data-lifecycle.js";

const now = () => new Date("2026-10-15T12:00:00.000Z");

function setup(revokeItem = vi.fn().mockResolvedValue(undefined)) {
  const cipher = new PlaidAccessTokenCipher(new Uint8Array(32).fill(8), "v2", new Map([["v1", new Uint8Array(32).fill(7)]]));
  const item = { userId: "user-1", itemId: "item-1", token: new PlaidAccessTokenCipher(new Uint8Array(32).fill(7), "v1").encrypt("access"), attempts: 0 };
  const data = {
    beginDisconnect: vi.fn().mockResolvedValue([item]), listDueRevocations: vi.fn().mockResolvedValue([]),
    countPendingRevocations: vi.fn().mockResolvedValue(0),
    completeRevocation: vi.fn().mockResolvedValue(undefined), failRevocation: vi.fn().mockResolvedValue(undefined),
    expireOldTransactions: vi.fn().mockResolvedValue(4), replaceToken: vi.fn(async (_id: string, token: import("../../../src/app/plaid/access-token-cipher.js").EncryptedPlaidAccessToken) => token),
    listAllEncryptedTokens: vi.fn().mockResolvedValue([item])
  };
  const consent = { getConsent: vi.fn().mockResolvedValue({ status: "active", consentId: "grant-1" }),
    revoke: vi.fn().mockResolvedValue(undefined) };
  const invalidateMemoryCache = vi.fn();
  const service = new PlaidDataLifecycleService({ consent, data, plaid: { revokeItem }, cipher, now, invalidateMemoryCache });
  return { service, data, consent, cipher, item, revokeItem, invalidateMemoryCache };
}

describe("PlaidDataLifecycleService", () => {
  it("LIFE-002 and LIFE-003 revoke consent, purge local data first, then remove the remote Item", async () => {
    const state = setup();
    await expect(state.service.disconnect("user-1")).resolves.toEqual({ revoked: 1, pending: 0 });
    expect(state.consent.revoke).toHaveBeenCalledWith(expect.objectContaining({ grantEventId: "grant-1" }));
    expect(state.data.beginDisconnect).toHaveBeenCalledWith("user-1", undefined);
    expect(state.invalidateMemoryCache).toHaveBeenCalledWith("user-1");
    expect(state.revokeItem).toHaveBeenCalledWith("access");
    expect(state.data.completeRevocation).toHaveBeenCalledWith("item-1");
  });

  it("LIFE-004 keeps a remote revocation retryable after provider failure", async () => {
    const revokeItem = vi.fn().mockRejectedValueOnce(new Error("provider error")).mockResolvedValue(undefined);
    const state = setup(revokeItem);
    state.data.countPendingRevocations.mockResolvedValue(1);
    await expect(state.service.disconnect("user-1", "item-1")).resolves.toEqual({ revoked: 0, pending: 1 });
    expect(state.consent.revoke).not.toHaveBeenCalled();
    expect(state.data.failRevocation).toHaveBeenCalledWith("item-1", "2026-10-15T12:01:00.000Z");

    state.data.listDueRevocations.mockResolvedValue([{ ...state.item, attempts: 1 }]);
    await expect(state.service.retryDueRevocations()).resolves.toEqual({ revoked: 1, pending: 0 });
    expect(revokeItem).toHaveBeenCalledTimes(2);
    expect(state.data.completeRevocation).toHaveBeenCalledWith("item-1");
  });

  it("LIFE-001 expires raw transaction rows through the bounded retention operation", async () => {
    const state = setup();
    await expect(state.service.expire()).resolves.toBe(4);
    expect(state.data.expireOldTransactions).toHaveBeenCalledWith(now());
  });

  it("LIFE-005 rotates every stored Item envelope and verifies the replacement", async () => {
    const state = setup();
    await expect(state.service.rotateKeys()).resolves.toBe(1);
    const replacement = state.data.replaceToken.mock.calls[0]?.[1];
    expect(replacement?.keyVersion).toBe("v2");
    expect(state.cipher.decrypt(replacement!)).toBe("access");
  });

  it("LIFE-005 fails closed when an old key is unavailable", async () => {
    const state = setup();
    const cipherWithoutPrior = new PlaidAccessTokenCipher(new Uint8Array(32).fill(8), "v2");
    const service = new PlaidDataLifecycleService({ consent: state.consent, data: state.data,
      plaid: { revokeItem: state.revokeItem }, cipher: cipherWithoutPrior, now });

    await expect(service.rotateKeys()).rejects.toThrow("key version is unavailable");
    expect(state.data.replaceToken).not.toHaveBeenCalled();
  });

  it("LIFE-005 refuses to report rotation if the persisted token does not verify", async () => {
    const state = setup();
    state.data.replaceToken.mockResolvedValue(state.item.token);

    await expect(state.service.rotateKeys()).rejects.toThrow("Plaid token rotation verification failed.");
  });
});
