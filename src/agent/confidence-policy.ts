import type { ClassifiedMessage } from "./types.js";

/** Provisional floor for model-led classification and savings suggestions. */
export const MIN_ACTIONABLE_CONFIDENCE = 0.7;

/** Low-confidence classification can guide a question, but cannot drive an action. */
export function applyClassificationConfidencePolicy(classification: ClassifiedMessage): ClassifiedMessage {
  if (classification.type === "unclear" || classification.confidence >= MIN_ACTIONABLE_CONFIDENCE) {
    return classification;
  }
  return Object.freeze({
    type: "unclear",
    uncertainIntent: classification.type,
    confidence: classification.confidence,
    summary: classification.summary,
    needsClarification: true
  });
}
