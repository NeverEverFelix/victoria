import { describe, expect, it, vi } from "vitest";
import { OpenAiEpisodicMemorySummarizer } from "../../../src/agent/memory/openai-episodic-memory-summarizer.js";

describe("OpenAiEpisodicMemorySummarizer", () => {
  it("sends bounded user-only context with storage disabled and validates the summary", async () => {
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

    await expect(summarizer.summarize({ userMessages: ["I want to plan meals before the weekend.", "I usually overspend on takeout."] }))
      .resolves.toMatchObject(output);
    const [, request] = fetcher.mock.calls[0]!;
    expect(JSON.parse(String(request?.body))).toMatchObject({ store: false });
  });

  it("rejects invalid input without calling the provider", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const summarizer = new OpenAiEpisodicMemorySummarizer({ apiKey: "test-only", model: "test-model", fetcher });
    await expect(summarizer.summarize({ userMessages: ["one message"] })).rejects.toThrow("Invalid episodic summary input");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
