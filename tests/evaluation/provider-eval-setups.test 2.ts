import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MockLlmAdapter, MockMemoryProvider, MockVictoriaTools, VictoriaAgent } from "../../src/agent/index.js";
import { applyProviderEvalStateSetup, providerEvalStateSetups } from "./fixtures/provider-eval-v1-setups.js";

const corpusUrl = new URL("./fixtures/provider-eval-v1.json", import.meta.url);
const corpusHash = "2bf4b48684abe591d2108afafc059bed871735f0caa6c53b43f33e13a24e562c";

describe("frozen provider evaluation state setup", () => {
  it("keeps state seeding outside the frozen corpus", () => {
    const bytes = readFileSync(corpusUrl);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(corpusHash);
    expect(Object.keys(providerEvalStateSetups).sort()).toEqual(["P31", "P32", "P33", "P34", "P35", "P49", "P50"]);
  });

  it.each(["P31", "P32", "P33", "P34", "P35"]) (
    "%s starts with an exact $20 proposal pending approval",
    async (caseId) => {
      const harness = createHarness();
      const responses = await applyProviderEvalStateSetup({
        caseId,
        agent: harness.agent,
        tools: harness.tools,
        userId: "provider_eval_user",
        conversationId: `provider_eval_${caseId}`
      });

      expect(responses).toHaveLength(1);
      expect(responses[0]?.decision.proposal?.status).toBe("pending");
      expect(responses[0]?.decision.suggestion?.amountCents).toBe(2_000);
      expect(responses[0]?.decision.toolCall?.requiresApproval).toBe(true);
      expect(await harness.tools.listSavingsEntries("provider_eval_user")).toEqual([]);
    }
  );

  it("creates P50's prior ledger entry through the normal exact-approval flow", async () => {
    const harness = createHarness();
    const responses = await applyProviderEvalStateSetup({
      caseId: "P50",
      agent: harness.agent,
      tools: harness.tools,
      userId: "provider_eval_user",
      conversationId: "provider_eval_P50"
    });

    expect(responses.map((response) => response.decision.action)).toEqual([
      "suggest_savings", "create_ledger_entry"
    ]);
    expect(await harness.tools.listSavingsEntries("provider_eval_user")).toMatchObject([
      { amountCents: 2_000, movementMode: "mock_ledger" }
    ]);
  });

  it("loads P49's stale-estimate context before the avoided-spend target turn", async () => {
    const habits = [{
      id: "P49_old_cafe_habit", userId: "provider_eval_user", merchantName: "cafe",
      typicalAmountCents: 1_500, currency: "USD" as const, confidence: 0.9
    }];
    const tools = new MockVictoriaTools(habits);
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory: new MockMemoryProvider(habits), tools });
    const responses = await applyProviderEvalStateSetup({
      caseId: "P49", agent, tools, userId: "provider_eval_user", conversationId: "provider_eval_P49"
    });

    expect(responses.map((response) => response.decision.action)).toEqual(["ask_follow_up"]);
    expect(await tools.listSavingsEntries("provider_eval_user")).toEqual([]);
  });
});

function createHarness() {
  const tools = new MockVictoriaTools();
  const agent = new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: new MockMemoryProvider(),
    tools
  });
  return { agent, tools };
}
