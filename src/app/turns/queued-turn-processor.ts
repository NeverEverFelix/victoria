import type { VictoriaAgent } from "../../agent/victoria-agent.js";
import type { AgentResponse } from "../../agent/types.js";
import type { ConversationCoordinator } from "./conversation-coordinator.js";
import type { TurnRepository } from "./turn-repository.js";
import { completeTurnWithRecovery } from "./complete-turn-with-recovery.js";
import { isTurnActionReceipt } from "./turn-action-receipt.js";

export interface QueuedTurnProcessorDependencies {
  readonly turns: TurnRepository;
  readonly agent: Pick<VictoriaAgent, "respond">;
  readonly now?: () => string;
  readonly conversationCoordinator?: ConversationCoordinator;
}

export type ProcessQueuedTurnResult =
  | { readonly status: "completed"; readonly turnId: string; readonly response: AgentResponse }
  | { readonly status: "already_claimed" | "not_queued"; readonly turnId: string };

/** Executes one accepted turn using its authenticated, durable identity and lifecycle. */
export function createQueuedTurnProcessor(dependencies: QueuedTurnProcessorDependencies) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  return async function processQueuedTurn(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly turnId: string;
  }): Promise<ProcessQueuedTurnResult> {
    const execute = async (): Promise<ProcessQueuedTurnResult> => {
      const current = await dependencies.turns.get(input.userId, input.conversationId, input.turnId);
      if (!current) return { status: "not_queued", turnId: input.turnId };
      if (isTurnActionReceipt(current.resultPayload)) {
        if (current.status === "completed") return { status: "not_queued", turnId: current.id };
        let recoverable = current;
        try {
          if (recoverable.status === "failed") {
            recoverable = await dependencies.turns.compareAndTransition({
              userId: input.userId, conversationId: input.conversationId, turnId: current.id,
              expectedRevision: recoverable.revision, transition: { type: "retry", at: now() }
            });
          }
          if (recoverable.status === "queued") {
            recoverable = await dependencies.turns.compareAndTransition({
              userId: input.userId, conversationId: input.conversationId, turnId: current.id,
              expectedRevision: recoverable.revision, transition: { type: "start", at: now() }
            });
          }
        } catch {
          return { status: "already_claimed", turnId: current.id };
        }
        if (recoverable.status !== "running") return { status: "not_queued", turnId: current.id };
        const response = current.resultPayload;
        await completeTurnWithRecovery({
          turns: dependencies.turns,
          runningTurn: recoverable,
          response,
          completedAt: now()
        });
        return { status: "completed", turnId: current.id, response };
      }
      if (current.status !== "queued") {
        return { status: current.status === "running" ? "already_claimed" : "not_queued", turnId: current.id };
      }

      let running;
      try {
        running = await dependencies.turns.compareAndTransition({
          userId: input.userId, conversationId: input.conversationId, turnId: current.id,
          expectedRevision: current.revision, transition: { type: "start", at: now() }
        });
      } catch {
        return { status: "already_claimed", turnId: current.id };
      }

      try {
        const history = dependencies.turns.listConversation
          ? await dependencies.turns.listConversation(input.userId, input.conversationId)
          : [running];
        const sourceTurnReferences = history
          .filter((turn) => turn.status === "completed" || turn.id === running.id)
          .map((turn) => ({ turnId: turn.id, userMessage: turn.userMessage }));
        const response = await dependencies.agent.respond({
          userId: running.userId,
          conversationId: running.conversationId,
          message: running.userMessage,
          turnId: running.id,
          sourceTurnReferences
        });
        await completeTurnWithRecovery({
          turns: dependencies.turns,
          runningTurn: running,
          response,
          completedAt: now()
        });
        return { status: "completed", turnId: running.id, response };
      } catch (error) {
        try {
          await dependencies.turns.compareAndTransition({
            userId: input.userId, conversationId: input.conversationId, turnId: running.id,
            expectedRevision: running.revision,
            transition: { type: "fail", at: now(), failureCode: "queued_turn_processing_failed" }
          });
        } catch { /* Keep the processing error; a later lifecycle read exposes state for recovery. */ }
        throw error;
      }
    };
    return dependencies.conversationCoordinator
      ? dependencies.conversationCoordinator.runExclusive(input.userId, input.conversationId, execute)
      : execute();
  };
}
