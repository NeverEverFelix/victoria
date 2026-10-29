import type { ConversationSavingsEventContext } from "./conversation-context-builder.js";

export type HistoricalEventReferenceResolution =
  | { readonly kind: "not_requested" }
  | { readonly kind: "resolved"; readonly eventId: string; readonly matchedBy: "chronology" | "merchant_or_topic" }
  | { readonly kind: "ambiguous"; readonly candidateEventIds: readonly string[] }
  | { readonly kind: "not_found" };

const REFERENCE_TERMS = new Set([
  "about", "after", "before", "did", "event", "first", "from", "happen", "mentioned", "moment", "most",
  "recent", "thing", "which", "what", "when", "where", "earlier", "previous", "last", "latest", "oldest",
  "can", "talk", "tell", "about", "with", "from", "for", "the", "your", "my"
]);

/**
 * Resolve only historical references over an already user-and-conversation-scoped event list.
 * The result identifies read-only context; it is never a financial action target.
 */
export function resolveHistoricalEventReference(
  message: string,
  events: readonly ConversationSavingsEventContext[]
): HistoricalEventReferenceResolution {
  const normalized = message.toLocaleLowerCase("en-US").trim();
  if (!normalized || normalized.length > 500) return { kind: "not_requested" };

  const chronological = /\b(?:first|earliest|oldest|at the beginning)\b/.test(normalized)
    ? "oldest"
    : /\b(?:last|latest|most recent|most recently)\b/.test(normalized) ? "newest" : undefined;
  if (chronological) {
    if (events.length === 0) return { kind: "not_found" };
    const ordered = [...events].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    const targetTime = Date.parse(chronological === "oldest" ? ordered[0]!.occurredAt : ordered.at(-1)!.occurredAt);
    const matches = ordered.filter((event) => Date.parse(event.occurredAt) === targetTime);
    return matches.length === 1
      ? Object.freeze({ kind: "resolved", eventId: matches[0]!.eventId, matchedBy: "chronology" })
      : Object.freeze({ kind: "ambiguous", candidateEventIds: Object.freeze(matches.map((event) => event.eventId)) });
  }

  const queryTerms = tokens(normalized).filter((term) => !REFERENCE_TERMS.has(term));
  if (queryTerms.length === 0) return { kind: "not_requested" };
  const ranked = events.map((event) => {
    const merchant = event.merchantName?.toLocaleLowerCase("en-US").trim();
    const text = tokens(`${event.summary} ${event.merchantName ?? ""}`);
    const overlap = queryTerms.filter((term) => text.includes(term)).length;
    const exactMerchant = Boolean(merchant && normalized.includes(merchant));
    return { event, overlap, exactMerchant };
  }).filter((candidate) => candidate.exactMerchant || candidate.overlap >= 2);
  if (ranked.length === 0) return { kind: "not_found" };
  const score = (candidate: typeof ranked[number]) => candidate.overlap + (candidate.exactMerchant ? 10 : 0);
  const bestScore = Math.max(...ranked.map(score));
  const best = ranked.filter((candidate) => score(candidate) === bestScore);
  return best.length === 1
    ? Object.freeze({ kind: "resolved", eventId: best[0]!.event.eventId, matchedBy: "merchant_or_topic" })
    : Object.freeze({ kind: "ambiguous", candidateEventIds: Object.freeze(best.map((candidate) => candidate.event.eventId)) });
}

function tokens(value: string): string[] {
  return value.match(/[a-z0-9]{3,}/g)?.map((token) => token.toLocaleLowerCase("en-US")) ?? [];
}
