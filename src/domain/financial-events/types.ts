export type FinancialEventType =
  | "avoided_spend"
  | "regretful_spend"
  | "goal_allocation"
  | "pattern_reflection"
  | "general_finance"
  | "unclear";

export interface FinancialDecision {
  id: string;
  type: FinancialEventType;
  summary: string;
  amountCents?: number;
  merchantName?: string;
  createdAt: string;
}
