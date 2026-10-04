export type FinancialEventType =
  | "avoided_spend"
  | "regretful_spend"
  | "goal_allocation"
  | "proposal_revision"
  | "pattern_reflection"
  | "general_finance"
  | "savings_progress"
  | "real_money_movement_request"
  | "unclear";

export interface FinancialDecision {
  id: string;
  type: FinancialEventType;
  summary: string;
  amountCents?: number;
  merchantName?: string;
  createdAt: string;
}
