import { describe, expect, it } from "vitest";
import { isExplicitUserEvidence, isNeverStoreMemoryEvidence } from "../../../src/agent/memory/conversational-memory-extractor.js";

describe("explicit conversational memory evidence", () => {
  it("accepts an exact user-authored quote while rejecting sensitive contact details", () => {
    const message = "I prefer a quiet weekend routine.";
    expect(isExplicitUserEvidence(message, `“${message}”`)).toBe(true);
    expect(isExplicitUserEvidence("My email is alex@example.com.", "My email is alex@example.com.")).toBe(false);
    expect(isExplicitUserEvidence("My number is 212-555-0199.", "My number is 212-555-0199.")).toBe(false);
  });

  it.each([
    "I have diabetes and prefer low-sugar snacks.",
    "I prefer a church near home.",
    "My bank login is felix123.",
    "Use card number 4111 1111 1111 1111."
  ])("rejects sensitive or credential-bearing evidence: %s", (evidence) => {
    expect(isNeverStoreMemoryEvidence(evidence)).toBe(true);
    expect(isExplicitUserEvidence(evidence, evidence)).toBe(false);
  });
});
