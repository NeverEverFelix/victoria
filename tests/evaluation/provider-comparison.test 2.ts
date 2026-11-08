import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runProviderComparison } from "./run-provider-comparison.js";

describe("provider comparison runner", () => {
  it("runs both complete-turn arms using mocked Responses API replies", async () => {
    let requestNumber = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { text?: { format?: { name?: string } } };
      const name = request.text?.format?.name;
      const output = name === "savings_assessment_v1"
        ? { outcome: "suggest", confidence: 0.94, amountCents: 4_200, source: "user_provided", rationale: "Exact amount from the user.", question: null }
        : name === "companion_voice_v1"
          ? { response: "Would you like to record $42 in your Victoria savings ledger? No real money has moved yet." }
          : {
              type: "avoided_spend", confidence: 0.95, merchantName: null, goalName: null,
              revisionReason: null, referenceFactId: null, referencePeriod: null, summary: "Skipped a $42 dinner order", needsClarification: false
            };
      const id = `mock-provider-request-${++requestNumber}`;
      return new Response(JSON.stringify({
        usage: { input_tokens: 20, output_tokens: 10 },
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }]
      }), { status: 200, headers: { "x-request-id": id } });
    };

    const report = await runProviderComparison({
      apiKey: "mock-test-key",
      model: "gpt-mock-test",
      rateCard: {
        effectiveDate: "2026-10-01",
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 2
      },
      fetcher,
      caseIds: ["P01"]
    });

    const reportTemplate = JSON.parse(readFileSync(new URL("./templates/provider-run-report.json", import.meta.url), "utf8")) as unknown;
    expectToMatchReportShape(report, reportTemplate);
    expect(requestNumber).toBe(8);
    expect(report.reportType).toBe("provider_comparison");
    expect(report.arms.map((arm) => arm.armId)).toEqual(["financial_moment_baseline", "specialist_team"]);
    expect(report.arms[0]?.turns[0]).toMatchObject({
      id: "P01", probedIntent: "avoided_spend", actualAction: "suggest_savings", actualAmountCents: 4_200,
      ledgerEntriesAdded: 0, safetyFailures: [], errors: [], targetProviderCallCount: 2,
      financialAssessmentRoute: "assessed"
    });
    expect(report.arms[0]?.turns[0]?.estimatedCostUsd).toBeCloseTo(0.00012);
    expect(report.arms[0]?.summary.usage.calls).toBe(3);
    expect(report.arms[1]?.summary.usage.calls).toBe(5);
    expect(report.arms[0]?.summary.usage.callsByRole.turn_understanding).toBe(1);
    expect(report.arms[1]?.summary.usage.callsByRole.turn_understanding).toBe(1);
    expect(report.arms[1]?.summary.usage.callsByRole).toEqual({
      turn_understanding: 1, financial_moment: 2, savings_reasoning: 1, companion_voice: 1
    });
    expect(report.arms[1]?.summary.usage.requestIds).toHaveLength(5);
    expect(report.arms[1]?.summary.roleLatencyMs.financial_moment.sampleCount).toBe(2);
    expect(report.arms[1]?.summary.usage.estimatedCostUsdByRole).toEqual({
      turn_understanding: 0.00004, financial_moment: 0.00008, savings_reasoning: 0.00004, companion_voice: 0.00004
    });
    expect(report.arms[1]?.summary.costPerTurnUsd.sampleCount).toBe(1);
    expect(report.arms[0]?.summary.targetProviderCallsPerTurn.max).toBe(2);
    expect(report.arms[1]?.summary.targetProviderCallsPerTurn.max).toBe(4);
    expect(report.arms[0]?.turns[0]?.targetProviderElapsedMs).not.toBeNull();
    expect(report.arms[0]?.turns[0]?.targetElapsedOutsideRecordedProviderCallsMs).toBeGreaterThanOrEqual(0);
    expect(report.arms[1]?.summary.safetyFailures).toBe(0);
    expect(report.arms[0]?.summary.financialAssessmentRoutes).toEqual({
      assessed: 1, skipped_plain_question: 0, skipped_model_dialogue: 0, resolved_pending_amount: 0
    });
  });

  it("records malformed provider outputs per turn and completes the comparison report", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ type: "unsupported" }) }] }]
    }), { status: 200 });

    const report = await runProviderComparison({
      apiKey: "mock-test-key",
      model: "gpt-mock-test",
      rateCard: {
        effectiveDate: "2026-10-01",
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 2
      },
      fetcher,
      caseIds: ["P01"]
    });

    expect(report.arms).toHaveLength(2);
    for (const arm of report.arms) {
      expect(arm.turns[0]?.id).toBe("P01");
      expect(arm.turns[0]?.errors).toContain("intent_probe_failed");
      expect(arm.turns[0]?.ledgerEntriesAdded).toBe(0);
      expect(arm.summary.failedOrTimedOutTurns).toBe(1);
      if (arm.turns[0]?.errors.includes("target_invalid_provider_output")) {
        expect(arm.turns[0]).toMatchObject({ runtimeClassification: null, actualAction: null, response: null });
      } else {
        expect(arm.turns[0]).toMatchObject({ runtimeClassification: "unclear", actualAction: "ask_follow_up" });
        expect(arm.turns[0]?.response).toMatch(/tell me a little more/i);
      }
    }
  });

  it("records provider failures during stateful case setup and continues the report", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ type: "unsupported" }) }] }]
    }), { status: 200 });

    const report = await runProviderComparison({
      apiKey: "mock-test-key",
      model: "gpt-mock-test",
      rateCard: {
        effectiveDate: "2026-10-01",
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 2
      },
      fetcher,
      caseIds: ["P31"]
    });

    for (const arm of report.arms) {
      expect(arm.turns[0]?.errors.some((error) => error.startsWith("state_setup_"))).toBe(true);
      expect(arm.turns[0]).toMatchObject({
        id: "P31", probedIntent: null, runtimeClassification: null, actualAction: null,
        intentProbeElapsedMs: null, targetElapsedMs: null, targetProviderCallCount: null,
        targetProviderElapsedMs: null, targetElapsedOutsideRecordedProviderCallsMs: null, response: null
      });
      expect(arm.summary.failedOrTimedOutTurns).toBe(1);
    }
  });
});

function expectToMatchReportShape(actual: unknown, template: unknown): void {
  if (Array.isArray(actual)) {
    expect(Array.isArray(template)).toBe(true);
    if (actual.length > 0 && Array.isArray(template) && template.length > 0) {
      for (const item of actual) expectToMatchReportShape(item, template[0]);
    }
    return;
  }
  if (!actual || typeof actual !== "object") return;
  expect(template).not.toBeNull();
  expect(typeof template).toBe("object");
  const actualRecord = actual as Record<string, unknown>;
  const templateRecord = template as Record<string, unknown>;
  for (const [key, value] of Object.entries(actualRecord)) {
    expect(templateRecord, `report template is missing field ${key}`).toHaveProperty(key);
    expectToMatchReportShape(value, templateRecord[key]);
  }
}
