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
});
