export type FinancialContextPurpose = "remembered_context" | "avoided_spend_estimate" | "spending_history";

export type FinancialContextSource = "memory" | "transaction_history" | "ask_user";

export interface FinancialContextSourceInput {
  purpose: FinancialContextPurpose;
  hasRelevantMemory: boolean;
  transactionHistoryAvailable: boolean;
}

/** Selects the relevant source; connected-provider access rules remain inside its adapter. */
export function selectFinancialContextSource(input: FinancialContextSourceInput): FinancialContextSource {
  if (input.purpose === "remembered_context") return "memory";
  if (input.purpose === "spending_history") {
    return input.transactionHistoryAvailable ? "transaction_history" : "ask_user";
  }
  if (input.hasRelevantMemory) return "memory";
  return input.transactionHistoryAvailable ? "transaction_history" : "ask_user";
}
