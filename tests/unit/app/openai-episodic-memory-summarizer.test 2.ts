import { describe, expect, it, vi } from "vitest";
import { OpenAiEpisodicMemorySummarizer } from "../../../src/agent/memory/openai-episodic-memory-summarizer.js";

describe("OpenAiEpisodicMemorySummarizer", () => {
  it("sends bounded, role-labeled turns with storage disabled and validates the summary", async () => {
    const output = {
      summary: "The user is trying to keep weekend dining costs predictable.",
      evidenceQuotes: ["I want to plan meals before the weekend."],
      confidence: 0.93,
      sensitivity: "ordinary"
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }]
    })));
    const summarizer = new OpenAiEpisodicMemorySummarizer({ apiKey: "test-only", model: "test-model", fetcher });

    const turnPairs = [
      { userMessage: "I want to plan meals before the weekend." },
      { precedingAssistantMessage: "Would monthly or annual planning help?", userMessage: "I usually overspend on takeout." }
    ];
    await expect(summarizer.summarize({
      userMessages: ["I want to plan meals before the weekend.", "I usually overspend on takeout."], turnPairs
    }))
      .resolves.toMatchObject(output);
    const [, request] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(request?.body)) as { store?: boolean; instructions?: string; input?: string };
    expect(body).toMatchObject({ store: false });
    expect(body?.instructions).toContain("never proof that a financial workflow or ledger write completed");
    expect(JSON.parse(String(body.input))).toEqual(turnPairs);
  });

  it("rejects invalid input without calling the provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const summarizer = new OpenAiEpisodicMemorySummarizer({ apiKey: "test-only", model: "test-model", fetcher });
    await expect(summarizer.summarize({ userMessages: ["one message"] })).rejects.toThrow("Invalid episodic summary input");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
