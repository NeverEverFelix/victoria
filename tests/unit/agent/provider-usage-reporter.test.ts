import { describe, expect, it } from "vitest";
import { ProviderUsageReporter } from "../../../src/agent/telemetry/provider-usage-reporter.js";

describe("ProviderUsageReporter", () => {
  it("keeps provider metadata in an immutable snapshot and emits JSON lines", () => {
    const reporter = new ProviderUsageReporter();
    reporter.report({ role: "financial_moment", inputTokens: 21, outputTokens: 13, requestId: "req-123" });

    const snapshot = reporter.snapshot();
    expect(snapshot).toEqual([
      { role: "financial_moment", inputTokens: 21, outputTokens: 13, requestId: "req-123" }
    ]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(reporter.toJsonLines()).toBe(JSON.stringify(snapshot[0]));
  });

  it("summarizes per-role usage and estimates cost from a dated rate card", () => {
    const reporter = new ProviderUsageReporter();
    reporter.report({ role: "financial_moment", inputTokens: 1_000, outputTokens: 500, requestId: "req-1" });
    reporter.report({ role: "companion_voice", inputTokens: 250, outputTokens: 100, requestId: "req-2" });

    expect(reporter.summarize({
      effectiveDate: "2026-10-01",
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2
    })).toEqual({
      effectiveRateDate: "2026-10-01",
      calls: 2,
      inputTokens: 1_250,
      outputTokens: 600,
      estimatedCostUsd: 0.00245,
      estimatedCostUsdByRole: { financial_moment: 0.002, savings_reasoning: 0, companion_voice: 0.00045 },
      callsByRole: { financial_moment: 1, savings_reasoning: 0, companion_voice: 1 },
      tokensByRole: {
        financial_moment: { input: 1_000, output: 500 },
        savings_reasoning: { input: 0, output: 0 },
        companion_voice: { input: 250, output: 100 }
      },
      requestIds: ["req-1", "req-2"]
    });
  });

  it("leaves estimated cost unknown when a response has incomplete usage", () => {
    const reporter = new ProviderUsageReporter();
    reporter.report({ role: "savings_reasoning", inputTokens: 10, requestId: "req-partial" });

    expect(reporter.summarize({
      effectiveDate: "2026-10-01",
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2
    }).estimatedCostUsd).toBeNull();
    expect(reporter.summarize({
      effectiveDate: "2026-10-01",
      inputUsdPerMillionTokens: 1,
      outputUsdPerMillionTokens: 2
    }).estimatedCostUsdByRole).toEqual({ financial_moment: 0, savings_reasoning: null, companion_voice: 0 });
  });

  it("groups available response timings by provider role", () => {
    const reporter = new ProviderUsageReporter();
    reporter.report({ role: "financial_moment", elapsedMs: 12 });
    reporter.report({ role: "savings_reasoning", elapsedMs: 27 });
    reporter.report({ role: "financial_moment" });

    expect(reporter.roleLatenciesMs()).toEqual({
      financial_moment: [12], savings_reasoning: [27], companion_voice: []
    });
  });

  it("rejects incomplete or invalid rate cards", () => {
    const reporter = new ProviderUsageReporter();
    expect(() => reporter.summarize({
      effectiveDate: " ", inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2
    })).toThrow("finite non-negative rates");
    expect(() => reporter.summarize({
      effectiveDate: "2026-10-01", inputUsdPerMillionTokens: -1, outputUsdPerMillionTokens: 2
    })).toThrow("finite non-negative rates");
  });
});
