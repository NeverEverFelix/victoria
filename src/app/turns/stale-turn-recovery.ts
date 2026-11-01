import { isTurnActionReceipt } from "./turn-action-receipt.js";
import type { ProcessQueuedTurnResult } from "./queued-turn-processor.js";
import type { TurnRepository } from "./turn-repository.js";

export interface StaleTurnRecoverySummary {
  readonly scanned: number;
  readonly completedFromReceipt: number;
  readonly markedInterrupted: number;
  readonly racedOrFailed: number;
}

/**
 * Resolves orphaned running turns without replaying an unreceipted financial action.
 * Receipted actions are finalized; turns without a receipt become explicitly failed
 * so callers can distinguish interruption from an in-progress turn.
 */
export function createStaleTurnRecoveryProcessor(dependencies: {
  readonly turns: TurnRepository;
  readonly processQueuedTurn: (input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly turnId: string;
  }) => Promise<ProcessQueuedTurnResult>;
  readonly now?: () => string;
  readonly staleAfterMs?: number;
  readonly batchLimit?: number;
}) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const staleAfterMs = dependencies.staleAfterMs ?? 15 * 60_000;
  const batchLimit = dependencies.batchLimit ?? 25;
  if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs < 60_000) {
    throw new Error("Stale turn recovery requires a minimum one-minute age threshold.");
  }
  if (!Number.isSafeInteger(batchLimit) || batchLimit < 1 || batchLimit > 500) {
    throw new Error("Stale turn recovery batch limit must be from 1 through 500.");
  }
  const listStaleRunning = dependencies.turns.listStaleRunning;
  if (!listStaleRunning) {
    throw new Error("The turn repository does not support stale-running-turn recovery.");
  }

  return async function recoverStaleTurns(): Promise<StaleTurnRecoverySummary> {
    const nowValue = now();
    const nowMs = Date.parse(nowValue);
    if (!Number.isFinite(nowMs)) throw new Error("Stale turn recovery clock returned an invalid timestamp.");
    const candidates = await listStaleRunning.call(dependencies.turns, {
      olderThan: new Date(nowMs - staleAfterMs).toISOString(),
      limit: batchLimit
    });
    let completedFromReceipt = 0;
    let markedInterrupted = 0;
    let racedOrFailed = 0;

    for (const turn of candidates) {
      if (isTurnActionReceipt(turn.resultPayload)) {
        try {
          const result = await dependencies.processQueuedTurn({
            userId: turn.userId, conversationId: turn.conversationId, turnId: turn.id
          });
          if (result.status === "completed") completedFromReceipt++;
          else racedOrFailed++;
        } catch {
          racedOrFailed++;
        }
        continue;
      }

      try {
        await dependencies.turns.compareAndTransition({
          userId: turn.userId,
          conversationId: turn.conversationId,
          turnId: turn.id,
          expectedRevision: turn.revision,
          transition: { type: "fail", at: now(), failureCode: "worker_interrupted" }
        });
        markedInterrupted++;
      } catch {
        // A live worker may have advanced the revision after the recovery scan.
        racedOrFailed++;
      }
    }

    return Object.freeze({
      scanned: candidates.length,
      completedFromReceipt,
      markedInterrupted,
      racedOrFailed
    });
  };
}
