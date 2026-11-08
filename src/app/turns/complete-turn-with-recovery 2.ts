import type { AgentResponse } from "../../agent/types.js";
import type { TurnRecord } from "../../domain/turns/lifecycle.js";
import type { TurnRepository } from "./turn-repository.js";

/**
 * Commits a generated response with one retry. If the first commit succeeded but
 * its acknowledgement was lost, a scoped read recognizes that exact result.
 */
export async function completeTurnWithRecovery(input: {
  readonly turns: TurnRepository;
  readonly runningTurn: TurnRecord;
  readonly response: AgentResponse;
  readonly completedAt: string;
}): Promise<TurnRecord> {
  const transition = {
    type: "complete" as const,
    at: input.completedAt,
    resultId: input.runningTurn.id,
    resultPayload: input.response
  };
  const request = {
    userId: input.runningTurn.userId,
    conversationId: input.runningTurn.conversationId,
    turnId: input.runningTurn.id,
    expectedRevision: input.runningTurn.revision,
    transition
  };
  try {
    return await input.turns.compareAndTransition(request);
  } catch (firstError) {
    try {
      return await input.turns.compareAndTransition(request);
    } catch {
      const current = await input.turns.get(
        input.runningTurn.userId, input.runningTurn.conversationId, input.runningTurn.id
      );
      if (current && isSameCompletedResult(current, input.runningTurn.id, input.response)) return current;
      throw firstError;
    }
  }
}

function isSameCompletedResult(turn: TurnRecord, resultId: string, response: AgentResponse): boolean {
  if (turn.status !== "completed" || turn.resultId !== resultId || !isRecord(turn.resultPayload)) return false;
  const payload = turn.resultPayload;
  if (typeof payload.message !== "string" || payload.message !== response.message || !isRecord(payload.decision)) return false;
  const decision = payload.decision;
  return decision.action === response.decision.action && isRecord(decision.classification) &&
    decision.classification.type === response.decision.classification.type &&
    decision.classification.summary === response.decision.classification.summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
