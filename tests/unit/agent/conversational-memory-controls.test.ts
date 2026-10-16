import { describe, expect, it } from "vitest";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { MockLlmAdapter } from "../../../src/agent/llm/mock-llm.js";
import { MockVictoriaTools } from "../../../src/agent/tools/mock-tools.js";
import { VictoriaAgent } from "../../../src/agent/victoria-agent.js";

describe("conversational memory controls", () => {
  async function setup() {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    return { memory, tools, agent };
  }

  it("reviews current memories through chat without creating financial activity", async () => {
    const { memory, tools, agent } = await setup();
    await memory.rememberConversationalMemory("user-a", {
      category: "preference", key: "reply_style", value: "Prefers concise replies.", evidence: "User said so.", confidence: 1
    });
    const response = await agent.respond({ userId: "user-a", message: "What do you remember about me?" });
    expect(response.message).toContain("Prefers concise replies.");
    expect(response.decision.action).toBe("reflect");
    expect(await tools.listSavingsEntries("user-a")).toEqual([]);
    expect(await tools.listSavingsGoalAllocations("user-a")).toEqual([]);
  });

  it("explains connected profile controls when review includes profile-derived facts", async () => {
    const { memory, agent } = await setup();
    await memory.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "financial_profile:merchant:cafe", value: "Typical spend at Cafe is $8.",
      evidence: "Derived from posted transactions.", confidence: 0.9, sourceType: "plaid_transaction_profile",
      observedThrough: new Date().toISOString().slice(0, 10)
    });
    const response = await agent.respond({ userId: "user-a", message: "What do you remember about me?" });
    expect(response.message).toContain("Typical spend at Cafe is $8.");
    expect(response.message).toContain("disconnecting that profile");
  });

  it("forgets a uniquely identified conversational memory and asks when the match is unclear", async () => {
    const { memory, agent } = await setup();
    const saved = await memory.rememberConversationalMemory("user-a", {
      category: "preference", key: "reply_style", value: "Prefers concise replies.", evidence: "User said so.", confidence: 1
    });
    const forgotten = await agent.respond({ userId: "user-a", message: "Forget my concise replies preference." });
    expect(forgotten.message).toContain("I forgot");
    expect(await memory.listConversationalMemories("user-a")).toEqual([]);
    expect(saved.id).toBeTruthy();

    const unclear = await agent.respond({ userId: "user-a", message: "Forget that thing." });
    expect(unclear.decision.action).toBe("ask_follow_up");
    expect((await agent.respond({ userId: "user-a", message: "Forget it." })).decision.action).toBe("ask_follow_up");
  });

  it("supports forget all and pause/resume in conversation", async () => {
    const { memory, agent } = await setup();
    await memory.rememberConversationalMemory("user-a", {
      category: "goal", key: "emergency_fund", value: "Building an emergency fund.", evidence: "User said so.", confidence: 1
    });
    await agent.respond({ userId: "user-a", message: "Forget everything you remember about me." });
    expect(await memory.listConversationalMemories("user-a")).toEqual([]);
    await agent.respond({ userId: "user-a", message: "Pause memory." });
    expect(await memory.isMemoryPaused("user-a")).toBe(true);
    await agent.respond({ userId: "user-a", message: "Resume memory." });
    expect(await memory.isMemoryPaused("user-a")).toBe(false);
  });
});
