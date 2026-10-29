import type { ConversationalMemory } from "./types.js";

export interface MemoryRetrievalPlanInput {
  readonly memories: readonly ConversationalMemory[];
  readonly query: string;
  readonly additionalContext?: string;
  readonly limit: number;
  readonly alwaysRelevant?: (memory: ConversationalMemory) => boolean;
  readonly alwaysRelevantLimit?: number;
  readonly categoryLimits?: Partial<Record<ConversationalMemory["category"], number>>;
}

export type MemoryRetrievalReason = "lexical_overlap" | "semantic_similarity" | "recent_evidence" | "user_correction" | "context_match";

export interface MemoryRetrievalSelection {
  readonly memory: ConversationalMemory;
  readonly reasons: readonly MemoryRetrievalReason[];
}

/** Shared provenance and shape gate for memories that may influence a response. */
export function isRetrievableMemory(memory: ConversationalMemory): boolean {
  const id = memory.id.trim();
  const key = memory.key.trim();
  const value = memory.value.trim();
  const evidence = memory.evidence.trim();
  const createdAt = Date.parse(memory.createdAt);
  return (memory.sourceType === "user_statement" || memory.sourceType === "user_correction") &&
    Number.isFinite(memory.confidence) && memory.confidence >= 0.85 &&
    Number.isFinite(createdAt) && createdAt <= Date.now() &&
    memory.sourceMetadata?.interestStatus !== "inactive" &&
    Boolean(id && id.length <= 120 && key && key.length <= 80 && value && value.length <= 240 &&
      evidence && evidence.length <= 240);
}

/** Shared ranking for user-scoped candidates; consumers still enforce their own eligibility and lifecycle contracts. */
export function planMemoryRetrieval(input: MemoryRetrievalPlanInput): readonly ConversationalMemory[] {
  return planMemoryRetrievalWithReasons(input).map(({ memory }) => memory);
}

/** Provides bounded, content-free diagnostics for why an eligible memory was selected. */
export function planMemoryRetrievalWithReasons(input: MemoryRetrievalPlanInput): readonly MemoryRetrievalSelection[] {
  const queryTokens = new Set(tokens(`${input.query} ${input.additionalContext ?? ""}`));
  const ranked = input.memories.flatMap((memory) => {
    const key = memory.key.trim().toLocaleLowerCase("en-US");
    const identity = `${memory.category}\u0000${key}`;
    const id = memory.id.trim();
    if (!id || !key || !isRetrievableMemory(memory)) return [];
    const searchableTokens = new Set(tokens(`${memory.key} ${memory.value} ${memory.evidence}`));
    const overlap = [...queryTokens].filter((token) => searchableTokens.has(token)).length;
    const semantic = Number.isFinite(memory.semanticSimilarity)
      ? Math.max(0, Math.min(1, memory.semanticSimilarity!)) : 0;
    const createdAt = Date.parse(memory.createdAt);
    const ageDays = Number.isFinite(createdAt) ? Math.max(0, (Date.now() - createdAt) / 86_400_000) : Infinity;
    const recency = 1 / (1 + ageDays / 30);
    const alwaysRelevant = input.alwaysRelevant?.(memory) ?? false;
    const rank = overlap * 2 + semantic * 3 + recency * 0.2 +
      (memory.sourceType === "user_correction" ? 0.5 : 0) + (alwaysRelevant ? 100 : 0);
    return [{ memory, identity, createdAt, rank, alwaysRelevant, overlap, semantic, ageDays }];
  });

  // Explicit same-fact supersession wins even when timestamps tie or drift.
  // Resolve versions before relevance ranking so a stale, highly relevant value
  // cannot reappear when a correction exists.
  ranked.sort((a, b) => b.createdAt - a.createdAt || b.rank - a.rank || a.memory.id.localeCompare(b.memory.id));
  const supersededIds = new Set(ranked.flatMap((candidate) => {
    if (!candidate.memory.supersedesId) return [];
    const prior = ranked.find((item) => item.memory.id === candidate.memory.supersedesId);
    return prior?.identity === candidate.identity ? [prior.memory.id] : [];
  }));
  const unsuperseded = ranked.filter(({ memory }) => !supersededIds.has(memory.id));
  const seen = new Set<string>();
  const current = unsuperseded.filter(({ identity }) => {
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  current.sort((a, b) => b.rank - a.rank || b.createdAt - a.createdAt || a.memory.id.localeCompare(b.memory.id));
  const limit = Math.max(0, input.limit);
  const alwaysRelevantLimit = input.alwaysRelevantLimit === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.min(limit, Number.isSafeInteger(input.alwaysRelevantLimit) ? input.alwaysRelevantLimit : limit));
  const categoryCounts = new Map<ConversationalMemory["category"], number>();
  const withinCategoryBudget = current.filter((item) => {
    const category = item.memory.category;
    const requestedLimit = input.categoryLimits?.[category];
    const categoryLimit = requestedLimit === undefined
      ? Number.POSITIVE_INFINITY
      : Number.isSafeInteger(requestedLimit) ? Math.max(0, requestedLimit) : Number.POSITIVE_INFINITY;
    const count = categoryCounts.get(category) ?? 0;
    if (count >= categoryLimit) return false;
    categoryCounts.set(category, count + 1);
    return true;
  });
  const budgeted = [
    ...withinCategoryBudget.filter((item) => item.alwaysRelevant).slice(0, alwaysRelevantLimit),
    ...withinCategoryBudget.filter((item) => !item.alwaysRelevant)
  ];
  return Object.freeze(budgeted.sort((a, b) => b.rank - a.rank || b.createdAt - a.createdAt || a.memory.id.localeCompare(b.memory.id))
    .slice(0, limit).map(({ memory, overlap, semantic, ageDays, alwaysRelevant }) => {
      const reasons: MemoryRetrievalReason[] = [];
      if (overlap > 0) reasons.push("lexical_overlap");
      if (semantic >= 0.5) reasons.push("semantic_similarity");
      if (ageDays <= 30) reasons.push("recent_evidence");
      if (memory.sourceType === "user_correction") reasons.push("user_correction");
      if (alwaysRelevant) reasons.push("context_match");
      return Object.freeze({ memory, reasons: Object.freeze(reasons) });
    }));
}

function tokens(value: string): string[] {
  const stopWords = new Set(["about", "after", "also", "and", "are", "did", "for", "from", "have", "how", "into", "is", "it", "my", "of", "on", "that", "the", "this", "to", "was", "what", "when", "with", "you"]);
  return value.toLocaleLowerCase("en-US").match(/[a-z0-9]{3,}/g)?.filter((token) => !stopWords.has(token)) ?? [];
}
