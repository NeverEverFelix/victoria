import { describe, expect, it, vi } from "vitest";
import { MockVictoriaTools } from "../../../src/agent/tools/mock-tools.js";
import { SavingsSuggestionService } from "../../../src/agent/savings-suggestion-service.js";
import { MerchantSpendMemoryService } from "../../../src/agent/memory/merchant-spend-memory-service.js";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { PendingAmountClarificationService } from "../../../src/agent/pending-amount-clarification-service.js";
import { PendingSavingsProposalService } from "../../../src/agent/pending-savings-proposal-service.js";
import type { AgentRequest, ClassifiedMessage, SavingsEvent } from "../../../src/agent/types.js";

function createService(overrides: { readonly tools?: MockVictoriaTools } = {}) {
  const tools = overrides.tools ?? new MockVictoriaTools();
  const pendingAmountClarifications = new PendingAmountClarificationService();
  const pendingSavingsProposals = new PendingSavingsProposalService();
  const clearRecentSavingsEntry = vi.fn();
  let nextId = 0;
  const service = new SavingsSuggestionService({
    tools,
    merchantSpendMemory: new MerchantSpendMemoryService(new MockMemoryProvider()),
    pendingAmountClarifications,
    pendingSavingsProposals,
    buildSavingsEvent: (request, classification) => event(request, classification),
    clearRecentSavingsEntry,
    conversationKey: request => JSON.stringify([request.userId, request.conversationId ?? "default"]),
    createId: namespace => `${namespace}-${++nextId}`,
    now: () => "2026-10-30T00:00:00.000Z"
  });
  return { service, tools, pendingAmountClarifications, pendingSavingsProposals, clearRecentSavingsEntry };
}

function event(request: AgentRequest, classification: ClassifiedMessage): SavingsEvent {
  return {
    id: "event-1", userId: request.userId, type: "avoided_spend",
    summary: classification.summary, classificationConfidence: classification.confidence,
    ...(classification.amountCents === undefined ? {} : { userProvidedAmountCents: classification.amountCents }),
    createdAt: "2026-10-30T00:00:00.000Z"
  };
}

describe("SavingsSuggestionService", () => {
  it("creates a scoped pending proposal from the user's amount without recording an entry", async () => {
    const { service, tools, pendingSavingsProposals, clearRecentSavingsEntry } = createService();
    const request: AgentRequest = {
      userId: "suggestion-user", conversationId: "suggestion-chat", message: "I skipped a $20 purchase."
    };
    const classification: ClassifiedMessage = {
      type: "avoided_spend", summary: "Skipped a purchase", amountCents: 2_000,
      confidence: 0.95, needsClarification: false
    };

    const decision = await service.suggest({ request, classification });

    expect(decision.action).toBe("suggest_savings");
    expect(decision.suggestion).toMatchObject({ amountCents: 2_000, source: "user_provided", movementMode: "mock_ledger" });
    expect(decision.toolCall?.requiresApproval).toBe(true);
    expect(decision.proposal?.status).toBe("pending");
    expect(pendingSavingsProposals.getForConversation("suggestion-user", JSON.stringify(["suggestion-user", "suggestion-chat"]))?.state.decision)
      .toEqual(decision);
    expect(await tools.listSavingsEntries("suggestion-user")).toEqual([]);
    expect(clearRecentSavingsEntry).toHaveBeenCalledExactlyOnceWith(request);
  });

  it("stores an amount clarification instead of proposing an unsupported estimate", async () => {
    const { service, pendingAmountClarifications, pendingSavingsProposals } = createService();
    const request: AgentRequest = {
      userId: "clarification-user", conversationId: "clarification-chat", message: "I saved money by cooking."
    };
    const classification: ClassifiedMessage = {
      type: "avoided_spend", summary: "Cooked at home", confidence: 0.9, needsClarification: false
    };

    const decision = await service.suggest({ request, classification });

    expect(decision.action).toBe("ask_follow_up");
    expect(decision.userFacingMessage).toContain("About how much would you have spent");
    expect(await pendingAmountClarifications.get(request)).toMatchObject({ classification, savingsEvent: { userId: "clarification-user" } });
    expect(pendingSavingsProposals.getForConversation("clarification-user", JSON.stringify(["clarification-user", "clarification-chat"])))
      .toBeUndefined();
  });

  it("rejects specialist disagreement with the deterministic estimate and keeps clarification open", async () => {
    const { service, pendingAmountClarifications, pendingSavingsProposals } = createService();
    const request: AgentRequest = { userId: "disagreement-user", message: "I skipped a $20 purchase." };
    const classification: ClassifiedMessage = {
      type: "avoided_spend", summary: "Skipped a purchase", amountCents: 2_000,
      confidence: 0.95, needsClarification: false
    };
    const decision = await service.suggest({ request, classification, teamAdvice: {
      assessment: { outcome: "suggest", confidence: 0.95, amountCents: 3_000, source: "user_provided", rationale: "different amount" },
      message: "Would you like to record $30?"
    } });

    expect(decision.action).toBe("ask_follow_up");
    expect(decision.userFacingMessage).toContain("couldn't confirm an amount that matches");
    expect(await pendingAmountClarifications.get(request)).toBeDefined();
    expect(pendingSavingsProposals.getForConversation("disagreement-user", JSON.stringify(["disagreement-user", "default"])))
      .toBeUndefined();
  });
});
