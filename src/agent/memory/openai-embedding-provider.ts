import { validateSemanticEmbedding, type SemanticEmbeddingProvider } from "./semantic-embedding.js";

/** OpenAI embeddings adapter; it performs network calls only when explicitly constructed and used. */
export class OpenAiEmbeddingProvider implements SemanticEmbeddingProvider {
  readonly modelId: string;
  constructor(private readonly options: { apiKey: string; model?: string; fetcher?: typeof fetch }) {
    if (!options.apiKey.trim()) throw new Error("An OpenAI API key is required for semantic embeddings.");
    this.modelId = options.model ?? "text-embedding-3-small";
  }

  async embed(text: string): Promise<readonly number[]> {
    if (typeof text !== "string" || !text.trim() || text.length > 20_000) throw new Error("Invalid embedding input.");
    const response = await (this.options.fetcher ?? fetch)("https://api.openai.com/v1/embeddings", {
      method: "POST", cache: "no-store",
      headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.modelId, input: text, dimensions: 1536, encoding_format: "float" })
    });
    if (!response.ok) throw new Error("Embedding provider request failed.");
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) throw new Error("Invalid embedding provider response.");
    const vector = ((body as { data: Array<{ embedding?: unknown }> }).data[0])?.embedding;
    if (!validateSemanticEmbedding(vector)) throw new Error("Invalid embedding provider vector.");
    return Object.freeze([...vector]);
  }
}
