import { describe, expect, it, vi } from "vitest";
import { OpenAiFinancialMomentAdapter } from "../../../src/agent/llm/openai-financial-moment.js";
import { ProviderUsageReporter } from "../../../src/agent/telemetry/provider-usage-reporter.js";
import { buildConversationContextSnapshot } from "../../../src/agent/conversation-responder.js";

describe("OpenAiFinancialMomentAdapter", () => {
  it("returns a strict advisory turn plan from the full canonical snapshot", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      usage: { input_tokens: 30, output_tokens: 20 },
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        schemaVersion: 1, primaryIntent: "financial_reflection", secondaryIntents: ["dialogue"],
        dialogueActs: ["personal_update", "question"], questionFocus: "How should I think about saving?",
        references: [], requestedReadOnlyTools: [], actionMention: "none", requestedAction: "none",
        uncertainty: { needsClarification: false, reasons: [] }
      }) }] }]
    }));
    const usageReporter = new ProviderUsageReporter();
    const adapter = new OpenAiFinancialMomentAdapter({ apiKey: "test-key", model: "gpt-test", fetcher, usageReporter });
    const contextSnapshot = buildConversationContextSnapshot({
      message: "Work gave me a raise, and I feel weird about saving more. How should I think about it?",
      recentTurns: ["Victoria: What has been on your mind about work?"], memories: []
    });

    const plan = await adapter.understandTurn({ contextSnapshot });

    expect(plan).toMatchObject({ primaryIntent: "financial_reflection", requestedAction: "none" });
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request.text.format).toMatchObject({ name: "advisory_turn_plan_v1", strict: true });
    expect(request.input).toContain("Work gave me a raise");
    expect(request.input).toContain("What has been on your mind about work?");
    expect(request.text.format.schema.properties).not.toHaveProperty("amountCents");
    expect(request.text.format.schema.properties).not.toHaveProperty("proposalId");
    expect(usageReporter.snapshot()).toMatchObject([{ role: "turn_understanding", inputTokens: 30, outputTokens: 20 }]);
  });

  it("uses strict structured output and derives the amount from the user message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      usage: { input_tokens: 21, output_tokens: 13 },
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        type: "avoided_spend", confidence: 0.92, merchantName: "Tailor", goalName: null,
        revisionReason: null, referenceFactId: null, referencePeriod: null, summary: "Paused a jacket purchase", needsClarification: false
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

  it("uses a grounded remembered merchant name while leaving its factual amount to typed services", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        type: "avoided_spend", confidence: 0.9, merchantName: "streaming add-on", goalName: null,
        revisionReason: null, referenceFactId: null, referencePeriod: null,
        summary: "Did not renew a streaming service", needsClarification: false
      }) }] }]
    }));
    const adapter = new OpenAiFinancialMomentAdapter({ apiKey: "test-key", model: "gpt-test", fetcher });

    const result = await adapter.classifyMessage({
      userMessage: "I didn't renew the extra streaming channel.",
      memory: { habits: [{
        id: "streaming_habit", userId: "user", merchantName: "streaming add-on",
        typicalAmountCents: 799, currency: "USD", confidence: 0.9
      }], goals: [], recentDecisions: [] }
    });

    expect(result).toMatchObject({ type: "avoided_spend", merchantName: "streaming add-on" });
    expect(result.amountCents).toBeUndefined();
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request.input).toContain('"availableSpendingHabits":[{"merchantName":"streaming add-on","confidence":0.9}]');
    expect(request.input).not.toContain("799");
  });

  it("marks malformed explicit amounts for clarification", async () => {
    const adapter = new OpenAiFinancialMomentAdapter({
      apiKey: "test-key",
      model: "gpt-test",
      fetcher: async () => jsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          type: "avoided_spend", confidence: 0.9, merchantName: null, goalName: null,
          revisionReason: null, referenceFactId: null, referencePeriod: null, summary: "Avoided a purchase", needsClarification: false
        }) }] }]
      })
    });

    const result = await adapter.classifyMessage({
      userMessage: "I skipped a $10 and $20 purchase",
      memory: { habits: [], goals: [], recentDecisions: [] }
    });
    expect(result).toMatchObject({ type: "avoided_spend", amountIssue: "multiple_amounts", needsClarification: true });
  });

  it("sends the full conversational context for intent classification instead of routing from phrase matches", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        type: "real_money_movement_request", confidence: 0.91, merchantName: null, goalName: null,
        revisionReason: null, referenceFactId: null, referencePeriod: null, summary: "Asked to move the discussed amount", needsClarification: false
      }) }] }]
    }));
    const adapter = new OpenAiFinancialMomentAdapter({ apiKey: "test-key", model: "gpt-test", fetcher });

    const result = await adapter.classifyMessage({
      userMessage: "Can we move the $37.46 we discussed into savings?",
      memory: { habits: [], goals: [], recentDecisions: [] },
      conversationContext: ["I almost bought lunch for $37.46, but skipped it."]
    });

    expect(result.type).toBe("real_money_movement_request");
    const request = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(request.instructions).toContain("do not classify from a keyword or phrase alone");
    expect(request.instructions).toContain("a statement such as 'I saved money today' is not a progress question");
    expect(request.instructions).toContain("saving more is not automatically the right answer");
    expect(request.input).toContain("I almost bought lunch for $37.46, but skipped it.");
    expect(request.input).toContain("Can we move the $37.46 we discussed into savings?");
  });

  it("returns a context fact reference without converting it into a savings amount", async () => {
    const adapter = new OpenAiFinancialMomentAdapter({
      apiKey: "test-key", model: "gpt-test", fetcher: async () => jsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          type: "proposal_revision", confidence: 0.9, merchantName: null, goalName: null,
          revisionReason: "yearly amount", referenceFactId: "turn:0:annual-projection", referencePeriod: "annual",
          summary: "The user refers to the annual projection.", needsClarification: false
        }) }] }]
      })
    });
    const financialContext = {
      relevantUserTurns: [{ sourceTurnIndex: 0, text: "My employer covers a $35/month gym cost." }],
      selectedMemoryFacts: [],
      conversationSavingsEvents: [],
      financialFacts: [{
        id: "turn:0:annual-projection", amountCents: 42_000, currency: "USD" as const,
        period: "annual" as const, meaning: "conditional_projection" as const,
        provenance: "derived" as const, evidenceTurnIndexes: [0], condition: "Only if it stays covered for 12 months."
      }]
    };
    const result = await adapter.classifyMessage({
      userMessage: "record the yearly amount",
      memory: { habits: [], goals: [], recentDecisions: [] },
      financialContext
    });

    expect(result.referenceHint).toEqual({ factId: "turn:0:annual-projection", period: "annual" });
    expect(result.amountCents).toBeUndefined();
    expect(result).not.toHaveProperty("amountIssue");
  });

  it("drops model-supplied merchant names that are absent from the user context", async () => {
    const adapter = new OpenAiFinancialMomentAdapter({
      apiKey: "test-key", model: "gpt-test", fetcher: async () => jsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          type: "avoided_spend", confidence: 0.9, merchantName: "DoorDash", goalName: null,
          revisionReason: null, referenceFactId: null, referencePeriod: null, summary: "Cooked at home", needsClarification: false
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

    const invalidUsage = new ProviderUsageReporter();
    const invalid = new OpenAiFinancialMomentAdapter({
      apiKey: "test-key", model: "gpt-test", fetcher: async () => jsonResponse({
        usage: { input_tokens: 8, output_tokens: 3 },
        output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }]
      }), usageReporter: invalidUsage
    });
    await expect(invalid.classifyMessage({ userMessage: "hello", memory: { habits: [], goals: [], recentDecisions: [] } }))
      .rejects.toThrow("did not match the expected schema");
    expect(invalidUsage.snapshot()).toMatchObject([
      { role: "financial_moment", inputTokens: 8, outputTokens: 3 }
    ]);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
