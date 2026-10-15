import { randomUUID } from "node:crypto";
import type { PlaidAccessTokenCipher } from "./access-token-cipher.js";
import type { PlaidConsentRepository } from "./consent-repository.js";
import type { PlaidApiClient } from "./plaid-api-client.js";
import type { PlaidDataRepository } from "./plaid-data-repository.js";
import type { MemoryOrchestrator } from "../../agent/memory/memory-orchestrator.js";

/** Disconnects the Plaid source while keeping all non-Plaid memory and personalization. */
export class FinancialProfileLifecycleService {
  constructor(private readonly dependencies: {
    consent: Pick<PlaidConsentRepository, "getConsent" | "revoke" | "eraseConsentHistoryForDeletedAccount">;
    data: Pick<PlaidDataRepository, "markDisconnectPending" | "listItemsForRemoval" | "deleteTransactionsForUser" | "deleteItem">;
    plaid: Pick<PlaidApiClient, "removeItem">;
    cipher: PlaidAccessTokenCipher;
    memories: Pick<MemoryOrchestrator, "erasePlaidFinancialProfile">;
    now?: () => Date;
  }) {}

  async disconnectUser(userId: string): Promise<{ readonly disconnected: boolean; readonly pendingProviderRemovals: number }> {
    if (!userId.trim()) throw new Error("A user ID is required.");
    const current = await this.dependencies.consent.getConsent(userId);
    if (current?.status === "active") {
      await this.dependencies.consent.revoke({ eventId: randomUUID(), userId,
        grantEventId: current.consentId, revokedAt: (this.dependencies.now?.() ?? new Date()).toISOString() });
    }
    // Stop future sync first, then remove local data before attempting external revocation.
    await this.dependencies.data.markDisconnectPending(userId);
    await this.dependencies.data.deleteTransactionsForUser(userId);
    await this.dependencies.memories.erasePlaidFinancialProfile(userId);

    let pendingProviderRemovals = 0;
    for (const item of await this.dependencies.data.listItemsForRemoval(userId)) {
      let removedAtProvider = false;
      try {
        await this.dependencies.plaid.removeItem(this.dependencies.cipher.decrypt(item.token));
        removedAtProvider = true;
      } catch {
        // Keep only the encrypted token envelope for an authenticated retry; sync excludes pending Items.
        pendingProviderRemovals++;
      }
      if (removedAtProvider) await this.dependencies.data.deleteItem(userId, item.itemId);
    }
    return Object.freeze({ disconnected: pendingProviderRemovals === 0, pendingProviderRemovals });
  }

  /** Full-account deletion calls this only after provider removal and all local account deletion have completed. */
  async completeAccountDeletion(userId: string): Promise<void> {
    if (!userId.trim()) throw new Error("A user ID is required.");
    if ((await this.dependencies.data.listItemsForRemoval(userId)).length !== 0) {
      throw new Error("Plaid Item removal must complete before consent history erasure.");
    }
    const consent = await this.dependencies.consent.getConsent(userId);
    if (consent?.status === "active") throw new Error("Plaid consent must be revoked before account erasure.");
    await this.dependencies.consent.eraseConsentHistoryForDeletedAccount(userId);
  }
}
