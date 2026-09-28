export type FinancialEventType =
  | "avoided_spend"
  | "regretful_spend"
  | "goal_allocation"
  | "pattern_reflection"
  | "general_finance"
  | "unclear";

export type AgentActionType =
  | "ask_follow_up"
  | "suggest_savings"
  | "create_ledger_entry"
  | "update_goal"
  | "reflect"
  | "refuse";

export type MoneyMovementMode = "mock_ledger" | "real_transfer";

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

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmountCents?: number;
  savedAmountCents: number;
  currency: "USD";
}

export interface FinancialDecision {
  id: string;
  type: FinancialEventType;
  summary: string;
  amountCents?: number;
  merchantName?: string;
  createdAt: string;
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

export interface SavingsSuggestion {
  id: string;
  amountCents: number;
  currency: "USD";
  reason: string;
  source: "merchant_history" | "user_provided" | "manual_estimate";
  movementMode: MoneyMovementMode;
}

export interface AgentDecision {
  action: AgentActionType;
  classification: ClassifiedMessage;
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
