import { describe, expect, it } from "vitest";
import {
  InMemorySpecialistTraceSink,
  type SpecialistHandoffTrace,
  type SpecialistTraceSink
} from "../../../../src/agent/specialists/tracing.js";
import {
  MockCompanionVoiceSpecialist,
  MockFinancialMomentSpecialist,
  MockLlmAdapter,
  MockMemoryProvider,
  MockSavingsReasoningSpecialist,
  MockVictoriaTools,
  VictoriaAgent
} from "../../../../src/agent/index.js";
import { coordinateSpecialists } from "../../../../src/agent/specialists/coordinator.js";

function trace(correlationId: string): SpecialistHandoffTrace {
  return {
    schemaVersion: 1,
    correlationId,
    role: "financial_moment",
    status: "succeeded",
    startedAt: "2026-10-04T20:00:00.000Z",
    completedAt: "2026-10-04T20:00:00.012Z",
    durationMs: 12
  };
}

describe("InMemorySpecialistTraceSink", () => {
  it("keeps only the configured number of metadata-only traces", () => {
    const sink = new InMemorySpecialistTraceSink(2);
    sink.record(trace("turn_1"));
    sink.record(trace("turn_2"));
    sink.record(trace("turn_3"));

    expect(sink.list()).toEqual([trace("turn_2"), trace("turn_3")]);
    expect(Object.keys(sink.list()[0] ?? {}).sort()).toEqual([
      "completedAt",
      "correlationId",
      "durationMs",
      "role",
      "schemaVersion",
      "startedAt",
      "status"
    ]);
  });

  it("rejects an invalid capacity", () => {
    expect(() => new InMemorySpecialistTraceSink(0)).toThrow("capacity must be a positive safe integer");
  });

  it("records only bounded metadata for a complete turn", async () => {
    const traces = new InMemorySpecialistTraceSink(10);
    const agent = createTracedAgent(traces);
    const response = await agent.respond({
      userId: "user_private",
      conversationId: "conversation_private",
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const recorded = traces.list();

    expect(response.decision.action).toBe("suggest_savings");
    expect(recorded.map(({ role, status }) => [role, status])).toEqual([
      ["financial_moment", "succeeded"],
      ["savings_reasoning", "succeeded"],
      ["companion_voice", "succeeded"]
    ]);
    expect(new Set(recorded.map(({ correlationId }) => correlationId)).size).toBe(1);
    expect(JSON.stringify(recorded)).not.toContain("user_private");
    expect(JSON.stringify(recorded)).not.toContain("conversation_private");
    expect(JSON.stringify(recorded)).not.toContain("almost bought");
    expect(recorded.every((item) => item.durationMs >= 0 && item.durationMs < 1000)).toBe(true);
    expect(agent.getRecentSpecialistHandoffTraces()).toEqual(recorded);
  });

  it("does not change the response if trace recording fails", async () => {
    const untraced = await createTracedAgent().respond({
      userId: "user_123",
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const tracedAgent = createTracedAgent({
      record: () => { throw new Error("trace store unavailable"); }
    });
    const traced = await tracedAgent.respond({
      userId: "user_123",
      message: "I almost bought a $90 jacket but decided to wait."
    });

    expect(traced.message).toBe(untraced.message);
    expect(traced.decision.action).toBe(untraced.decision.action);
    expect(traced.decision.toolCall?.name).toBe(untraced.decision.toolCall?.name);
    expect(tracedAgent.getRecentSpecialistHandoffTraces()).toHaveLength(3);
  });

  it("records a material specialist disagreement by role and status only", async () => {
    const traces = new InMemorySpecialistTraceSink();
    const result = await coordinateSpecialists({
      moment: {
        analyze: async () => ({ schemaVersion: 1, classification: {
          type: "avoided_spend" as const,
          confidence: 0.9,
          amountCents: 1200,
          summary: "Skipped lunch",
          needsClarification: false
        } })
      },
      savings: {
        recommend: async () => ({ schemaVersion: 1, recommendation: {
          kind: "suggest",
          id: "suggestion_trace",
          amountCents: 1000,
          currency: "USD",
          movementMode: "mock_ledger",
          source: "manual_estimate",
          reason: "Estimated lunch"
        } })
      }
    }, {
      userMessage: "I skipped a $12 lunch"
    }, {
      correlationId: "turn_trace_test", traceSink: traces,
      estimateSpend: async () => null
    });

    expect(result).toMatchObject({ status: "clarify", reason: "specialist_disagreement" });
    expect(traces.list().map(({ role, status }) => [role, status])).toEqual([
      ["financial_moment", "succeeded"],
      ["savings_reasoning", "disagreement"]
    ]);
    expect(JSON.stringify(traces.list())).not.toContain("$12 lunch");
    expect(JSON.stringify(traces.list())).not.toContain("user_private");
  });

  it("records specialist timeouts without retaining the exception or input", async () => {
    const traces = new InMemorySpecialistTraceSink();
    const result = await coordinateSpecialists({
      moment: { analyze: async () => new Promise(() => {}) },
      savings: { recommend: async () => ({ schemaVersion: 1, recommendation: { kind: "no_suggestion" } }) }
    }, {
      userMessage: "private user text"
    }, {
      timeoutMs: 5, correlationId: "turn_timeout_test", traceSink: traces,
      estimateSpend: async () => null
    });

    expect(result).toMatchObject({ status: "clarify", reason: "specialist_failure" });
    expect(traces.list().map(({ role, status }) => [role, status])).toEqual([
      ["financial_moment", "timed_out"]
    ]);
    expect(JSON.stringify(traces.list())).not.toContain("private user text");
  });
});

function createTracedAgent(traceSink?: SpecialistTraceSink): VictoriaAgent {
  const llm = new MockLlmAdapter();
  const memory = new MockMemoryProvider();
  const tools = new MockVictoriaTools();
  return new VictoriaAgent({
    memory,
    tools,
    specialists: {
      moment: new MockFinancialMomentSpecialist(llm),
      savings: new MockSavingsReasoningSpecialist()
    },
    voice: new MockCompanionVoiceSpecialist(),
    ...(traceSink ? { traceSink } : {})
  });
}
