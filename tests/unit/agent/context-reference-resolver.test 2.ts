import { describe, expect, it, vi } from "vitest";
import { OpenAiContextReferenceResolver } from "../../../src/agent/context-reference-resolver.js";

function responseWithText(text: string): Response {
  return new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text }] }] }),
    { status: 200, headers: { "content-type": "application/json" } });
}

describe("context reference resolver", () => {
  it("passes grounded events to the model without giving it financial tools", async () => {
    const fetcher = vi.fn(async (...request: Parameters<typeof fetch>) => {
      expect(request[0]).toBe("https://api.openai.com/v1/responses");
      return responseWithText(JSON.stringify({
        kind: "annual_projection", sourceTurnIndexes: [0, 2], confidence: 0.94
      }));
    });
    const resolver = new OpenAiContextReferenceResolver({ apiKey: "test-key", model: "test-model", fetcher });
    const recurringCosts = [
      { sourceTurnIndex: 0, sourceText: "I canceled a $35/month yoga membership.", monthlyAmountCents: 3500 },
      { sourceTurnIndex: 2, sourceText: "I quit a $20/month streaming service.", monthlyAmountCents: 2000 }
    ];
    const result = await resolver.resolve({ message: "What is both over a year?", recurringCosts });
    expect(result).toEqual({ kind: "annual_projection", sourceTurnIndexes: [0, 2], confidence: 0.94 });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.input).toContain("monthlyAmountCents");
    expect(body.instructions).toMatch(/cannot approve, create, record, or transfer money/i);
    expect(body.store).toBe(false);
  });

  it("rejects malformed model references", async () => {
    const resolver = new OpenAiContextReferenceResolver({
      apiKey: "test-key", model: "test-model",
      fetcher: async () => responseWithText(JSON.stringify({
        kind: "annual_projection", sourceTurnIndexes: ["invented"], confidence: 0.99
      }))
    });
    await expect(resolver.resolve({ message: "What is both over a year?", recurringCosts: [] }))
      .rejects.toThrow("Invalid context reference result");
  });
});
