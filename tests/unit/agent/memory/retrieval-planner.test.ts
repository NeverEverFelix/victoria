import { describe, expect, it } from "vitest";
import { planMemoryRetrieval } from "../../../../src/agent/memory/retrieval-planner.js";
import type { ConversationalMemory } from "../../../../src/agent/memory/types.js";

function memory(id: string, key: string, value: string, overrides: Partial<ConversationalMemory> = {}): ConversationalMemory {
  return {
    id, category: "preference", key, value, evidence: value, confidence: 0.95,
    createdAt: "2026-10-20T12:00:00.000Z", sourceType: "user_statement", ...overrides
  };
}

describe("planMemoryRetrieval", () => {
  it("keeps the newest version of a fact before ranking and caps the result", () => {
    const latest = memory("latest", "planning_style", "Prefers monthly planning.", {
      sourceType: "user_correction", createdAt: "2026-10-26T12:00:00.000Z"
    });
    const result = planMemoryRetrieval({
      memories: [memory("old", "planning_style", "Prefers annual planning.", { semanticSimilarity: 1 }), latest,
        memory("hike", "interest:hiking", "Enjoys hiking.")],
      query: "monthly planning", limit: 2
    });

    expect(result.map(({ id }) => id)).toEqual(["latest", "hike"]);
  });

  it("never retrieves inactive, low confidence, or non-user memories", () => {
    const result = planMemoryRetrieval({
      memories: [
        memory("inactive", "interest:hiking", "No longer enjoys hiking.", { sourceMetadata: { interestStatus: "inactive" } }),
        memory("uncertain", "goal:trip", "Maybe a trip.", { confidence: 0.7 }),
        memory("inferred", "goal:trip", "Wants a trip.", { sourceType: "system_inference" })
      ],
      query: "hiking trip", limit: 6
    });

    expect(result).toEqual([]);
  });

  it("keeps facts with the same key when their categories differ", () => {
    const result = planMemoryRetrieval({
      memories: [
        memory("preference-shared", "monthly", "Prefers monthly planning."),
        memory("goal-shared", "monthly", "Has a monthly savings goal.", { category: "goal" })
      ],
      query: "monthly planning savings goal", limit: 6
    });

    expect(result.map(({ id }) => id)).toEqual(expect.arrayContaining(["preference-shared", "goal-shared"]));
  });

  it("requires explicit user provenance and bounded evidence before retrieval", () => {
    const { sourceType: _sourceType, ...legacy } = memory("legacy", "reply_style", "Prefers brief replies.");
    void _sourceType;
    const result = planMemoryRetrieval({
      memories: [
        legacy,
        memory("empty-evidence", "reply_style_2", "Prefers practical replies.", { evidence: "" }),
        memory("invalid-date", "reply_style_4", "Prefers calm replies.", { createdAt: "not-a-date" }),
        memory("future-date", "reply_style_5", "Prefers warm replies.", { createdAt: "2999-01-01T00:00:00.000Z" }),
        memory("valid", "reply_style_3", "Prefers clear replies.")
      ],
      query: "reply style", limit: 6
    });

    expect(result.map(({ id }) => id)).toEqual(["valid"]);
  });

  it("bounds always-relevant memories so a topical goal retains a retrieval slot", () => {
    const preferences = Array.from({ length: 6 }, (_, index) => memory(
      `style-${index}`, `reply_style_${index}`, `Prefers practical answer style ${index}.`,
      { category: "preference", sourceType: "user_statement" }
    ));
    const goal = memory("goal-japan", "goal:japan_trip", "Saving for a trip to Japan.", { category: "goal" });
    const result = planMemoryRetrieval({
      memories: [...preferences, goal], query: "Japan trip", limit: 6,
      alwaysRelevant: (candidate) => candidate.category === "preference", alwaysRelevantLimit: 2
    });

    expect(result.map(({ id }) => id)).toContain("goal-japan");
    expect(result.filter(({ category }) => category === "preference")).toHaveLength(2);
  });

  it("applies per-category ceilings before the final shared result limit", () => {
    const results = ["a", "b", "c", "d"].map((suffix) => memory(
      `goal-${suffix}`, `goal:${suffix}`, `Saving toward a travel goal ${suffix}.`,
      { category: "goal", semanticSimilarity: 0.99 }
    ));
    const habit = memory("habit", "habit:walks", "Enjoys taking a walk after work.", {
      category: "habit", semanticSimilarity: 0.8
    });
    const preference = memory("preference", "reply_style", "Prefers practical answers.", {
      category: "preference", semanticSimilarity: 0.7
    });

    const result = planMemoryRetrieval({
      memories: [...results, habit, preference], query: "travel planning", limit: 6,
      categoryLimits: { goal: 2, habit: 2, preference: 2 }
    });

    expect(result.filter(({ category }) => category === "goal")).toHaveLength(2);
    expect(result.map(({ id }) => id)).toContain("habit");
    expect(result.map(({ id }) => id)).toContain("preference");
  });
});
