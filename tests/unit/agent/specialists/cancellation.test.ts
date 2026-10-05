import { describe, expect, it, vi } from "vitest";
import { MockLlmAdapter } from "../../../../src/agent/llm/mock-llm.js";
import type { LlmAdapter } from "../../../../src/agent/llm/types.js";
import { MockVictoriaTools } from "../../../../src/agent/tools/mock-tools.js";
import { MockFinancialMomentSpecialist } from "../../../../src/agent/specialists/mock-specialists.js";
import type { ClassifiedMessage } from "../../../../src/agent/types.js";

const classification: ClassifiedMessage = {
  type: "avoided_spend",
  confidence: 0.9,
  summary: "Skipped takeout",
  needsClarification: false
};

describe("specialist cancellation propagation", () => {
  it("passes the orchestrator abort signal to the model adapter", async () => {
    const controller = new AbortController();
    const llm: LlmAdapter = {
      classifyMessage: vi.fn().mockResolvedValue(classification),
      draftResponse: vi.fn().mockResolvedValue("response")
    };
    const specialist = new MockFinancialMomentSpecialist(llm);

    await specialist.analyze({
      handoff: { schemaVersion: 1, userMessage: "I skipped takeout" },
      signal: controller.signal
    });

    expect(llm.classifyMessage).toHaveBeenCalledWith(expect.objectContaining({ signal: controller.signal }));
  });

  it("makes the mock model adapter stop when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(new MockLlmAdapter().classifyMessage({
      userMessage: "I skipped takeout",
      signal: controller.signal
    })).rejects.toThrow();
  });

  it("makes mock avoided-spend estimation stop when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(new MockVictoriaTools().estimateAvoidedSpend({
      userId: "user_123",
      userProvidedAmountCents: 1200,
      signal: controller.signal
    })).rejects.toThrow();
  });
});
