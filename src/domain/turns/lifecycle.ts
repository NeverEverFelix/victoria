/** Durable execution state for an accepted conversational turn. */
export type TurnStatus = "queued" | "running" | "completed" | "failed";

export interface TurnRecord {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly idempotencyKey: string;
  /** Original message to be processed by the queued turn worker. */
  readonly userMessage: string;
  /** Stable digest of the accepted request payload, computed by the request boundary. */
  readonly requestFingerprint: string;
  readonly status: TurnStatus;
  readonly attempt: number;
  /** Monotonically increases so repository adapters can use compare-and-transition. */
  readonly revision: number;
  readonly acceptedAt: string;
  readonly updatedAt: string;
  readonly resultId?: string;
  readonly failureCode?: string;
}

export type TurnTransition =
  | { readonly type: "start"; readonly at: string }
  | { readonly type: "complete"; readonly at: string; readonly resultId: string }
  | { readonly type: "fail"; readonly at: string; readonly failureCode: string }
  | { readonly type: "retry"; readonly at: string };

export function createQueuedTurn(input: {
  id: string;
  userId: string;
  conversationId: string;
  idempotencyKey: string;
  userMessage: string;
  requestFingerprint: string;
  acceptedAt: string;
}): TurnRecord {
  for (const [field, value] of Object.entries(input)) {
    if (!value.trim()) throw new Error(`Turn ${field} must not be empty.`);
  }
  parseTimestamp(input.acceptedAt);
  return Object.freeze({
    ...input,
    status: "queued",
    attempt: 0,
    revision: 0,
    updatedAt: input.acceptedAt
  });
}

/** Pure state transition function. Persistence adapters must store its result atomically. */
export function transitionTurn(turn: TurnRecord, transition: TurnTransition): TurnRecord {
  const transitionTime = parseTimestamp(transition.at);
  if (transitionTime < parseTimestamp(turn.updatedAt)) throw new Error("Turn transitions must be chronological.");

  let next: TurnRecord;
  switch (transition.type) {
    case "start":
      if (turn.status !== "queued") throw new Error(`Cannot start a ${turn.status} turn.`);
      next = { ...turn, status: "running", attempt: turn.attempt + 1, revision: turn.revision + 1, updatedAt: transition.at };
      break;
    case "complete":
      if (turn.status !== "running") throw new Error(`Cannot complete a ${turn.status} turn.`);
      if (!transition.resultId.trim()) throw new Error("Completed turns require a result identifier.");
      next = { ...turn, status: "completed", resultId: transition.resultId, revision: turn.revision + 1, updatedAt: transition.at };
      break;
    case "fail":
      if (turn.status !== "running") throw new Error(`Cannot fail a ${turn.status} turn.`);
      if (!transition.failureCode.trim()) throw new Error("Failed turns require a failure code.");
      next = { ...turn, status: "failed", failureCode: transition.failureCode, revision: turn.revision + 1, updatedAt: transition.at };
      break;
    case "retry":
      if (turn.status !== "failed") throw new Error(`Cannot retry a ${turn.status} turn.`);
      {
        const { failureCode: _previousFailure, ...retryable } = turn;
        void _previousFailure;
        next = { ...retryable, status: "queued", revision: turn.revision + 1, updatedAt: transition.at };
      }
      break;
  }
  return Object.freeze(next);
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Turn timestamps must be valid date strings.");
  return timestamp;
}
