import type { LlmAdapter } from "./llm/types.js";
import type { MemoryProvider } from "./memory/types.js";
import { canCallTool } from "./policy.js";
import type { VictoriaTools } from "./tools/contracts.js";
import { formatUsd } from "../domain/money.js";
import type {
  AgentDecision,
  AgentRequest,
  AgentResponse,
  ClassifiedMessage,
  SavingsSuggestion
} from "./types.js";

export interface VictoriaAgentDependencies {
  llm: LlmAdapter;
  memory: MemoryProvider;
  tools: VictoriaTools;
}

export class VictoriaAgent {
  constructor(private readonly dependencies: VictoriaAgentDependencies) {}

  async respond(request: AgentRequest): Promise<AgentResponse> {
    const memory = await this.dependencies.memory.getMemoryForUser(request.userId);
    const classification = await this.dependencies.llm.classifyMessage({
      userMessage: request.message,
      memory
    });

    const decision = await this.decide(request, classification);

    return {
      message: decision.userFacingMessage,
      decision
    };
  }

  private async decide(
    request: AgentRequest,
    classification: ClassifiedMessage
  ): Promise<AgentDecision> {
    if (classification.needsClarification || classification.type === "unclear") {
      return {
        action: "ask_follow_up",
        classification,
        userFacingMessage: "I can help with that. What did you avoid spending on, and about how much would it have cost?"
      };
    }

    if (classification.type === "regretful_spend") {
      return {
        action: "reflect",
        classification,
        userFacingMessage: "No shame. Want to look at what led to it and set up a small plan for next time?"
      };
    }

    if (classification.type === "avoided_spend") {
      return this.suggestSavings(request, classification);
    }

    if (classification.type === "goal_allocation") {
      return {
        action: "update_goal",
        classification,
        userFacingMessage: "Got it. Which saved amount should I put toward that goal?"
      };
    }

    return {
      action: "reflect",
      classification,
      userFacingMessage: "I am here with you. Tell me a little more about the money decision you are thinking through."
    };
  }

  private async suggestSavings(
    request: AgentRequest,
    classification: ClassifiedMessage
  ): Promise<AgentDecision> {
    const suggestion = await this.dependencies.tools.estimateAvoidedSpend({
      userId: request.userId,
      ...(classification.merchantName ? { merchantName: classification.merchantName } : {}),
      ...(classification.amountCents !== undefined
        ? { userProvidedAmountCents: classification.amountCents }
        : {})
    });

    if (!suggestion) {
      return {
        action: "ask_follow_up",
        classification,
        userFacingMessage: "Nice choice. About how much would you have spent if you had gone through with it?"
      };
    }

    return this.buildSavingsSuggestionDecision(classification, suggestion);
  }

  private buildSavingsSuggestionDecision(
    classification: ClassifiedMessage,
    suggestion: SavingsSuggestion
  ): AgentDecision {
    const dollars = formatUsd(suggestion.amountCents);

    return {
      action: "suggest_savings",
      classification,
      suggestion,
      toolCall: {
        name: "createSavingsEntry",
        arguments: {
          suggestionId: suggestion.id,
          amountCents: suggestion.amountCents,
          reason: suggestion.reason,
          movementMode: suggestion.movementMode
        },
        requiresApproval: true,
        movementMode: suggestion.movementMode
      },
      userFacingMessage: `Great job. I estimate you avoided spending ${dollars}. Would you like me to save that in your Victoria ledger?`
    };
  }

  async approveToolCall(request: AgentRequest, decision: AgentDecision): Promise<AgentResponse> {
    if (!decision.toolCall || !decision.suggestion) {
      return {
        message: "There is no savings action waiting for approval.",
        decision: {
          ...decision,
          action: "refuse",
          userFacingMessage: "There is no savings action waiting for approval."
        }
      };
    }

    const policyDecision = canCallTool(request, decision.toolCall);

    if (!policyDecision.allowed) {
      return {
        message: policyDecision.reason ?? "That action needs approval first.",
        decision: {
          ...decision,
          action: "refuse",
          userFacingMessage: policyDecision.reason ?? "That action needs approval first."
        }
      };
    }

    const createSavingsEntryInput = {
      userId: request.userId,
      suggestionId: decision.suggestion.id,
      amountCents: decision.suggestion.amountCents,
      reason: decision.suggestion.reason,
      movementMode: decision.suggestion.movementMode,
      ...(request.approvedActionId ? { approvedActionId: request.approvedActionId } : {})
    };

    const entry = await this.dependencies.tools.createSavingsEntry(createSavingsEntryInput);

    const message = `Done. I saved ${formatUsd(entry.amountCents)} in your Victoria ledger.`;

    return {
      message,
      decision: {
        ...decision,
        action: "create_ledger_entry",
        userFacingMessage: message
      }
    };
  }
}
