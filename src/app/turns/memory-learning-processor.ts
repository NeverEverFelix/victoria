import { randomUUID } from "node:crypto";
import type { VictoriaAgent } from "../../agent/victoria-agent.js";
import type { MemoryLearningQueue } from "./memory-learning-queue.js";
import type { TurnRepository } from "./turn-repository.js";

export interface MemoryLearningRunResult {
  readonly claimed: number;
  readonly completed: number;
  readonly retried: number;
  readonly exhausted: number;
  readonly stale: number;
}

/** Claims bounded batches and learns only from the exact completed turn identity. */
export function createMemoryLearningProcessor(input: {
  readonly queue: MemoryLearningQueue;
  readonly turns: TurnRepository;
  readonly agent: Pick<VictoriaAgent, "learnFromQueuedTurn">;
  readonly createLeaseToken?: () => string;
}) {
  const createLeaseToken = input.createLeaseToken ?? randomUUID;
  return async function runMemoryLearning(limit = 10): Promise<MemoryLearningRunResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) throw new Error("Memory learning batch size must be from 1 to 25.");
    let claimed = 0;
    let completed = 0;
    let retried = 0;
    let exhausted = 0;
    let stale = 0;
    for (let index = 0; index < limit; index += 1) {
      const job = await input.queue.claim({ leaseToken: createLeaseToken() });
      if (!job) break;
      claimed += 1;
      const turn = await input.turns.get(job.userId, job.conversationId, job.turnId);
      if (!turn || turn.status !== "completed") {
        stale += 1;
        await input.queue.fail(job, "completed_turn_unavailable");
        continue;
      }
      try {
        await input.agent.learnFromQueuedTurn({
          userId: turn.userId,
          conversationId: turn.conversationId,
          message: turn.userMessage,
          sourceTurnReferences: [{ turnId: turn.id, userMessage: turn.userMessage }]
        });
        if (await input.queue.complete(job)) completed += 1;
        else stale += 1;
      } catch {
        if (await input.queue.fail(job, "memory_learning_failed")) {
          if (job.attempts >= 5) exhausted += 1;
          else retried += 1;
        } else stale += 1;
      }
    }
    return Object.freeze({ claimed, completed, retried, exhausted, stale });
  };
}
