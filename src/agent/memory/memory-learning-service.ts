import type { AgentRequest } from "../types.js";
import type { MemoryProvider, ConversationalMemory } from "./types.js";
import { validateMemoryCandidates, type ConversationalMemoryExtractor } from "./conversational-memory-extractor.js";

type MemoryLearningStorage = Pick<MemoryProvider, "listConversationalMemories" | "rememberConversationalMemory">;

export interface MemoryLearningOutcome {
  readonly status: "completed" | "failed";
  readonly durationMs: number;
  readonly candidateCount: number;
}

/** Optional durable scheduling boundary; implementations receive only turn identity. */
export interface MemoryLearningEnqueuer {
  enqueue(input: { readonly userId: string; readonly conversationId: string; readonly turnId: string }): Promise<boolean>;
}

/** Extracts and persists only validated, explicit, stable user memories. */
export async function learnConversationalMemories(input: {
  readonly request: AgentRequest;
  readonly storage: MemoryLearningStorage;
  readonly extractor: ConversationalMemoryExtractor;
  readonly onFailure?: (errorName: string) => void;
  readonly onOutcome?: (outcome: MemoryLearningOutcome) => void;
  /** Background workers can retry provider failures; foreground turns should remain non-blocking. */
  readonly throwOnFailure?: boolean;
}): Promise<number> {
  const startedAt = Date.now();
  let status: MemoryLearningOutcome["status"] = "completed";
  let candidateCount = 0;
  try {
    const candidates = validateMemoryCandidates(
      await input.extractor.extract({ userMessage: input.request.message }),
      input.request.message
    );
    candidateCount = candidates.length;
    for (const candidate of candidates) {
      const history = await input.storage.listConversationalMemories(input.request.userId);
      const prior = [...history].reverse().find((memory) =>
        memory.category === candidate.category && memory.key === candidate.key);
      const current = withCurrentTurnEvidence(candidate, input.request);
      const sourceTurnReferences = mergeTurnReferences(
        prior?.sourceMetadata?.sourceTurnReferences,
        current.sourceMetadata?.sourceTurnReferences
      );
      const priorTurnIds = new Set(mergeTurnReferences(prior?.sourceMetadata?.sourceTurnReferences, []).map(({ turnId }) => turnId));
      const hasNewSourceTurn = sourceTurnReferences.some(({ turnId }) => !priorTurnIds.has(turnId));
      if (prior?.value === candidate.value && prior.evidence === candidate.evidence && !hasNewSourceTurn) continue;
      await input.storage.rememberConversationalMemory(input.request.userId, {
        ...current,
        ...(sourceTurnReferences.length ? {
          sourceRecordCount: Math.max(prior?.sourceRecordCount ?? 0, sourceTurnReferences.length),
          sourceMetadata: { ...current.sourceMetadata, sourceTurnReferences }
        } : {}),
        ...(prior ? { supersedesId: prior.id } : {})
      });
    }
    return candidates.length;
  } catch (error) {
    status = "failed";
    try { input.onFailure?.("provider_or_validation_error"); }
    catch { /* Content-free failure reporting cannot interrupt the user turn. */ }
    if (input.throwOnFailure) throw error;
    return 0;
  } finally {
    try {
      input.onOutcome?.(Object.freeze({
        status, durationMs: Math.max(0, Date.now() - startedAt), candidateCount
      }));
    } catch { /* Content-free metrics cannot interrupt the user turn. */ }
  }
}

function mergeTurnReferences(prior: unknown, current: unknown): readonly { readonly turnId: string }[] {
  const valid = (value: unknown): { turnId: string }[] => Array.isArray(value)
    ? value.flatMap((item) => item && typeof item === "object" && "turnId" in item &&
      typeof item.turnId === "string" && item.turnId.trim() ? [{ turnId: item.turnId }] : [])
    : [];
  return Object.freeze([...new Map([...valid(prior), ...valid(current)].map((item) => [item.turnId, item])).values()]);
}

export function withCurrentTurnEvidence(
  memory: Omit<ConversationalMemory, "id" | "createdAt">,
  request: AgentRequest
): Omit<ConversationalMemory, "id" | "createdAt"> {
  const current = request.sourceTurnReferences?.find((reference) => reference.userMessage === request.message);
  if (!current?.turnId.trim()) return memory;
  const existing = Array.isArray(memory.sourceMetadata?.sourceTurnReferences)
    ? memory.sourceMetadata.sourceTurnReferences.filter((item): item is { turnId: string } =>
      Boolean(item && typeof item === "object" && "turnId" in item && typeof item.turnId === "string"))
    : [];
  return {
    ...memory,
    sourceMetadata: {
      ...memory.sourceMetadata,
      sourceTurnReferences: [...new Map([...existing, { turnId: current.turnId }].map((item) => [item.turnId, item])).values()]
    }
  };
}
