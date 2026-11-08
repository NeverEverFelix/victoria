import type { AgentRequest } from "../types.js";
import type { MemoryProvider } from "./types.js";
import type { ConversationalMemoryExtractor } from "./conversational-memory-extractor.js";
import { learnConversationalMemories, type MemoryLearningEnqueuer, type MemoryLearningOutcome } from "./memory-learning-service.js";

/** Owns queue-versus-inline learning policy for foreground and worker turn paths. */
export class MemoryLearningCoordinator {
  constructor(private readonly dependencies: {
    readonly memory: MemoryProvider;
    readonly extractor?: ConversationalMemoryExtractor;
    readonly enqueuer?: MemoryLearningEnqueuer;
    readonly onQueueFailure?: (reason: "unavailable" | "turn_reference_missing") => void;
    readonly onExtractionFailure?: (errorName: string) => void;
    readonly onOutcome?: (outcome: MemoryLearningOutcome) => void;
  }) {}

  /** Eligible foreground learning uses the durable queue when configured. */
  async learnEligibleTurn(request: AgentRequest): Promise<number> {
    if (!this.dependencies.extractor || await this.enqueue(request)) return 0;
    return this.learnInline(request);
  }

  /** Topic-switch learning follows the same nonblocking queue and outage policy. */
  async learnReadOnlyTopicTurn(request: AgentRequest): Promise<void> {
    if (!this.dependencies.extractor || await this.enqueue(request)) return;
    await this.learnInline(request);
  }

  /** Called only by the trusted durable worker after the source turn is complete. */
  async learnQueuedTurn(request: AgentRequest): Promise<void> {
    if (!this.dependencies.extractor) return;
    await learnConversationalMemories({
      request,
      storage: this.dependencies.memory,
      extractor: this.dependencies.extractor,
      throwOnFailure: true,
      ...(this.dependencies.onOutcome ? { onOutcome: this.dependencies.onOutcome } : {}),
      ...(this.dependencies.onExtractionFailure ? { onFailure: this.dependencies.onExtractionFailure } : {})
    });
  }

  private async learnInline(request: AgentRequest): Promise<number> {
    const extractor = this.dependencies.extractor;
    if (!extractor) return 0;
    return learnConversationalMemories({
      request,
      storage: this.dependencies.memory,
      extractor,
      ...(this.dependencies.onOutcome ? { onOutcome: this.dependencies.onOutcome } : {}),
      ...(this.dependencies.onExtractionFailure ? { onFailure: this.dependencies.onExtractionFailure } : {})
    });
  }

  private async enqueue(request: AgentRequest): Promise<boolean> {
    const enqueuer = this.dependencies.enqueuer;
    if (!enqueuer) return false;
    const reference = request.sourceTurnReferences?.find((turn) =>
      turn.userMessage === request.message && Boolean(turn.turnId.trim()));
    if (!reference) {
      this.reportQueueFailure("turn_reference_missing");
      return true;
    }
    try {
      await enqueuer.enqueue({
        userId: request.userId,
        conversationId: request.conversationId ?? "default",
        turnId: reference.turnId
      });
    } catch {
      this.reportQueueFailure("unavailable");
    }
    // Queue failure must never move provider extraction onto the reply path.
    return true;
  }

  private reportQueueFailure(reason: "unavailable" | "turn_reference_missing"): void {
    try { this.dependencies.onQueueFailure?.(reason); }
    catch { /* Content-free observers cannot interrupt a user turn. */ }
  }
}
