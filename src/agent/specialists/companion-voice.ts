import type { CompanionVoiceInputPayload, CompanionVoiceOutput } from "./handoff-schemas.js";

export type VerifiedResponseOutcome = CompanionVoiceInputPayload["outcome"];

export interface CompanionVoiceInput {
  handoff: CompanionVoiceInputPayload;
  signal: AbortSignal;
}

export interface CompanionVoiceSpecialist {
  compose(input: CompanionVoiceInput): Promise<unknown>;
}

export class MockCompanionVoiceSpecialist implements CompanionVoiceSpecialist {
  async compose(input: CompanionVoiceInput): Promise<CompanionVoiceOutput> {
    input.signal.throwIfAborted();
    return { schemaVersion: 1, draft: input.handoff.responseGoal };
  }
}

export function isSafeCompanionVoiceDraft(draft: unknown, canonicalResponse: string): draft is string {
  if (typeof draft !== "string" || draft.trim().length === 0 || draft.length > 1200) return false;

  const requiredDisclosures = [
    "No real money has moved yet.",
    "No transfer has been made.",
    "mocked Victoria savings ledger",
    "Victoria savings ledger"
  ].filter((phrase) => canonicalResponse.includes(phrase));
  if (requiredDisclosures.some((phrase) => !draft.includes(phrase))) return false;
  if (/amount you provided/i.test(canonicalResponse) && !/amount you provided/i.test(draft)) return false;
  if (/\bestimat(?:e|ed|es)\b/i.test(canonicalResponse) && !/\bestimat(?:e|ed|es)\b/i.test(draft)) return false;

  const canonicalAmounts = [...canonicalResponse.matchAll(/\$\d[\d,]*(?:\.\d{2})/g)].map(([amount]) => amount);
  const draftedAmounts = [...draft.matchAll(/\$\d[\d,]*(?:\.\d{2})/g)].map(([amount]) => amount);
  if (canonicalAmounts.length !== draftedAmounts.length ||
      canonicalAmounts.some((amount, index) => amount !== draftedAmounts[index])) {
    return false;
  }

  const withoutRequiredDisclosures = draft
    .replace(/No real money has moved yet\./gi, "")
    .replace(/No transfer has been made\./gi, "");
  return !(
    /\b(?:I|we|Victoria)\s+(?:moved|transferred|sent)\b/i.test(withoutRequiredDisclosures) ||
    /\b(?:money|funds)\s+(?:was|were|has|have)\s+(?:moved|transferred|sent)\b/i.test(withoutRequiredDisclosures) ||
    /\b(?:you should have known|bad choice|irresponsible|shame on you|you failed)\b/i.test(draft)
  );
}
