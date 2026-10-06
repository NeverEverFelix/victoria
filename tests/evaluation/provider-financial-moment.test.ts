import { describe, expect, it } from "vitest";
import { applyClassificationConfidencePolicy } from "../../src/agent/confidence-policy.js";
import { OpenAiFinancialMomentAdapter } from "../../src/agent/llm/openai-financial-moment.js";
import { ProviderUsageReporter } from "../../src/agent/telemetry/provider-usage-reporter.js";
import { summarizeLatencies } from "./metrics.js";
import { multiAgentReadinessScenarios } from "./fixtures/multi-agent-scenarios.js";

const enabled = process.env.RUN_PROVIDER_EVAL === "1";

describe.skipIf(!enabled)("provider-backed Financial Moment evaluation", () => {
  it("runs the frozen starter corpus and reports contract outcomes, latency, and token usage", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_EVAL_MODEL ?? "gpt-6-luna";
    if (!apiKey) throw new Error("Set OPENAI_API_KEY to run the provider evaluation.");
    if (model === "mock") throw new Error("OPENAI_EVAL_MODEL must be a provider model, not mock.");

    const usageReporter = new ProviderUsageReporter();
    const adapter = new OpenAiFinancialMomentAdapter({ apiKey, model, usageReporter });
    const results: Array<{ id: string; expected: string; actual: string; elapsedMs: number; amountMatches: boolean }> = [];

    for (const scenario of multiAgentReadinessScenarios) {
      const start = performance.now();
      const raw = await adapter.classifyMessage({
        userMessage: scenario.userMessage,
        memory: { habits: scenario.habits ?? [], goals: [], recentDecisions: [] }
      });
      const elapsedMs = Math.round(performance.now() - start);
      const actual = applyClassificationConfidencePolicy(raw).type;
      const amountMatches = scenario.expectedClassification !== "avoided_spend" ||
        (raw.amountCents === scenario.expectedAmountCents &&
          (scenario.expectedAmountCents !== undefined || raw.needsClarification));
      results.push({ id: scenario.id, expected: scenario.expectedClassification, actual, elapsedMs, amountMatches });
    }

    const report = {
      model,
      schemaVersion: "financial_moment_v1",
      promptVersion: "financial-moment-instructions-v1",
      corpusSize: results.length,
      classificationPasses: results.filter((result) => result.expected === result.actual).length,
      amountPasses: results.filter((result) => result.amountMatches).length,
      latency: summarizeLatencies(results.map((result) => result.elapsedMs)),
      inputTokens: usageReporter.snapshot().reduce((sum, record) => sum + (record.inputTokens ?? 0), 0),
      outputTokens: usageReporter.snapshot().reduce((sum, record) => sum + (record.outputTokens ?? 0), 0),
      requestIds: usageReporter.snapshot().flatMap((record) => record.requestId ? [record.requestId] : []),
      cases: results
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    expect(report.classificationPasses).toBe(results.length);
    expect(report.amountPasses).toBe(results.length);
  }, 120_000);
});
