import { transitionTurn, type TurnRecord, type TurnTransition } from "../../domain/turns/lifecycle.js";
import {
  TurnNotFoundError,
  TurnRepositoryConflictError,
  TurnRevisionConflictError,
  type AcceptTurnResult,
  type TurnRepository
} from "./turn-repository.js";

/** Test/development adapter. Its guarantees do not extend across processes or restarts. */
export class InMemoryTurnRepository implements TurnRepository {
  private readonly turnsById = new Map<string, TurnRecord>();
  private readonly turnIdsByUserAndKey = new Map<string, string>();

  async accept(turn: TurnRecord): Promise<AcceptTurnResult> {
    assertInitialTurn(turn);
    const idempotencyIndex = JSON.stringify([turn.userId, turn.idempotencyKey]);
    const existingTurnId = this.turnIdsByUserAndKey.get(idempotencyIndex);
    if (existingTurnId) {
      const existing = this.turnsById.get(existingTurnId);
      if (!existing) throw new Error("In-memory turn repository index is inconsistent.");
      if (existing.conversationId !== turn.conversationId || existing.requestFingerprint !== turn.requestFingerprint) {
        throw new TurnRepositoryConflictError("The idempotency key was already used for a different request.");
      }
      return Object.freeze({ turn: existing, disposition: "replayed" });
    }

    if (this.turnsById.has(turn.id)) {
      throw new TurnRepositoryConflictError("The turn identifier is already in use.");
    }
    const stored = Object.freeze({ ...turn });
    this.turnsById.set(stored.id, stored);
    this.turnIdsByUserAndKey.set(idempotencyIndex, stored.id);
    return Object.freeze({ turn: stored, disposition: "created" });
  }

  async get(userId: string, conversationId: string, turnId: string): Promise<TurnRecord | null> {
    const turn = this.turnsById.get(turnId);
    if (!turn || turn.userId !== userId || turn.conversationId !== conversationId) return null;
    return turn;
  }

  async listConversation(userId: string, conversationId: string): Promise<readonly TurnRecord[]> {
    return Object.freeze([...this.turnsById.values()]
      .filter((turn) => turn.userId === userId && turn.conversationId === conversationId)
      .sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt) || left.id.localeCompare(right.id)));
  }

  async listStaleRunning(input: { readonly olderThan: string; readonly limit: number }): Promise<readonly TurnRecord[]> {
    const cutoff = Date.parse(input.olderThan);
    if (!Number.isFinite(cutoff) || !Number.isSafeInteger(input.limit) || input.limit < 1) {
      throw new Error("Stale turn scan requires a valid cutoff and positive limit.");
    }
    return Object.freeze([...this.turnsById.values()]
      .filter((turn) => turn.status === "running" && Date.parse(turn.updatedAt) <= cutoff)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id))
      .slice(0, input.limit));
  }

  async compareAndTransition(input: {
    userId: string;
    conversationId: string;
    turnId: string;
    expectedRevision: number;
    transition: TurnTransition;
  }): Promise<TurnRecord> {
    // Keep the read/check/write section synchronous so concurrent callers in
    // this process cannot interleave between the revision check and the write.
    const current = this.turnsById.get(input.turnId);
    if (!current || current.userId !== input.userId || current.conversationId !== input.conversationId) {
      throw new TurnNotFoundError();
    }
    if (current.revision !== input.expectedRevision) {
      throw new TurnRevisionConflictError(input.expectedRevision, current.revision);
    }
    const updated = transitionTurn(current, input.transition);
    this.turnsById.set(updated.id, updated);
    return updated;
  }
}

function assertInitialTurn(turn: TurnRecord): void {
  if (
    turn.status !== "queued" || turn.attempt !== 0 || turn.revision !== 0 ||
    "resultId" in turn || "resultPayload" in turn || "failureCode" in turn ||
    !turn.id.trim() || !turn.userId.trim() || !turn.conversationId.trim() ||
    !turn.idempotencyKey.trim() || !turn.userMessage.trim() || !turn.requestFingerprint.trim()
  ) {
    throw new TurnRepositoryConflictError("Only a valid, newly queued turn can be accepted.");
  }
}
