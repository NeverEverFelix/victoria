export const SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS = 1536;

/** Adapter contract for a single, versioned embedding model used for writes and queries. */
export interface SemanticEmbeddingProvider {
  readonly modelId: string;
  embed(text: string): Promise<readonly number[]>;
}

export function validateSemanticEmbedding(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.length === SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS &&
    value.every((component) => typeof component === "number" && Number.isFinite(component));
}

export function toPgVectorLiteral(vector: readonly number[]): string {
  if (!validateSemanticEmbedding(vector)) throw new Error("Invalid semantic memory embedding.");
  return `[${vector.join(",")}]`;
}
