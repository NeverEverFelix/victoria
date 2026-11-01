import { getAllocationTargetChoiceFromConversation } from "../conversation-dialogue-policy.js";
import { employerCoveredRecurringSpend } from "../money-movement-intent.js";
import type { AgentRequest, SavingsEvent } from "../types.js";
import { isExplicitUserEvidence } from "./conversational-memory-extractor.js";
import { sanitizeMemoryEvidence } from "./personalized-ordinary-reply.js";
import type { ConversationalMemory, MemoryProvider } from "./types.js";

const COVERED_EXPENSE_ALLOCATION_KEY = "observed_behavior:covered_recurring_expense_to_savings";

/** Persists only the user's selected planning horizon for a covered recurring expense. */
export class CoveredExpenseAllocationMemoryService {
  constructor(private readonly memory: MemoryProvider) {}

  async rememberChoice(request: AgentRequest, event: SavingsEvent): Promise<void> {
    const conversationContext = await this.memory.getConversationContext(
      request.userId, request.conversationId ?? "default"
    );
    const sourceMessage = [...conversationContext].reverse().find((turn) =>
      !turn.startsWith("Victoria: ") &&
      employerCoveredRecurringSpend(turn)?.amountCents === event.userProvidedAmountCents);
    const coveredSpend = sourceMessage ? employerCoveredRecurringSpend(sourceMessage) : undefined;
    const targetChoice = getAllocationTargetChoiceFromConversation(conversationContext);
    const evidence = targetChoice
      ? `${sanitizeMemoryEvidence(sourceMessage ?? "")} | ${sanitizeMemoryEvidence(targetChoice.evidence)}`
      : sanitizeMemoryEvidence(sourceMessage ?? "");
    if (!coveredSpend || evidence.length > 240 || !sourceMessage ||
        !isExplicitUserEvidence(sourceMessage, sourceMessage) || !targetChoice) return;

    try {
      const history = await this.memory.listConversationalMemories(request.userId);
      const previous = [...history].reverse().find((memory) =>
        memory.category === "financial_pattern" && memory.key === COVERED_EXPENSE_ALLOCATION_KEY);
      if (previous?.evidence === evidence && previous.sourceMetadata?.lastPlanningHorizon === targetChoice.horizon) return;
      const priorCounts = readPlanningHorizonCounts(previous?.sourceMetadata?.planningHorizonCounts);
      const planningHorizonCounts = {
        ...priorCounts,
        [targetChoice.horizon]: priorCounts[targetChoice.horizon] + 1
      };
      const observationCount = planningHorizonCounts.monthly + planningHorizonCounts.annual;
      const moreOftenChosen = observationCount >= 2 && planningHorizonCounts.monthly !== planningHorizonCounts.annual
        ? planningHorizonCounts.monthly > planningHorizonCounts.annual ? "monthly" : "annual"
        : undefined;
      await this.memory.rememberConversationalMemory(request.userId, {
        category: "financial_pattern",
        key: COVERED_EXPENSE_ALLOCATION_KEY,
        value: `Has chosen the ${targetChoice.horizon} planning target when directing an employer-covered recurring expense toward savings.`,
        evidence,
        confidence: 0.9,
        sourceType: "system_inference",
        sourceMetadata: {
          memoryKind: "observed_behavior",
          behavior: "redirect_covered_recurring_expense_to_savings",
          observationCount,
          lastPlanningHorizon: targetChoice.horizon,
          planningHorizonCounts,
          ...(moreOftenChosen ? { moreOftenChosen } : {}),
          cadence: coveredSpend.cadence
        },
        ...(previous ? { supersedesId: previous.id } : {})
      });
    } catch {
      // Best-effort memory must not change a confirmed ledger outcome.
    }
  }
}

export function getPriorCoveredExpenseAllocation(memories: readonly ConversationalMemory[]): {
  priorCoveredExpenseAllocation?: {
    lastPlanningHorizon: "monthly" | "annual";
    observationCount: number;
    moreOftenChosen?: "monthly" | "annual";
  };
} {
  const memory = [...memories].reverse().find((item) =>
    item.category === "financial_pattern" &&
    item.key === COVERED_EXPENSE_ALLOCATION_KEY &&
    item.sourceMetadata?.memoryKind === "observed_behavior" &&
    (item.sourceMetadata.lastPlanningHorizon === "monthly" || item.sourceMetadata.lastPlanningHorizon === "annual"));
  if (!memory?.sourceMetadata) return {};
  const lastPlanningHorizon = memory.sourceMetadata.lastPlanningHorizon;
  if (lastPlanningHorizon !== "monthly" && lastPlanningHorizon !== "annual") return {};
  const counts = readPlanningHorizonCounts(memory.sourceMetadata.planningHorizonCounts);
  const observationCount = Number.isSafeInteger(memory.sourceMetadata.observationCount)
    ? memory.sourceMetadata.observationCount as number
    : counts.monthly + counts.annual;
  const moreOftenChosen = observationCount >= 2 && counts.monthly !== counts.annual
    ? counts.monthly > counts.annual ? "monthly" : "annual"
    : undefined;
  return {
    priorCoveredExpenseAllocation: {
      lastPlanningHorizon,
      observationCount,
      ...(moreOftenChosen ? { moreOftenChosen } : {})
    }
  };
}

function readPlanningHorizonCounts(value: unknown): { monthly: number; annual: number } {
  if (!value || typeof value !== "object") return { monthly: 0, annual: 0 };
  const counts = value as { monthly?: unknown; annual?: unknown };
  return {
    monthly: typeof counts.monthly === "number" && Number.isSafeInteger(counts.monthly) && counts.monthly >= 0
      ? counts.monthly : 0,
    annual: typeof counts.annual === "number" && Number.isSafeInteger(counts.annual) && counts.annual >= 0
      ? counts.annual : 0
  };
}
