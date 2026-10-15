import { randomUUID } from "node:crypto";
import type { PlaidAccessTokenCipher } from "./access-token-cipher.js";
import { PlaidApiError, type PlaidApiClient } from "./plaid-api-client.js";
import type { PlaidConsentRepository } from "./consent-repository.js";
import type { PlaidDataRepository, PlaidRevocationItem } from "./plaid-data-repository.js";

export class PlaidDataLifecycleService {
  constructor(private readonly deps: {
    consent: Pick<PlaidConsentRepository, "getConsent" | "revoke">;
    data: Pick<PlaidDataRepository, "beginDisconnect" | "listDueRevocations" | "countPendingRevocations" | "completeRevocation" | "failRevocation" | "expireOldTransactions" | "replaceToken" | "listAllEncryptedTokensForMaintenance">;
    plaid: Pick<PlaidApiClient, "revokeItem">;
    cipher: PlaidAccessTokenCipher;
    invalidateMemoryCache?: (userId: string) => void;
    now?: () => Date;
  }) {}

  async disconnect(userId: string, itemId?: string): Promise<{ revoked: number; pending: number }> {
    const consent = await this.deps.consent.getConsent(userId);
    if (!itemId && consent?.status === "active") {
      await this.deps.consent.revoke({ eventId: `consent_${randomUUID()}`, userId,
        grantEventId: consent.consentId, revokedAt: (this.deps.now?.() ?? new Date()).toISOString() });
    }
    // Local credentials, transactions, and derived memories are removed before remote calls.
    const queued = await this.deps.data.beginDisconnect(userId, itemId);
    this.deps.invalidateMemoryCache?.(userId);
    const due = await this.deps.data.listDueRevocations(100, userId, itemId);
    const work = new Map([...queued, ...due]
      .filter((item) => item.userId === userId && (!itemId || item.itemId === itemId))
      .map((item) => [item.itemId, item]));
    const result = await this.process([...work.values()]);
    return { ...result, pending: await this.deps.data.countPendingRevocations(userId, itemId) };
  }

  async retryDueRevocations(limit?: number): Promise<{ revoked: number; pending: number }> {
    return this.process(await this.deps.data.listDueRevocations(limit));
  }

  async expire(now?: Date): Promise<number> {
    return this.deps.data.expireOldTransactions(now ?? this.deps.now?.() ?? new Date());
  }

  /** Re-encrypts active and queued tokens, then verifies every persisted envelope before returning. */
  async rotateKeys(): Promise<number> {
    const tokens = await this.deps.data.listAllEncryptedTokensForMaintenance();
    let rotated = 0;
    for (const item of tokens) {
      const plaintext = this.deps.cipher.decrypt(item.token);
      const token = this.deps.cipher.rotate(item.token);
      const persisted = await this.deps.data.replaceToken(item.userId, item.itemId, token);
      if (persisted.keyVersion !== token.keyVersion || this.deps.cipher.decrypt(persisted) !== plaintext) {
        throw new Error("Plaid token rotation verification failed.");
      }
      rotated++;
    }
    return rotated;
  }

  private async process(items: readonly PlaidRevocationItem[]): Promise<{ revoked: number; pending: number }> {
    let revoked = 0;
    let pending = 0;
    for (const item of items) {
      try {
        await this.deps.plaid.revokeItem(this.deps.cipher.decrypt(item.token));
        await this.deps.data.completeRevocation(item.userId, item.itemId);
        revoked++;
      } catch (error) {
        if (error instanceof PlaidApiError && !error.retryable) {
          await this.deps.data.failRevocation(item.userId, item.itemId, null, true, `provider_http_${error.status}`);
          pending++;
          continue;
        }
        const delayMs = Math.min(24 * 60 * 60_000, 60_000 * (2 ** Math.min(item.attempts, 10)));
        await this.deps.data.failRevocation(item.userId, item.itemId,
          new Date((this.deps.now?.() ?? new Date()).getTime() + delayMs).toISOString());
        pending++;
      }
    }
    return { revoked, pending };
  }
}
