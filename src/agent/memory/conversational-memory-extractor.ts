import type { ConversationalMemory } from "./types.js";

export interface ExtractedMemoryCandidate {
  readonly category: "preference" | "goal" | "habit" | "other";
  readonly key: string;
  readonly value: string;
  /** Exact short quote from the current user turn supporting this fact. */
  readonly evidence: string;
  readonly confidence: number;
  readonly subject: "user" | "other_person";
  readonly assertion: "affirmed" | "negated" | "hypothetical";
  readonly stability: "stable" | "temporary";
  readonly sensitivity: "ordinary" | "sensitive";
}

export interface ConversationalMemoryExtractor {
  extract(input: { readonly userMessage: string }): Promise<readonly unknown[]>;
}

/**
 * Validates provider-generated candidates before they enter durable memory.
 * Only explicit, stable, ordinary, evidence-backed facts are eligible.
 */
export function validateMemoryCandidates(
  candidates: readonly unknown[],
  userMessage: string,
  limit = 3
): readonly Omit<ConversationalMemory, "id" | "createdAt" | "supersedesId">[] {
  const result: Omit<ConversationalMemory, "id" | "createdAt" | "supersedesId">[] = [];
  const seenKeys = new Set<string>();
  for (const candidate of candidates) {
    if (result.length >= Math.max(0, Math.min(limit, 3)) || !isCandidate(candidate)) continue;
    const evidence = candidate.evidence.trim();
    const key = candidate.key.trim().toLowerCase();
    const value = candidate.value.trim();
    // Amount-bearing recurring hobby spend is handled by the deterministic parser,
    // which requires an explicit period. Provider output cannot invent that schema.
    if (/\b(?:spend|spending|spent|cost|costs|paid|purchase|purchased)\b|\$\s*\d/i.test(`${evidence} ${value}`) ||
        key.startsWith("interest_spend:")) continue;
    if (candidate.subject !== "user" || candidate.assertion !== "affirmed" ||
        candidate.stability !== "stable" || candidate.sensitivity !== "ordinary" ||
        candidate.confidence < 0.85 || !evidence || evidence.length > 240 ||
        !isExplicitUserEvidence(userMessage, evidence) || !/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(key) ||
        !value || value.length > 240 || seenKeys.has(`${candidate.category}:${key}`)) continue;
    seenKeys.add(`${candidate.category}:${key}`);
    result.push(Object.freeze({
      category: candidate.category,
      key,
      value,
      evidence,
      confidence: candidate.confidence,
      sourceType: "user_statement"
    }));
  }
  return Object.freeze(result);
}

function isCandidate(value: unknown): value is ExtractedMemoryCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ExtractedMemoryCandidate>;
  return (candidate.category === "preference" || candidate.category === "goal" ||
      candidate.category === "habit" || candidate.category === "other") &&
    typeof candidate.key === "string" && typeof candidate.value === "string" &&
    typeof candidate.evidence === "string" && typeof candidate.confidence === "number" &&
    Number.isFinite(candidate.confidence) && candidate.confidence >= 0 && candidate.confidence <= 1 &&
    (candidate.subject === "user" || candidate.subject === "other_person") &&
    (candidate.assertion === "affirmed" || candidate.assertion === "negated" || candidate.assertion === "hypothetical") &&
    (candidate.stability === "stable" || candidate.stability === "temporary") &&
    (candidate.sensitivity === "ordinary" || candidate.sensitivity === "sensitive");
}

export function isExplicitUserEvidence(message: string, evidence: string): boolean {
  if (isNeverStoreMemoryEvidence(evidence)) return false;
  const normalizedMessage = message.toLocaleLowerCase("en-US");
  const normalizedEvidence = evidence.trim()
    .replace(/^["“”'‘’](.*)["“”'‘’]$/u, "$1")
    .trim().toLocaleLowerCase("en-US");
  const start = normalizedMessage.indexOf(normalizedEvidence);
  if (start < 0 || !/\b(?:i|me|my|we|us|our)\b/i.test(evidence)) return false;
  const before = normalizedMessage.slice(Math.max(0, start - 100), start);
  const after = normalizedMessage.slice(start + normalizedEvidence.length, start + normalizedEvidence.length + 40);
  const thirdPartyAttribution = /\b(?:my\s+(?:friend|partner|spouse|wife|husband|mother|father|mom|dad|coworker|colleague)|he|she|they)\s+(?:said|says|thinks|believes|mentioned|asked)\b/i;
  if (thirdPartyAttribution.test(evidence) || thirdPartyAttribution.test(before.slice(-100))) return false;
  if (/^[\s"'“‘(]*["'”’)]/.test(after) || /["'“‘(]\s*$/.test(before)) return false;
  if (/\b(?:i\s+(?:don't|do not|never|no longer|am not|amn't)|i'm\s+not|not\s+for\s+me)\b/i.test(evidence)) return false;
  if (/\b(?:if\s+i\s+(?:were|had|could)|maybe\s+i|i\s+(?:might|could|am considering|am thinking about))\b/i.test(evidence)) return false;
  return true;
}

/** Allows only a direct first-person correction that retires an ordinary remembered interest. */
export function isExplicitInterestCorrectionEvidence(message: string, evidence: string): boolean {
  const normalizedMessage = message.toLocaleLowerCase("en-US");
  const normalizedEvidence = evidence.trim().toLocaleLowerCase("en-US");
  const start = normalizedMessage.indexOf(normalizedEvidence);
  return start >= 0 && /^\s*i\s+(?:do not|don't|no longer)\s+(?:really\s+)?(?:love|like|enjoy)\s+[^.!?]+[.!?]*\s*$/i.test(evidence) &&
    !isNeverStoreMemoryEvidence(evidence) &&
    !/\b(?:maybe|might|possibly|not sure|unsure|could|considering|thinking about)\b/i.test(evidence) &&
    !/^[\s"“‘(]*["'”’)]/.test(normalizedMessage.slice(start + normalizedEvidence.length, start + normalizedEvidence.length + 40)) &&
    !/["'“‘(]\s*$/.test(normalizedMessage.slice(0, start));
}

/** Privacy floor shared by deterministic and provider-backed memory extraction. */
export function isNeverStoreMemoryEvidence(evidence: string): boolean {
  const sensitive = /\b(?:diagnos(?:is|ed)|diabetes|cancer|medication|prescription|medical|health condition|mental health|therapy|therapist|disability|political|politics|religious|religion|faith|church|mosque|synagogue|sexuality|sexual orientation|gender identity|race|ethnicity|immigration|visa status|citizenship status|social security|ssn|password|passcode|pin number|account number|routing number|card number|credit card number|debit card number|bank login|security code)\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?=(?:\D*\d){10})\+?\d[\d .()-]{8,}\d/i;
  return sensitive.test(evidence);
}
