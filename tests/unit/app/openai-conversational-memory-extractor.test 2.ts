import { describe, expect, it, vi } from "vitest";
import { OpenAiConversationalMemoryExtractor } from "../../../src/agent/memory/openai-conversational-memory-extractor.js";

describe("OpenAiConversationalMemoryExtractor", () => {
  it("requests non-stored structured candidates and returns the provider result", async () => {
    const candidates = [{
      category: "preference", key: "reminder_time",
      value: "Prefers afternoon reminders.",
      evidence: "Afternoon reminders work better for me.",
      confidence: 0.95, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary"
    }];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ candidates }) }] }]
    })));
    const extractor = new OpenAiConversationalMemoryExtractor({ apiKey: "test-only", model: "test-model", fetcher });

    await expect(extractor.extract({ userMessage: "Afternoon reminders work better for me." })).resolves.toEqual(candidates);
    const [, request] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(request?.body)) as { store?: boolean; input?: string; text?: unknown };
    expect(body).toMatchObject({ store: false, input: "Afternoon reminders work better for me." });
    expect(request?.headers).toMatchObject({ authorization: "Bearer test-only" });
  });

  it("rejects malformed structured output and never calls the provider for invalid input", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ candidates: [{ category: "secret" }] }) }] }]
    })));
    const extractor = new OpenAiConversationalMemoryExtractor({ apiKey: "test-only", model: "test-model", fetcher });

    await expect(extractor.extract({ userMessage: "   " })).rejects.toThrow("Invalid conversational memory extraction input");
    expect(fetcher).not.toHaveBeenCalled();
    await expect(extractor.extract({ userMessage: "I prefer afternoons." })).rejects.toThrow("did not match the expected schema");
  });
});
