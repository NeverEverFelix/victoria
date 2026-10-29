import type { AgentRequest } from "../types.js";
import type { MemoryProvider, ConversationalMemory } from "./types.js";
import { validateMemoryCandidates, type ConversationalMemoryExtractor } from "./conversational-memory-extractor.js";

type MemoryLearningStorage = Pick<MemoryProvider, "listConversationalMemories" | "rememberConversationalMemory">;

/** Extracts and persists only validated, explicit, stable user memories. */
export async function learnConversationalMemories(input: {
  readonly request: AgentRequest;
  readonly storage: MemoryLearningStorage;
  readonly extractor: ConversationalMemoryExtractor;
  readonly onFailure?: (errorName: string) => void;
}): Promise<number> {
  try {
    const candidates = validateMemoryCandidates(
      await input.extractor.extract({ userMessage: input.request.message }),
      input.request.message
    );
    for (const candidate of candidates) {
      const history = await input.storage.listConversationalMemories(input.request.userId);
      const prior = [...history].reverse().find((memory) =>
        memory.category === candidate.category && memory.key === candidate.key);
      if (prior?.value === candidate.value && prior.evidence === candidate.evidence) continue;
      await input.storage.rememberConversationalMemory(input.request.userId, {
        ...withCurrentTurnEvidence(candidate, input.request),
        ...(prior ? { supersedesId: prior.id } : {})
      });
    }
    return candidates.length;
  } catch {
    try { input.onFailure?.("provider_or_validation_error"); }
    catch { /* Content-free failure reporting cannot interrupt the user turn. */ }
    return 0;
  }
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
