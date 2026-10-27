import type { ConversationalMemory } from "./types.js";

export interface MemoryRetrievalPlanInput {
  readonly memories: readonly ConversationalMemory[];
  readonly query: string;
  readonly additionalContext?: string;
  readonly limit: number;
  readonly alwaysRelevant?: (memory: ConversationalMemory) => boolean;
}

/** Shared ranking for user-scoped candidates; consumers still enforce their own eligibility and lifecycle contracts. */
export function planMemoryRetrieval(input: MemoryRetrievalPlanInput): readonly ConversationalMemory[] {
  const queryTokens = new Set(tokens(`${input.query} ${input.additionalContext ?? ""}`));
  const ranked = input.memories.flatMap((memory) => {
    const key = memory.key.trim().toLocaleLowerCase("en-US");
    const id = memory.id.trim();
    if (!id || !key || (memory.sourceType !== undefined && memory.sourceType !== "user_statement" &&
        memory.sourceType !== "user_correction") || !Number.isFinite(memory.confidence) || memory.confidence < 0.85 ||
        memory.sourceMetadata?.interestStatus === "inactive") return [];
    const searchableTokens = new Set(tokens(`${memory.key} ${memory.value} ${memory.evidence}`));
    const overlap = [...queryTokens].filter((token) => searchableTokens.has(token)).length;
    const semantic = Number.isFinite(memory.semanticSimilarity)
      ? Math.max(0, Math.min(1, memory.semanticSimilarity!)) : 0;
    const createdAt = Date.parse(memory.createdAt);
    const ageDays = Number.isFinite(createdAt) ? Math.max(0, (Date.now() - createdAt) / 86_400_000) : Infinity;
    const recency = 1 / (1 + ageDays / 30);
    const rank = overlap * 2 + semantic * 3 + recency * 0.2 +
      (memory.sourceType === "user_correction" ? 0.5 : 0) +
      (input.alwaysRelevant?.(memory) ? 100 : 0);
    return [{ memory, key, createdAt, rank }];
  });

  // Resolve duplicate versions before relevance ranking so an old, highly relevant
  // value cannot reappear when a newer correction exists.
  ranked.sort((a, b) => b.createdAt - a.createdAt || b.rank - a.rank || a.memory.id.localeCompare(b.memory.id));
  const seen = new Set<string>();
  const current = ranked.filter(({ key }) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return current.sort((a, b) => b.rank - a.rank || b.createdAt - a.createdAt || a.memory.id.localeCompare(b.memory.id))
    .slice(0, Math.max(0, input.limit)).map(({ memory }) => memory);
}

function tokens(value: string): string[] {
  const stopWords = new Set(["about", "after", "also", "and", "are", "did", "for", "from", "have", "how", "into", "is", "it", "my", "of", "on", "that", "the", "this", "to", "was", "what", "when", "with", "you"]);
  return value.toLocaleLowerCase("en-US").match(/[a-z0-9]{3,}/g)?.filter((token) => !stopWords.has(token)) ?? [];
}
