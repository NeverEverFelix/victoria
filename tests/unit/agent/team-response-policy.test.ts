import { describe, expect, it } from "vitest";
import { finalizeCompanionResponse } from "../../../src/agent/team-response-policy.js";
import type { FinancialMomentFinding, SavingsAssessment } from "../../../src/agent/team-prototype.js";

const finding: FinancialMomentFinding = {
  classification: { type: "general_finance", confidence: 1, summary: "What should I do with the money?", needsClarification: false }
};
const assessment: SavingsAssessment = { outcome: "reflect", confidence: 1, rationale: "Discuss options." };

describe("companion response money boundary", () => {
  it.each([
    "You can transfer the money with Victoria. What would you like to do?",
    "You could move it using Victoria. What would you like to do?",
    "You can deposit it through Victoria's app. What would you like to do?",
    "You can have Victoria send the money. What would you like to do?",
    "Victoria can help you transfer the money. What would you like to do?"
  ])("rejects a claim that Victoria can move real money: %s", (draft) => {
    const result = finalizeCompanionResponse(draft, finding, assessment);
    expect(result.voiceDraftAccepted).toBe(false);
    expect(result.validationIssues).toContain("claims_real_money_capability");
  });

  it("allows a suggestion for the user to move money through their own bank", () => {
    const result = finalizeCompanionResponse(
      "You could move some into savings through your bank if that fits your priorities. What matters most?",
      finding, assessment
    );
    expect(result.voiceDraftAccepted).toBe(true);
  });
});
