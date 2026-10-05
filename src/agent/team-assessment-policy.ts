import type { AgentMemory } from "./types.js";
import { MIN_ACTIONABLE_CONFIDENCE } from "./confidence-policy.js";
import type { FinancialMomentFinding, SavingsAssessment } from "./team-prototype.js";
import { validateClassifiedMessage } from "./validation.js";

/** Deterministic validation for financial evidence passed between specialists. */
export function validateTeamFinding(candidate: unknown): FinancialMomentFinding | null {
  if (!isRecord(candidate) || !isRecord(candidate.classification)) return null;
  const classification = validateClassifiedMessage(candidate.classification);
  return classification ? Object.freeze({ classification }) : null;
}

export function fallbackFinding(summary: string): FinancialMomentFinding {
  return Object.freeze({
    classification: Object.freeze({ type: "unclear", confidence: 0, summary, needsClarification: true })
  });
}

export function clarificationAfterSpecialistFailure(role: "financialMoment" | "savingsReasoning"): SavingsAssessment {
  return Object.freeze({
    outcome: "ask",
    confidence: 1,
    question: role === "financialMoment"
      ? "Could you tell me a little more about what happened?"
      : "I want to make sure I have the amount right. Could you clarify it?"
  });
}

/** Return only supported, evidence-consistent advice; never treat it as approval. */
export function validateTeamAssessment(candidate: unknown, finding: FinancialMomentFinding, memory: AgentMemory): SavingsAssessment {
  if (!isRecord(candidate)) throw new Error("invalid assessment");
  if (typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 || candidate.confidence > 1) throw new Error("invalid assessment confidence");
  if (candidate.outcome === "suggest") {
    if (!hasOnlyKeys(candidate, ["outcome", "confidence", "amountCents", "source", "rationale"])) throw new Error("unsupported fields");
    if (candidate.confidence < MIN_ACTIONABLE_CONFIDENCE) throw new Error("suggestion confidence is too low");
    if (finding.classification.type !== "avoided_spend" || finding.classification.needsClarification ||
        finding.classification.amountIssue !== undefined ||
        !Number.isSafeInteger(candidate.amountCents) || (candidate.amountCents as number) <= 0 ||
        typeof candidate.rationale !== "string") throw new Error("unsupported suggestion");
    if (candidate.source === "user_provided") {
      if (candidate.amountCents !== finding.classification.amountCents) throw new Error("unsupported amount provenance");
    } else if (candidate.source === "habit_estimate") {
      const habit = memory.habits.find((item) =>
        item.currency === "USD" &&
        item.merchantName.toLowerCase() === finding.classification.merchantName?.toLowerCase() &&
        Number.isSafeInteger(item.typicalAmountCents) && item.typicalAmountCents > 0
      );
      if (finding.classification.amountCents !== undefined || !habit || habit.typicalAmountCents !== candidate.amountCents) {
        throw new Error("unsupported estimate provenance");
      }
    } else {
      throw new Error("unsupported suggestion source");
    }
    return Object.freeze({
      outcome: "suggest", confidence: candidate.confidence, amountCents: candidate.amountCents as number,
      source: candidate.source, rationale: candidate.rationale as string
    });
  }
  if (candidate.outcome === "ask" && hasOnlyKeys(candidate, ["outcome", "confidence", "question"]) &&
      typeof candidate.question === "string" && candidate.question.trim()) {
    return Object.freeze({ outcome: "ask", confidence: candidate.confidence, question: candidate.question.trim() });
  }
  if (candidate.outcome === "reflect" && hasOnlyKeys(candidate, ["outcome", "confidence", "rationale"]) && typeof candidate.rationale === "string") {
    return Object.freeze({ outcome: "reflect", confidence: candidate.confidence, rationale: candidate.rationale });
  }
  throw new Error("invalid assessment");
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
