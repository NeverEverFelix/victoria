import type {
  FinancialDecision,
  FinancialEventType
} from "../domain/financial-events/types.js";
import type {
  MoneyMovementMode,
  SavingsGoal,
  SavingsEvent,
  SavingsProposal,
  SavingsSuggestion
} from "../domain/savings/types.js";

export type {
  FinancialDecision,
  FinancialEventType
} from "../domain/financial-events/types.js";
export type {
  MoneyMovementMode,
  SavingsGoal,
  SavingsEvent,
  SavingsProposal,
  SavingsSuggestion
} from "../domain/savings/types.js";

export type AgentActionType =
  | "ask_follow_up"
  | "suggest_savings"
  | "create_ledger_entry"
  | "update_goal"
  | "reflect"
  | "refuse";

export interface AgentRequest {
  userId: string;
  message: string;
  conversationId?: string;
  approvedActionId?: string;
}

export interface AgentMemory {
  habits: UserHabit[];
  goals: SavingsGoal[];
  recentDecisions: FinancialDecision[];
}

export interface UserHabit {
  id: string;
  merchantName: string;
  typicalAmountCents: number;
  currency: "USD";
  confidence: number;
}

export interface ClassifiedMessage {
  type: FinancialEventType;
  confidence: number;
  merchantName?: string;
  amountCents?: number;
  goalName?: string;
  summary: string;
  needsClarification: boolean;
}

export interface AgentDecision {
  action: AgentActionType;
  classification: ClassifiedMessage;
  savingsEvent?: SavingsEvent;
  proposal?: SavingsProposal;
  suggestion?: SavingsSuggestion;
  toolCall?: ToolCallRequest;
  userFacingMessage: string;
}

export interface AgentResponse {
  message: string;
  decision: AgentDecision;
}

export interface ToolCallRequest {
  name: VictoriaToolName;
  actionId?: string;
  arguments: Record<string, unknown>;
  requiresApproval: boolean;
  movementMode?: MoneyMovementMode;
}

export type VictoriaToolName =
  | "getUserHabits"
  | "findTypicalMerchantSpend"
  | "estimateAvoidedSpend"
  | "createSavingsEntry"
  | "updateSavingsGoal"
  | "scheduleReminder"
  | "eventuallyMoveMoney";
