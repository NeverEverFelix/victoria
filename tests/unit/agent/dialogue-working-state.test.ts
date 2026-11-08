import { describe, expect, it } from "vitest";
import {
  appendDialogueWorkingTurn,
  DIALOGUE_WORKING_STATE_TURN_LIMIT,
  isDialogueWorkingState,
  selectRelevantDialogueWorkingTurns
} from "../../../src/agent/dialogue-working-state.js";

describe("dialogue working state", () => {
  it("retains bounded, source-linked user turns beyond the rolling transcript and refreshes expiry", () => {
    const start = new Date("2026-11-01T12:00:00.000Z");
    let state = appendDialogueWorkingTurn({ conversationId: "chat-a", sourceTurnId: "turn-0",
      text: "Should I prioritize the credit card or emergency fund?", now: start });
    for (let index = 1; index <= DIALOGUE_WORKING_STATE_TURN_LIMIT; index += 1) {
      state = appendDialogueWorkingTurn({ state, conversationId: "chat-a", sourceTurnId: `turn-${index}`,
        text: `Weekend plan discussion ${index}.`, now: new Date(start.getTime() + index * 1_000) });
    }

    expect(state).toBeDefined();
    expect(state?.turns).toHaveLength(DIALOGUE_WORKING_STATE_TURN_LIMIT);
    expect(state?.turns[0]?.sourceTurnId).toBe("turn-1");
    expect(state?.expiresAt).toBe(new Date(start.getTime() + DIALOGUE_WORKING_STATE_TURN_LIMIT * 1_000 + 30 * 24 * 60 * 60_000).toISOString());
    expect(isDialogueWorkingState(state, "chat-a")).toBe(true);
    expect(isDialogueWorkingState(state, "chat-b")).toBe(false);
  });

  it("selects an older matching discussion while keeping recent turns available", () => {
    const state = appendDialogueWorkingTurn({ conversationId: "chat-a", sourceTurnId: "old-debt-topic",
      text: "I want to compare paying down my credit card with building an emergency fund.",
      now: new Date("2026-10-30T12:00:00.000Z") });
    const later = appendDialogueWorkingTurn({ state, conversationId: "chat-a", sourceTurnId: "new-topic",
      text: "I might take a pottery class this winter.", now: new Date("2026-11-01T12:00:00.000Z") });

    expect(selectRelevantDialogueWorkingTurns(later?.turns ?? [],
      "Returning to the credit card tradeoff, should I prioritize it?"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ sourceTurnId: "old-debt-topic" })]));
    expect(selectRelevantDialogueWorkingTurns(later?.turns ?? [], "How is pottery going?"))
      .toEqual(expect.arrayContaining([expect.objectContaining({ sourceTurnId: "new-topic" })]));
  });

  it("tags historical turns by conversational signal without rewriting their source text", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    const examples = [
      ["question", "Should I prioritize the credit card?"],
      ["constraint", "I need to keep a small buffer."],
      ["correction", "Actually, I meant the annual fee."],
      ["decision", "I decided to pause the subscription."],
      ["topic", "I started taking pottery classes."]
    ] as const;
    const turns = examples.map(([, text], index) =>
      appendDialogueWorkingTurn({ conversationId: "chat-a", sourceTurnId: `turn-${index}`, text, now })?.turns[0]);

    expect(turns.map((turn) => turn?.kind)).toEqual(examples.map(([kind]) => kind));
    expect(turns.map((turn) => turn?.text)).toEqual(examples.map(([, text]) => text));
    expect(turns.map((turn) => turn?.sourceTurnId)).toEqual(examples.map((_, index) => `turn-${index}`));
  });

  it("is idempotent for a retried source turn and refuses empty or cross-conversation input", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    const state = appendDialogueWorkingTurn({ conversationId: "chat-a", sourceTurnId: "turn-1", text: "First topic.", now });

    expect(appendDialogueWorkingTurn({ state, conversationId: "chat-a", sourceTurnId: "turn-1",
      text: "A retry with different text.", now })?.turns).toEqual(state?.turns);
    expect(appendDialogueWorkingTurn({ state, conversationId: "chat-b", sourceTurnId: "turn-2",
      text: "Other chat.", now })?.turns).toEqual([{ sourceTurnId: "turn-2", text: "Other chat.", createdAt: now.toISOString(), kind: "topic" }]);
    expect(appendDialogueWorkingTurn({ conversationId: "chat-a", sourceTurnId: "turn-3", text: "   ", now })).toBeUndefined();
  });

  it("does not retain turns containing credentials, account identifiers, or contact details", () => {
    const now = new Date("2026-11-01T12:00:00.000Z");
    for (const text of [
      "My account number is 123456789012.",
      "You can email me at person@example.com.",
      "My password is correct horse battery staple.",
      "My therapist recommended a different routine."
    ]) {
      expect(appendDialogueWorkingTurn({ conversationId: "chat-a", sourceTurnId: text, text, now })).toBeUndefined();
    }
  });
});
