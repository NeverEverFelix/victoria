import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";

export interface MemoryProvider {
  getMemoryForUser(userId: string, query?: string): Promise<AgentMemory>;
  rememberDecision(userId: string, decision: Omit<FinancialDecision, "id" | "createdAt">): Promise<FinancialDecision>;
  listHabits(userId: string): Promise<UserHabit[]>;
  listGoals(userId: string): Promise<SavingsGoal[]>;
  getConversationContext(userId: string, conversationId: string): Promise<readonly string[]>;
  setConversationContext(userId: string, conversationId: string, messages: readonly string[]): Promise<void>;
  listConversationalMemories(userId: string, page?: ConversationalMemoryPage): Promise<readonly ConversationalMemory[]>;
  /** Optional efficient current-fact view; include suppression markers only for lifecycle writes. */
  listCurrentConversationalMemories?(
    userId: string,
    includeForgottenMarkers?: boolean,
    page?: ConversationalMemoryPage
  ): Promise<readonly ConversationalMemory[]>;
  filterCurrentConversationalMemoryIds?(
    userId: string,
    candidateIds: readonly string[]
  ): Promise<ReadonlySet<string>>;
  searchConversationalMemories(userId: string, query: string, limit?: number): Promise<readonly ConversationalMemory[]>;
  rememberConversationalMemory(userId: string, memory: Omit<ConversationalMemory, "id" | "createdAt">): Promise<ConversationalMemory>;
}

/** A durable, user-scoped preference or other fact learned from conversation. */
export interface ConversationalMemory {
  readonly id: string;
  readonly category: "preference" | "goal" | "habit" | "other" | "financial_pattern";
  readonly key: string;
  readonly value: string;
  readonly evidence: string;
  readonly confidence: number;
  readonly createdAt: string;
  readonly supersedesId?: string;
  readonly sourceType?: "user_statement" | "plaid_transaction_profile" | "system_inference" | "user_correction";
  readonly observedFrom?: string;
  readonly observedThrough?: string;
  readonly sourceRecordCount?: number;
  readonly sourceMetadata?: Readonly<Record<string, unknown>>;
}

export interface ConversationalMemoryPage {
  readonly limit: number;
  readonly before?: { readonly createdAt: string; readonly id: string };
}

export const DEFAULT_CONVERSATION_CONTEXT_LIMIT = 20;
