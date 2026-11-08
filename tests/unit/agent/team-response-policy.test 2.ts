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

  it("allows ordinary reassurance while blocking unsupported financial assurance", () => {
    expect(finalizeCompanionResponse(
      "We can take a pause to ensure you feel ready. What matters most?", finding, assessment
    ).voiceDraftAccepted).toBe(true);
    expect(finalizeCompanionResponse(
      "I can ensure your savings balance stays safe. What matters most?", finding, assessment
    ).validationIssues).toContain("unsupported_assurance");
  });

  it("preserves a stated goal when grounding a confirmation in the ledger", () => {
    const suggestion: SavingsAssessment = {
      outcome: "suggest", confidence: 1, amountCents: 3500, source: "user_provided", rationale: "User supplied $35."
    };
    const result = finalizeCompanionResponse(
      "Would you like me to record $35 to your emergency fund? No real money has moved.", finding, suggestion
    );
    expect(result.voiceDraftAccepted).toBe(true);
    expect(result.message).toContain("your emergency fund in your Victoria savings ledger?");
  });

  it("accepts an explicit confirmation in the savings ledger without duplicating it", () => {
    const suggestion: SavingsAssessment = {
      outcome: "suggest", confidence: 1, amountCents: 3500, source: "user_provided", rationale: "User supplied $35."
    };
    const result = finalizeCompanionResponse(
      "Would you like me to record $35 in your savings ledger? No real money has moved.", finding, suggestion
    );
    expect(result.voiceDraftAccepted).toBe(true);
    expect(result.message.match(/Would you like me to record/g)).toHaveLength(1);
  });

  it("replaces an incomplete recording offer with one exact ledger confirmation", () => {
    const suggestion: SavingsAssessment = {
      outcome: "suggest", confidence: 1, amountCents: 1_800,
      source: "user_provided", rationale: "User supplied $18."
    };
    const avoidedSpendFinding: FinancialMomentFinding = {
      classification: { type: "avoided_spend", confidence: 1, summary: "Cooked at home.", needsClarification: false }
    };
    const result = finalizeCompanionResponse(
      "Nice work choosing to cook. If you'd like, I can record this as an avoided-spend entry for $18; tell me to go ahead. Would you like me to record it in your Victoria savings ledger?",
      avoidedSpendFinding, suggestion
    );

    expect(result.message).toContain("Nice work choosing to cook.");
    expect(result.message).not.toContain("tell me to go ahead");
    expect(result.message.match(/Would you like me to record/gi)).toHaveLength(1);
    expect(result.message).toContain("record $18.00 in your Victoria savings ledger?");
  });

  it("keeps an avoided-spend estimate from being described as guaranteed money saved", () => {
    const avoidedSpendFinding: FinancialMomentFinding = {
      classification: { type: "avoided_spend", confidence: 1, summary: "Cooked at home instead.", needsClarification: false }
    };
    const suggestion: SavingsAssessment = {
      outcome: "suggest", confidence: 1, amountCents: 2_400,
      source: "user_provided", rationale: "User stated the takeout amount."
    };
    const result = finalizeCompanionResponse(
      "Cooking at home instead saved you $24 tonight.", avoidedSpendFinding, suggestion
    );

    expect(result.message).toContain("Cooking at home instead avoided spending $24 tonight.");
    expect(result.message).not.toContain("saved you $24");
    expect(result.message).toContain("record $24.00 in your Victoria savings ledger?");
  });

  it.each(["-$27", "$-27", "$27.001", "-27 dollars"]) (
    "rejects a malformed voice amount even when it resembles the suggested amount: %s", (amount) => {
      const suggestion: SavingsAssessment = {
        outcome: "suggest", confidence: 1, amountCents: 2700, source: "user_provided", rationale: "User supplied $27."
      };
      const result = finalizeCompanionResponse(
        `Would you like me to record ${amount} in your Victoria savings ledger? No real money has moved.`,
        finding, suggestion
      );
      expect(result.voiceDraftAccepted).toBe(false);
      expect(result.validationIssues).toContain("unsupported_amount");
    }
  );
});
