import type { ConversationalMemory } from "./types.js";
import { isExplicitUserEvidence } from "./conversational-memory-extractor.js";
import type { SavingsEntry } from "../../domain/savings/types.js";

export interface AuthoritativeEpisodeOutcome {
  readonly kind: "mocked_ledger_entry_recorded";
  readonly userId: string;
  readonly eventId: string;
  readonly entryId: string;
  readonly proposalId: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly recordedAt: string;
}

/** Project only a completed mocked-ledger result returned by the domain tool. */
export function authoritativeEpisodeOutcome(entry: SavingsEntry): AuthoritativeEpisodeOutcome | null {
  if (!entry.userId.trim() || !entry.eventId.trim() || !entry.id.trim() || !entry.proposalId.trim() ||
      entry.status !== "completed" || entry.movementMode !== "mock_ledger" || entry.currency !== "USD" ||
      !Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0 ||
      !Number.isFinite(Date.parse(entry.createdAt))) return null;
  return Object.freeze({
    kind: "mocked_ledger_entry_recorded", userId: entry.userId, eventId: entry.eventId,
    entryId: entry.id, proposalId: entry.proposalId, amountCents: entry.amountCents,
    currency: entry.currency, recordedAt: entry.createdAt
  });
}

/** Suppress episode text that would reintroduce a corrected or forgotten user fact. */
export function suppressLifecycleConflictingEpisodes(
  memories: readonly ConversationalMemory[],
  lifecycleMemories: readonly ConversationalMemory[]
): readonly ConversationalMemory[] {
  const retired = lifecycleMemories
    .filter((memory) => memory.sourceType === "user_correction" ||
      memory.sourceMetadata?.memoryStatus === "forgotten" || memory.sourceMetadata?.interestStatus === "inactive")
    .map((memory) => ({
      turnIds: sourceTurnIds(memory),
      topics: topicTokens(memory.key)
    }))
    .filter((item) => item.turnIds.size > 0 || item.topics.size > 0);
  if (retired.length === 0) return memories;
  return memories.filter((memory) => {
    if (memory.sourceMetadata?.memoryKind !== "episodic_summary") return true;
    const episodeTurnIds = sourceTurnIds(memory);
    if (episodeTurnIds.size > 0) {
      const linkedLifecycleRecords = retired.filter((record) => record.turnIds.size > 0);
      if (linkedLifecycleRecords.length > 0) {
        return !linkedLifecycleRecords.some((record) => [...record.turnIds].some((turnId) => episodeTurnIds.has(turnId)));
      }
    }
    const episodeTerms = new Set([...topicTokens(`${memory.value} ${memory.evidence}`)]);
    return !retired.some(({ topics: topic }) => {
      const overlap = [...topic].filter((term) => episodeTerms.has(term)).length;
      return overlap >= (topic.size === 1 ? 1 : 2);
    });
  });
}

function sourceTurnIds(memory: ConversationalMemory): Set<string> {
  const references = memory.sourceMetadata?.sourceTurnReferences;
  if (!Array.isArray(references)) return new Set();
  return new Set(references.flatMap((reference) =>
    reference && typeof reference === "object" && "turnId" in reference &&
      typeof reference.turnId === "string" && reference.turnId.trim() ? [reference.turnId] : []));
}

function topicTokens(value: string): Set<string> {
  const ignored = new Set(["interest", "preference", "goal", "habit", "other", "financial", "pattern", "episodic", "summary"]);
  return new Set(value.toLocaleLowerCase("en-US").match(/[a-z0-9]{4,}/g)?.map(normalizeEpisodeTerm)
    .filter((term) => !ignored.has(term)) ?? []);
}

export interface EpisodicSummaryCandidate {
  readonly summary: string;
  readonly evidenceQuotes: readonly string[];
  readonly confidence: number;
  readonly sensitivity: "ordinary" | "sensitive";
}

export interface EpisodeEvidenceReference {
  readonly turnId: string;
}

export interface EpisodicMemorySummarizer {
  summarize(input: {
    readonly userMessages: readonly string[];
    /** Adjacent assistant prompt context is included only to interpret user replies. */
    readonly turnPairs?: readonly { readonly precedingAssistantMessage?: string; readonly userMessage: string }[];
  }): Promise<unknown>;
}

export const EPISODIC_MEMORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
export const SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY = 0.76;

/** Only current, validated episode summaries with a clear topic match may shape a reply. */
export function isUsableEpisodicSummary(
  memory: ConversationalMemory,
  userMessage: string,
  now: Date = new Date()
): boolean {
  if (memory.category !== "other" || memory.sourceType !== "system_inference" ||
      memory.sourceMetadata?.memoryKind !== "episodic_summary" || memory.confidence < 0.85 ||
      memory.value.trim().length < 20 || memory.value.trim().length > 500 ||
      !memory.evidence.trim()) return false;
  const createdAt = Date.parse(memory.createdAt);
  const nowMs = now.getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(nowMs) || createdAt > nowMs ||
      nowMs - createdAt > EPISODIC_MEMORY_MAX_AGE_MS) return false;
  if (Number.isFinite(memory.semanticSimilarity) && memory.semanticSimilarity! >= SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY) {
    return true;
  }
  const summaryTerms = new Set(`${memory.value} ${memory.evidence}`.toLocaleLowerCase("en-US")
    .match(/[a-z]{4,}/g)?.map(normalizeEpisodeTerm).filter((term) => !EPISODE_STOP_WORDS.has(term)) ?? []);
  const queryTerms = new Set(userMessage.toLocaleLowerCase("en-US")
    .match(/[a-z]{4,}/g)?.map(normalizeEpisodeTerm) ?? []);
  return [...summaryTerms].filter((term) => queryTerms.has(term)).length >= 2;
}

/** Accepts only concise summaries grounded in exact user-authored excerpts. */
export function validateEpisodicSummary(
  value: unknown,
  userMessages: readonly string[],
  authoritativeOutcomes: readonly AuthoritativeEpisodeOutcome[] = [],
  evidenceReferences: readonly EpisodeEvidenceReference[] = []
): Omit<ConversationalMemory, "id" | "createdAt" | "supersedesId"> | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<EpisodicSummaryCandidate>;
  if (typeof candidate.summary !== "string" || candidate.summary.trim().length < 20 ||
      candidate.summary.trim().length > 500 || !Number.isFinite(candidate.confidence) ||
      (candidate.confidence as number) < 0.85 || candidate.sensitivity !== "ordinary" ||
      !Array.isArray(candidate.evidenceQuotes) || candidate.evidenceQuotes.length < 1 || candidate.evidenceQuotes.length > 3 ||
      !candidate.evidenceQuotes.every((quote) => typeof quote === "string" && quote.trim().length > 0 && quote.length <= 200 &&
        userMessages.some((message) => isExplicitUserEvidence(message, quote)))) return null;
  const evidence = candidate.evidenceQuotes.map((quote) => quote.trim()).join(" | ");
  if (evidence.length > 240 || evidenceReferences.length > 16 ||
      evidenceReferences.some((reference) => !reference.turnId.trim()) ||
      authoritativeOutcomes.length > 8 || authoritativeOutcomes.some((outcome) =>
    outcome.kind !== "mocked_ledger_entry_recorded" || !outcome.userId.trim() || !outcome.eventId.trim() ||
    !outcome.entryId.trim() || !outcome.proposalId.trim() || !Number.isSafeInteger(outcome.amountCents) ||
    outcome.amountCents <= 0 || !Number.isFinite(Date.parse(outcome.recordedAt)))) return null;
  return Object.freeze({
    category: "other",
    key: "episodic_summary",
    value: candidate.summary.trim(),
    evidence,
    confidence: candidate.confidence as number,
    sourceType: "system_inference",
    sourceMetadata: {
      memoryKind: "episodic_summary",
      evidenceCount: candidate.evidenceQuotes.length,
      ...(evidenceReferences.length > 0 ? { sourceTurnReferences: Object.freeze([...new Map(evidenceReferences.map((reference) => [reference.turnId, reference])).values()]) } : {}),
      ...(authoritativeOutcomes.length > 0 ? { authoritativeWorkflowOutcomes: Object.freeze([...authoritativeOutcomes]) } : {})
    }
  });
}

const EPISODE_STOP_WORDS = new Set([
  "user", "they", "them", "their", "this", "that", "with", "from", "about", "into", "have", "been",
  "want", "wants", "working", "exploring", "trying", "make", "more", "less", "some", "could", "would"
]);

function normalizeEpisodeTerm(term: string): string {
  return term.length > 4 ? term.replace(/s$/, "") : term;
}
