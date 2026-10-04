import type {
  FinancialDecision,
  FinancialEventType
} from "../domain/financial-events/types.js";
import type {
  MoneyMovementMode,
  PendingSavingsGoalAllocation,
  SavingsGoalAllocation,
  SavingsGoal,
  SavingsEvent,
  SavingsEntryCorrection,
  SavingsProposalTransition,
  SavingsProposal,
  SavingsSuggestion
} from "../domain/savings/types.js";

export type {
  FinancialDecision,
  FinancialEventType
} from "../domain/financial-events/types.js";
export type {
  MoneyMovementMode,
  PendingSavingsGoalAllocation,
  SavingsGoalAllocation,
  SavingsGoal,
  SavingsEvent,
  SavingsEntryCorrection,
  SavingsProposalTransition,
  SavingsProposal,
  SavingsSuggestion
} from "../domain/savings/types.js";

export type AgentActionType =
  | "ask_follow_up"
  | "suggest_savings"
  | "create_ledger_entry"
  | "update_goal"
  | "record_goal_allocation"
  | "correct_ledger_entry"
  | "summarize_progress"
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
  revisionReason?: string;
  amountIssue?: "invalid_value" | "multiple_amounts" | "invalid_precision" | "unsupported_currency";
  summary: string;
  needsClarification: boolean;
}

export interface AgentDecision {
  action: AgentActionType;
  classification: ClassifiedMessage;
  savingsEvent?: SavingsEvent;
  proposal?: SavingsProposal;
  proposalTransitions?: readonly SavingsProposalTransition[];
  goalAllocation?: PendingSavingsGoalAllocation | SavingsGoalAllocation;
  entryCorrection?: SavingsEntryCorrection | PendingSavingsEntryCorrection;
  suggestion?: SavingsSuggestion;
  toolCall?: ToolCallRequest;
  userFacingMessage: string;
}

export interface PendingSavingsEntryCorrection {
  id: string;
  userId: string;
  savingsEntryId: string;
  correctedAmountCents: number;
  adjustmentCents: number;
  reason: string;
  status: "pending";
  createdAt: string;
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
  | "scheduleReminder"
  | "getWeeklySavingsTotal"
  | "createSavingsGoalAllocation"
  | "createSavingsEntryCorrection"
  | "eventuallyMoveMoney";
