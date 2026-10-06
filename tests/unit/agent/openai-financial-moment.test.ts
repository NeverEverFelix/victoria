import { describe, expect, it, vi } from "vitest";
import { OpenAiFinancialMomentAdapter } from "../../../src/agent/llm/openai-financial-moment.js";
import { ProviderUsageReporter } from "../../../src/agent/telemetry/provider-usage-reporter.js";

describe("OpenAiFinancialMomentAdapter", () => {
  it("uses strict structured output and derives the amount from the user message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      usage: { input_tokens: 21, output_tokens: 13 },
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        type: "avoided_spend", confidence: 0.92, merchantName: "Tailor", goalName: null,
        revisionReason: null, summary: "Paused a jacket purchase", needsClarification: false
      }) }] }]
    }));
    const usageReporter = new ProviderUsageReporter();
    const adapter = new OpenAiFinancialMomentAdapter({ apiKey: "test-key", model: "gpt-test", fetcher, usageReporter });

    const result = await adapter.classifyMessage({
      userMessage: "I almost bought a $90 jacket at Tailor but waited.",
      memory: { habits: [], goals: [], recentDecisions: [] }
    });

    expect(result).toMatchObject({ type: "avoided_spend", amountCents: 9000, confidence: 0.92, merchantName: "Tailor" });
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/responses");
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({ type: "json_schema", name: "financial_moment_v1", strict: true });
    expect(request.tools).toBeUndefined();
    expect(usageReporter.snapshot()).toMatchObject([
      { role: "financial_moment", inputTokens: 21, outputTokens: 13 }
    ]);
    expect(usageReporter.snapshot()[0]?.elapsedMs).toEqual(expect.any(Number));
  });

  it("marks malformed explicit amounts for clarification", async () => {
    const adapter = new OpenAiFinancialMomentAdapter({
      apiKey: "test-key",
      model: "gpt-test",
      fetcher: async () => jsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          type: "avoided_spend", confidence: 0.9, merchantName: null, goalName: null,
          revisionReason: null, summary: "Avoided a purchase", needsClarification: false
        }) }] }]
      })
    });

    const result = await adapter.classifyMessage({
      userMessage: "I skipped a $10 and $20 purchase",
      memory: { habits: [], goals: [], recentDecisions: [] }
    });
    expect(result).toMatchObject({ type: "avoided_spend", amountIssue: "multiple_amounts", needsClarification: true });
  });

  it("drops model-supplied merchant names that are absent from the user context", async () => {
    const adapter = new OpenAiFinancialMomentAdapter({
      apiKey: "test-key", model: "gpt-test", fetcher: async () => jsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          type: "avoided_spend", confidence: 0.9, merchantName: "DoorDash", goalName: null,
          revisionReason: null, summary: "Cooked at home", needsClarification: false
        }) }] }]
      })
    });
    const result = await adapter.classifyMessage({
      userMessage: "I cooked instead of ordering takeout.",
      memory: { habits: [], goals: [], recentDecisions: [] }
    });
    expect(result.merchantName).toBeUndefined();
  });

  it("rejects API errors and schema-invalid output", async () => {
    const failed = new OpenAiFinancialMomentAdapter({
      apiKey: "test-key", model: "gpt-test", fetcher: async () => new Response("{}", { status: 429 })
    });
    await expect(failed.classifyMessage({ userMessage: "hello", memory: { habits: [], goals: [], recentDecisions: [] } }))
      .rejects.toThrow("OpenAI classification request failed (429)");

    const invalid = new OpenAiFinancialMomentAdapter({
      apiKey: "test-key", model: "gpt-test", fetcher: async () => jsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }]
      })
    });
    await expect(invalid.classifyMessage({ userMessage: "hello", memory: { habits: [], goals: [], recentDecisions: [] } }))
      .rejects.toThrow("did not match the expected schema");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
