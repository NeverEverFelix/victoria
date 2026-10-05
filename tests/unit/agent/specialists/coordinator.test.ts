import { describe, expect, it, vi } from "vitest";
import {
  coordinateSpecialists,
  type FinancialMomentSpecialist,
  type SavingsRecommendation,
  type SavingsReasoningSpecialist
} from "../../../../src/agent/specialists/coordinator.js";
import type { ClassifiedMessage } from "../../../../src/agent/types.js";

const avoidedSpend: ClassifiedMessage = {
  type: "avoided_spend",
  confidence: 0.9,
  amountCents: 2700,
  summary: "Skipped takeout",
  needsClarification: false
};

const specialistContext = {
  userMessage: "I skipped a $27 order"
};
const coordinationOptions = {
  estimateSpend: async () => ({
    id: "suggestion_1", amountCents: 2700, currency: "USD" as const,
    movementMode: "mock_ledger" as const, source: "user_provided" as const,
    reason: "Skipped takeout"
  })
};

function specialists(
  classification: ClassifiedMessage = avoidedSpend,
  recommendation: SavingsRecommendation = {
    kind: "suggest",
    id: "suggestion_1",
    amountCents: 2700,
    currency: "USD",
    movementMode: "mock_ledger",
    source: "user_provided",
    reason: "Skipped takeout"
  }
) {
  const moment: FinancialMomentSpecialist = {
    analyze: vi.fn().mockResolvedValue({ schemaVersion: 1, classification })
  };
  const savings: SavingsReasoningSpecialist = {
    recommend: vi.fn().mockResolvedValue({ schemaVersion: 1, recommendation })
  };
  return { moment, savings };
}

describe("coordinateSpecialists", () => {
  it("accepts aligned specialist findings as advisory output", async () => {
    const team = specialists();
    const result = await coordinateSpecialists(team, specialistContext, coordinationOptions);

    expect(result).toMatchObject({
      status: "ready",
      classification: avoidedSpend,
      recommendation: { kind: "suggest", amountCents: 2700 }
    });
  });

  it("sends specialists only the facts needed for their task", async () => {
    const team = specialists();
    await coordinateSpecialists(team, specialistContext, coordinationOptions);

    expect(team.moment.analyze).toHaveBeenCalledWith({
      handoff: { schemaVersion: 1, userMessage: specialistContext.userMessage },
      signal: expect.any(AbortSignal)
    });
    expect(team.savings.recommend).toHaveBeenCalledWith({
      handoff: { schemaVersion: 1, facts: { eventType: "avoided_spend", userProvidedAmountCents: 2700 } },
      signal: expect.any(AbortSignal)
    });
    const momentInput = vi.mocked(team.moment.analyze).mock.calls[0]?.[0];
    const savingsInput = vi.mocked(team.savings.recommend).mock.calls[0]?.[0];
    expect(momentInput?.handoff).not.toHaveProperty("memory");
    expect(momentInput?.handoff).not.toHaveProperty("userId");
    expect(savingsInput).not.toHaveProperty("userId");
    expect(savingsInput?.handoff.facts).not.toHaveProperty("summary");
  });

  it("turns financial moment specialist failure into clarification without invoking savings reasoning", async () => {
    const team = specialists();
    vi.mocked(team.moment.analyze).mockRejectedValueOnce(new Error("provider detail"));

    const result = await coordinateSpecialists(team, specialistContext, coordinationOptions);

    expect(result).toMatchObject({ status: "clarify", reason: "specialist_failure" });
    expect(team.savings.recommend).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("provider detail");
  });

  it("rejects malformed specialist findings", async () => {
    const team = specialists({
      ...avoidedSpend,
      confidence: 1.2
    });

    const result = await coordinateSpecialists(team, specialistContext, coordinationOptions);

    expect(result).toMatchObject({ status: "clarify", reason: "invalid_specialist_output" });
    expect(team.savings.recommend).not.toHaveBeenCalled();
  });

  it("rejects unversioned and extra-field specialist outputs", async () => {
    const wrongVersion = specialists();
    vi.mocked(wrongVersion.moment.analyze).mockResolvedValueOnce({
      schemaVersion: 2,
      classification: avoidedSpend
    });
    await expect(coordinateSpecialists(wrongVersion, specialistContext, coordinationOptions))
      .resolves.toMatchObject({ status: "clarify", reason: "invalid_specialist_output" });

    const extraField = specialists();
    vi.mocked(extraField.moment.analyze).mockResolvedValueOnce({
      schemaVersion: 1,
      classification: { ...avoidedSpend, internalReasoning: "must be rejected" }
    });
    const result = await coordinateSpecialists(extraField, specialistContext, coordinationOptions);
    expect(result).toMatchObject({ status: "clarify", reason: "invalid_specialist_output" });
    expect(JSON.stringify(result)).not.toContain("must be rejected");
  });

  it("rejects extra fields in Savings Reasoning output", async () => {
    const team = specialists();
    const estimate = vi.fn(coordinationOptions.estimateSpend);
    vi.mocked(team.savings.recommend).mockResolvedValueOnce({
      schemaVersion: 1,
      recommendation: { kind: "no_suggestion" },
      userId: "must-not-cross-boundary"
    });

    const result = await coordinateSpecialists(team, specialistContext, { estimateSpend: estimate });
    expect(result).toMatchObject({ status: "clarify", reason: "invalid_specialist_output" });
    expect(JSON.stringify(result)).not.toContain("must-not-cross-boundary");
    expect(estimate).not.toHaveBeenCalled();
  });

  it("turns savings reasoning specialist failure into clarification", async () => {
    const team = specialists();
    vi.mocked(team.savings.recommend).mockRejectedValueOnce(new Error("provider detail"));

    const result = await coordinateSpecialists(team, specialistContext, coordinationOptions);

    expect(result).toMatchObject({ status: "clarify", reason: "specialist_failure" });
  });

  it("aborts a specialist that exceeds its time budget", async () => {
    const team = specialists();
    let receivedSignal: AbortSignal | undefined;
    vi.mocked(team.moment.analyze).mockImplementationOnce(({ signal }) => {
      receivedSignal = signal;
      return new Promise(() => {});
    });

    const result = await coordinateSpecialists(
      team,
      specialistContext,
      { ...coordinationOptions, timeoutMs: 5 }
    );

    expect(result).toMatchObject({ status: "clarify", reason: "specialist_failure" });
    expect(receivedSignal?.aborted).toBe(true);
    expect(team.savings.recommend).not.toHaveBeenCalled();
  });

  it("ignores a specialist result that arrives after timeout", async () => {
    const team = specialists();
    vi.mocked(team.moment.analyze).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ schemaVersion: 1, classification: avoidedSpend }), 20))
    );

    const result = await coordinateSpecialists(team, specialistContext, { ...coordinationOptions, timeoutMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(result).toMatchObject({ status: "clarify", reason: "specialist_failure" });
    expect(team.savings.recommend).not.toHaveBeenCalled();
  });

  it("holds when savings reasoning disagrees with an explicit user amount", async () => {
    const team = specialists(avoidedSpend, {
      kind: "suggest",
      id: "suggestion_conflicting",
      amountCents: 2500,
      currency: "USD",
      movementMode: "mock_ledger",
      source: "manual_estimate",
      reason: "Estimated order"
    });

    const result = await coordinateSpecialists(team, specialistContext, coordinationOptions);

    expect(result).toMatchObject({ status: "clarify", reason: "specialist_disagreement" });
  });

  it("does not route non-avoided-spend classifications to savings reasoning", async () => {
    const unclear: ClassifiedMessage = {
      type: "unclear",
      confidence: 0.4,
      summary: "Unclear",
      needsClarification: true
    };
    const team = specialists(unclear);

    const result = await coordinateSpecialists(team, { ...specialistContext, userMessage: "I saved some money" }, coordinationOptions);

    expect(result).toMatchObject({ status: "clarify", reason: "moment_needs_clarification" });
    expect(team.savings.recommend).not.toHaveBeenCalled();
  });
});
