import { describe, expect, it } from "vitest";
import { MockVictoriaTools } from "../../../src/agent/tools/mock-tools.js";
import type { SavingsEntry, SavingsEntryCorrection } from "../../../src/domain/savings/types.js";

function entry(overrides: Partial<SavingsEntry> = {}): SavingsEntry {
  return {
    id: "entry_8", userId: "user-a", eventId: "event-a", proposalId: "proposal-a",
    approvalId: "approval-a", approvedActionId: "action-a", amountCents: 1200,
    currency: "USD", reason: "Skipped an order", movementMode: "mock_ledger", status: "completed",
    createdAt: "2026-10-19T12:00:00.000Z", ...overrides
  };
}

function correction(overrides: Partial<SavingsEntryCorrection> = {}): SavingsEntryCorrection {
  return {
    id: "entry_correction_4", userId: "user-a", savingsEntryId: "entry_8", correctedAmountCents: 1400,
    adjustmentCents: 200, reason: "Corrected estimate", approvalId: "approval-c", approvedActionId: "action-c",
    createdAt: "2026-10-19T12:01:00.000Z", ...overrides
  };
}

describe("mock savings hydration", () => {
  it("adds monotonic identity to constant ID-factory outputs", async () => {
    const tools = new MockVictoriaTools([], [], () => "same-id");
    const first = await tools.createSavingsEntry({
      userId: "user-a", eventId: "event-a", proposalId: "proposal-a", approvalId: "approval-a",
      suggestionId: "suggestion-a", amountCents: 500, reason: "Skipped coffee", movementMode: "mock_ledger",
      approvedActionId: "action-a"
    });
    const second = await tools.createSavingsEntry({
      userId: "user-a", eventId: "event-b", proposalId: "proposal-b", approvalId: "approval-b",
      suggestionId: "suggestion-b", amountCents: 700, reason: "Skipped lunch", movementMode: "mock_ledger",
      approvedActionId: "action-b"
    });

    expect(first.id).not.toBe(second.id);
    const firstSuggestion = await tools.estimateAvoidedSpend({ userId: "user-a", userProvidedAmountCents: 500 });
    const secondSuggestion = await tools.estimateAvoidedSpend({ userId: "user-a", userProvidedAmountCents: 700 });
    expect(firstSuggestion?.id).not.toBe(secondSuggestion?.id);
  });

  it("rejects durable entries that do not satisfy the mocked approved-ledger contract", () => {
    const tools = new MockVictoriaTools();
    expect(() => tools.hydrateSavingsEntry(entry({ amountCents: Number.MAX_SAFE_INTEGER + 1 })))
      .toThrow("valid approved mocked-ledger data");
    expect(() => tools.hydrateSavingsEntry(entry({ movementMode: "real_transfer" as SavingsEntry["movementMode"] })))
      .toThrow("valid approved mocked-ledger data");
    expect(() => new MockVictoriaTools([], [entry({ amountCents: 0 })]))
      .toThrow("valid approved mocked-ledger data");
  });

  it("advances generated IDs after hydration and validates correction ownership/history", async () => {
    const tools = new MockVictoriaTools();
    tools.hydrateSavingsEntry(entry());
    const created = await tools.createSavingsEntry({
      userId: "user-a", eventId: "event-b", proposalId: "proposal-b", approvalId: "approval-b",
      suggestionId: "suggestion-b", amountCents: 500, reason: "Skipped coffee", movementMode: "mock_ledger",
      approvedActionId: "action-b"
    });
    expect(created.id).toBe("entry_9");

    expect(() => tools.hydrateSavingsEntryCorrection(correction({ userId: "user-b" })))
      .toThrow("completed mocked entry owned by the user");
    expect(() => tools.hydrateSavingsEntryCorrection(correction({ correctedAmountCents: 1450 })))
      .toThrow("effective amount history");

    tools.hydrateSavingsEntryCorrection(correction());
    const next = await tools.createSavingsEntryCorrection({
      userId: "user-a", savingsEntryId: "entry_8", correctedAmountCents: 1500,
      reason: "Second correction", approvalId: "approval-d", approvedActionId: "action-d"
    });
    expect(next.id).toBe("entry_correction_5");
  });
});
