import type { TurnRecord, TurnTransition } from "../../domain/turns/lifecycle.js";

export interface AcceptTurnResult {
  readonly turn: TurnRecord;
  readonly disposition: "created" | "replayed";
}

export interface TurnRepository {
  /**
   * Accept once per user/idempotency key. Replaying the same conversation and
   * request fingerprint returns the original turn; reusing the key for a
   * different request is a conflict.
   */
  accept(turn: TurnRecord): Promise<AcceptTurnResult>;

  /** Returns null for missing turns and turns owned by another user/conversation. */
  get(userId: string, conversationId: string, turnId: string): Promise<TurnRecord | null>;

  /** Atomically applies a lifecycle transition only at the expected revision. */
  compareAndTransition(input: {
    userId: string;
    conversationId: string;
    turnId: string;
    expectedRevision: number;
    transition: TurnTransition;
  }): Promise<TurnRecord>;
}

export class TurnRepositoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TurnRepositoryConflictError";
  }
}

export class TurnNotFoundError extends Error {
  constructor() {
    super("Turn was not found for this user and conversation.");
    this.name = "TurnNotFoundError";
  }
}

export class TurnRevisionConflictError extends Error {
  constructor(readonly expectedRevision: number, readonly actualRevision: number) {
    super(`Turn revision conflict: expected ${expectedRevision}, found ${actualRevision}.`);
    this.name = "TurnRevisionConflictError";
  }
}
