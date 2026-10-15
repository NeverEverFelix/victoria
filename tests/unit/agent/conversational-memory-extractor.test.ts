import { describe, expect, it } from "vitest";
import { isExplicitUserEvidence } from "../../../src/agent/memory/conversational-memory-extractor.js";

describe("explicit conversational memory evidence", () => {
  it("accepts an exact user-authored quote while rejecting sensitive contact details", () => {
    const message = "I prefer a quiet weekend routine.";
    expect(isExplicitUserEvidence(message, `“${message}”`)).toBe(true);
    expect(isExplicitUserEvidence("My email is alex@example.com.", "My email is alex@example.com.")).toBe(false);
    expect(isExplicitUserEvidence("My number is 212-555-0199.", "My number is 212-555-0199.")).toBe(false);
  });
});
