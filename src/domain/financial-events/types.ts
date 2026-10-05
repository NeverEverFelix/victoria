export type FinancialEventType =
  | "avoided_spend"
  | "regretful_spend"
  | "goal_allocation"
  | "proposal_revision"
  | "entry_correction"
  | "pattern_reflection"
  | "general_finance"
  | "savings_progress"
  | "real_money_movement_request"
  | "unclear";

export interface FinancialDecision {
  readonly id: string;
  readonly type: FinancialEventType;
  readonly summary: string;
  readonly amountCents?: number;
  readonly merchantName?: string;
  readonly createdAt: string;
}
