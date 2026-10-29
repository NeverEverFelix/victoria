import type { VictoriaAgent } from "../../agent/victoria-agent.js";
import type { AgentResponse } from "../../agent/types.js";
import type { ConversationCoordinator } from "./conversation-coordinator.js";
import type { TurnRepository } from "./turn-repository.js";

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
          sourceTurnReferences
        });
        await dependencies.turns.compareAndTransition({
          userId: input.userId, conversationId: input.conversationId, turnId: running.id,
          expectedRevision: running.revision,
          transition: { type: "complete", at: now(), resultId: running.id, resultPayload: response }
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
