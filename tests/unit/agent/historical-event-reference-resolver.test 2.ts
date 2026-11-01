import { describe, expect, it } from "vitest";
import { resolveHistoricalEventReference } from "../../../src/agent/historical-event-reference-resolver.js";
import type { ConversationSavingsEventContext } from "../../../src/agent/conversation-context-builder.js";

const events: ConversationSavingsEventContext[] = [
  { eventId: "coffee-1", type: "avoided_spend", summary: "I skipped coffee at North Star Cafe.", merchantName: "North Star Cafe", provenance: "user_reported_event", occurredAt: "2026-10-20T12:00:00.000Z" },
  { eventId: "book-1", type: "avoided_spend", summary: "I waited before buying a book from Paper House.", merchantName: "Paper House", provenance: "user_reported_event", occurredAt: "2026-10-21T12:00:00.000Z" },
  { eventId: "coffee-2", type: "avoided_spend", summary: "I skipped coffee at North Star Cafe again.", merchantName: "North Star Cafe", provenance: "user_reported_event", occurredAt: "2026-10-22T12:00:00.000Z" }
];

describe("historical event reference resolver", () => {
  it("resolves chronological references only when the selected event is unique", () => {
    expect(resolveHistoricalEventReference("Which event did I mention first?", events)).toEqual({
      kind: "resolved", eventId: "coffee-1", matchedBy: "chronology"
    });
    expect(resolveHistoricalEventReference("What was my most recent event?", events)).toEqual({
      kind: "resolved", eventId: "coffee-2", matchedBy: "chronology"
    });
  });

  it("distinguishes a unique topic match, ambiguous match, and absent target", () => {
    expect(resolveHistoricalEventReference("Tell me about Paper House.", events)).toEqual({
      kind: "resolved", eventId: "book-1", matchedBy: "merchant_or_topic"
    });
    expect(resolveHistoricalEventReference("Tell me about North Star Cafe.", events)).toEqual({
      kind: "ambiguous", candidateEventIds: ["coffee-1", "coffee-2"]
    });
    expect(resolveHistoricalEventReference("Tell me about the concert tickets.", events)).toEqual({ kind: "not_found" });
    expect(resolveHistoricalEventReference("What can we talk about?", events)).toEqual({ kind: "not_requested" });
  });
});
