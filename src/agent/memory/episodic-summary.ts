import type { ConversationalMemory } from "./types.js";
import { isExplicitUserEvidence } from "./conversational-memory-extractor.js";

export interface EpisodicSummaryCandidate {
  readonly summary: string;
  readonly evidenceQuotes: readonly string[];
  readonly confidence: number;
  readonly sensitivity: "ordinary" | "sensitive";
}

export interface EpisodicMemorySummarizer {
  summarize(input: { readonly userMessages: readonly string[] }): Promise<unknown>;
}

export const EPISODIC_MEMORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

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
  const summaryTerms = new Set(memory.value.toLocaleLowerCase("en-US")
    .match(/[a-z]{4,}/g)?.map(normalizeEpisodeTerm).filter((term) => !EPISODE_STOP_WORDS.has(term)) ?? []);
  const queryTerms = new Set(userMessage.toLocaleLowerCase("en-US")
    .match(/[a-z]{4,}/g)?.map(normalizeEpisodeTerm) ?? []);
  return [...summaryTerms].filter((term) => queryTerms.has(term)).length >= 2;
}

/** Accepts only concise summaries grounded in exact user-authored excerpts. */
export function validateEpisodicSummary(
  value: unknown,
  userMessages: readonly string[]
): Omit<ConversationalMemory, "id" | "createdAt" | "supersedesId"> | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<EpisodicSummaryCandidate>;
  if (typeof candidate.summary !== "string" || candidate.summary.trim().length < 20 ||
      candidate.summary.trim().length > 500 || !Number.isFinite(candidate.confidence) ||
      (candidate.confidence as number) < 0.85 || candidate.sensitivity !== "ordinary" ||
      !Array.isArray(candidate.evidenceQuotes) || candidate.evidenceQuotes.length < 1 || candidate.evidenceQuotes.length > 3 ||
      !candidate.evidenceQuotes.every((quote) => typeof quote === "string" && quote.trim().length > 0 && quote.length <= 200 &&
        userMessages.some((message) => isExplicitUserEvidence(message, quote)))) return null;
  return Object.freeze({
    category: "other",
    key: "episodic_summary",
    value: candidate.summary.trim(),
    evidence: candidate.evidenceQuotes.map((quote) => quote.trim()).join(" | "),
    confidence: candidate.confidence as number,
    sourceType: "system_inference",
    sourceMetadata: { memoryKind: "episodic_summary", evidenceCount: candidate.evidenceQuotes.length }
  });
}

const EPISODE_STOP_WORDS = new Set([
  "user", "they", "them", "their", "this", "that", "with", "from", "about", "into", "have", "been",
  "want", "wants", "working", "exploring", "trying", "make", "more", "less", "some", "could", "would"
]);

function normalizeEpisodeTerm(term: string): string {
  return term.length > 4 ? term.replace(/s$/, "") : term;
}
