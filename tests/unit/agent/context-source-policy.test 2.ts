import { describe, expect, it } from "vitest";
import { selectFinancialContextSource } from "../../../src/agent/context-source-policy.js";

describe("financial context source policy", () => {
  it("uses memory for remembered preferences", () => {
    expect(selectFinancialContextSource({
      purpose: "remembered_context", hasRelevantMemory: true, transactionHistoryAvailable: true
    })).toBe("memory");
  });

  it("uses an exact relevant memory before transaction history for an estimate", () => {
    expect(selectFinancialContextSource({
      purpose: "avoided_spend_estimate", hasRelevantMemory: true, transactionHistoryAvailable: true
    })).toBe("memory");
  });

  it("uses an available transaction source when needed", () => {
    expect(selectFinancialContextSource({
      purpose: "avoided_spend_estimate", hasRelevantMemory: false, transactionHistoryAvailable: true
    })).toBe("transaction_history");
    expect(selectFinancialContextSource({
      purpose: "spending_history", hasRelevantMemory: true, transactionHistoryAvailable: true
    })).toBe("transaction_history");
  });

  it("asks the user when transaction history is unavailable", () => {
    expect(selectFinancialContextSource({
      purpose: "avoided_spend_estimate", hasRelevantMemory: false, transactionHistoryAvailable: false
    })).toBe("ask_user");
    expect(selectFinancialContextSource({
      purpose: "spending_history", hasRelevantMemory: false, transactionHistoryAvailable: false
    })).toBe("ask_user");
  });
});
