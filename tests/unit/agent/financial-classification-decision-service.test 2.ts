import { describe, expect, it, vi } from "vitest";
import { FinancialClassificationDecisionService } from "../../../src/agent/financial-classification-decision-service.js";
import type { AgentRequest, ClassifiedMessage, SavingsEvent } from "../../../src/agent/types.js";

const request: AgentRequest = { userId: "user-1", message: "I almost bought it." };

function classification(type: ClassifiedMessage["type"], overrides: Partial<ClassifiedMessage> = {}): ClassifiedMessage {
  return { type, summary: "Skipped an unplanned purchase", confidence: 0.9, needsClarification: false, ...overrides };
}

describe("FinancialClassificationDecisionService", () => {
  it("summarizes the mocked ledger total without implying real money moved", async () => {
    const getWeeklySavingsTotal = vi.fn(async () => 2_550);
    const suggestSavings = vi.fn();
    const service = new FinancialClassificationDecisionService({ getWeeklySavingsTotal, suggestSavings });

    const decision = await service.decide({ request, classification: classification("savings_progress") });

    expect(getWeeklySavingsTotal).toHaveBeenCalledExactlyOnceWith("user-1");
    expect(decision).toMatchObject({ action: "summarize_progress", toolCall: {
      name: "getWeeklySavingsTotal", requiresApproval: false, arguments: { userId: "user-1" }
    } });
    expect(decision.userFacingMessage).toContain("$25.50 recorded in your mocked Victoria savings ledger");
    expect(decision.userFacingMessage).toContain("No real money has moved yet");
    expect(suggestSavings).not.toHaveBeenCalled();
  });

  it("returns a safe progress response when the read-only total lookup fails", async () => {
    const service = new FinancialClassificationDecisionService({
      getWeeklySavingsTotal: async () => { throw new Error("offline"); },
      suggestSavings: vi.fn()
    });

    const decision = await service.decide({ request, classification: classification("savings_progress") });

    expect(decision.userFacingMessage).toContain("couldn't load your weekly total");
    expect(decision.userFacingMessage).toContain("No real money has moved yet");
  });

  it("asks for clarification rather than deciding an unclear classification", async () => {
    const unclear = classification("unclear", { needsClarification: true });
    const suggestSavings = vi.fn();
    const service = new FinancialClassificationDecisionService({
      getWeeklySavingsTotal: vi.fn(), suggestSavings
    });

    const decision = await service.decide({ request, classification: unclear });

    expect(decision.action).toBe("ask_follow_up");
    expect(decision.classification).toBe(unclear);
    expect(suggestSavings).not.toHaveBeenCalled();
  });

  it("keeps regretful spending reflective and nonjudgmental", async () => {
    const service = new FinancialClassificationDecisionService({
      getWeeklySavingsTotal: vi.fn(), suggestSavings: vi.fn()
    });

    const decision = await service.decide({ request, classification: classification("regretful_spend") });

    expect(decision.action).toBe("reflect");
    expect(decision.userFacingMessage).toContain("No shame");
    expect(decision.userFacingMessage).not.toMatch(/saved|record/i);
  });

  it("delegates avoided-spend proposal construction without recording a ledger entry", async () => {
    const event: SavingsEvent = {
      id: "event-1", userId: "user-1", type: "avoided_spend", summary: "Skipped a purchase",
      classificationConfidence: 0.9, createdAt: "2026-10-30T00:00:00.000Z"
    };
    const expected = { action: "ask_follow_up" as const, classification: classification("avoided_spend"), userFacingMessage: "Need one detail." };
    const suggestSavings = vi.fn(async () => expected);
    const service = new FinancialClassificationDecisionService({
      getWeeklySavingsTotal: vi.fn(), suggestSavings
    });
    const classified = classification("avoided_spend");
    const teamAdvice = { assessment: { outcome: "ask" as const, confidence: 0.5, question: "Need one detail." }, message: "Need one detail." };

    const decision = await service.decide({ request, classification: classified, savingsEvent: event, teamAdvice });

    expect(decision).toBe(expected);
    expect(suggestSavings).toHaveBeenCalledExactlyOnceWith(request, classified, event, teamAdvice);
  });

  it("asks for the goal and saved amount without creating an allocation", async () => {
    const service = new FinancialClassificationDecisionService({
      getWeeklySavingsTotal: vi.fn(), suggestSavings: vi.fn()
    });

    const decision = await service.decide({ request, classification: classification("goal_allocation") });

    expect(decision.action).toBe("update_goal");
    expect(decision.userFacingMessage).toContain("Which savings goal and saved amount");
    expect(decision.toolCall).toBeUndefined();
  });
});
