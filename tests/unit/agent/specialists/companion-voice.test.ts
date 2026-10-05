import { describe, expect, it } from "vitest";
import { isSafeCompanionVoiceDraft } from "../../../../src/agent/specialists/companion-voice.js";

const canonical = "Using the $12.50 amount you provided, would you like me to record it in your Victoria savings ledger? No real money has moved yet.";

describe("isSafeCompanionVoiceDraft", () => {
  it("accepts a draft that preserves the amount, provenance, and ledger disclosures", () => {
    expect(isSafeCompanionVoiceDraft(
      "Would you like me to record the $12.50 amount you provided in your Victoria savings ledger? No real money has moved yet.",
      canonical
    )).toBe(true);
  });

  it.each([
    "Would you like me to record $12.50 in your Victoria savings ledger? No real money has moved yet.",
    "Would you like me to record $15.00, the amount you provided, in your Victoria savings ledger? No real money has moved yet.",
    "I transferred $12.50 into your Victoria savings ledger. No real money has moved yet.",
    "That was an irresponsible choice. The $12.50 amount you provided is in your Victoria savings ledger. No real money has moved yet."
  ])("rejects a draft that changes a protected fact: %s", (draft) => {
    expect(isSafeCompanionVoiceDraft(draft, canonical)).toBe(false);
  });
});
