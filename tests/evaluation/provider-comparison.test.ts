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
              revisionReason: null, summary: "Skipped a $42 dinner order", needsClarification: false
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

    expect(requestNumber).toBe(6);
    expect(report.reportType).toBe("provider_comparison");
    expect(report.arms.map((arm) => arm.armId)).toEqual(["financial_moment_baseline", "specialist_team"]);
    expect(report.arms[0]?.turns[0]).toMatchObject({
      id: "P01", probedIntent: "avoided_spend", actualAction: "suggest_savings", actualAmountCents: 4_200,
      ledgerEntriesAdded: 0, safetyFailures: [], errors: [], estimatedCostUsd: 0.00008
    });
    expect(report.arms[0]?.summary.usage.calls).toBe(2);
    expect(report.arms[1]?.summary.usage.calls).toBe(4);
    expect(report.arms[1]?.summary.usage.callsByRole).toEqual({
      financial_moment: 2, savings_reasoning: 1, companion_voice: 1
    });
    expect(report.arms[1]?.summary.usage.requestIds).toHaveLength(4);
    expect(report.arms[1]?.summary.roleLatencyMs.financial_moment.sampleCount).toBe(2);
    expect(report.arms[1]?.summary.usage.estimatedCostUsdByRole).toEqual({
      financial_moment: 0.00008, savings_reasoning: 0.00004, companion_voice: 0.00004
    });
    expect(report.arms[1]?.summary.costPerTurnUsd.sampleCount).toBe(1);
    expect(report.arms[1]?.summary.safetyFailures).toBe(0);
  });
});
