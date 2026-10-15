import { describe, expect, it, vi } from "vitest";
import { OpenAiEmbeddingProvider } from "../../../src/agent/memory/openai-embedding-provider.js";

describe("OpenAiEmbeddingProvider", () => {
  it("requests a fixed dimension embedding and validates the response", async () => {
    const vector = Array.from({ length: 1536 }, (_, index) => index / 1536);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ embedding: vector }] })));
    const provider = new OpenAiEmbeddingProvider({ apiKey: "test-only", fetcher });

    await expect(provider.embed("financial profile memory")).resolves.toHaveLength(1536);
    expect(fetcher).toHaveBeenCalledWith("https://api.openai.com/v1/embeddings", expect.objectContaining({
      body: JSON.stringify({ model: "text-embedding-3-small", input: "financial profile memory", dimensions: 1536, encoding_format: "float" })
    }));
  });
});
