import { OpenAiEmbeddingProvider } from "../agent/memory/openai-embedding-provider.js";
import { PostgresMemoryRepository } from "../agent/memory/postgres-memory-repository.js";
import { SqliteCachedMemoryProvider } from "../agent/memory/sqlite-cached-memory-provider.js";
import { MemoryOrchestrator } from "../agent/memory/memory-orchestrator.js";
import { createVictoriaAgent } from "./create-victoria-agent.js";
import { createPostgresTurnStore } from "./turns/postgres-pool.js";
import type { VictoriaEnv } from "../config/index.js";
import { SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS } from "../agent/memory/semantic-embedding.js";

/** Explicit durable/Supabase-compatible runtime. Default agent composition stays mock-backed. */
export function createPersistentVictoriaAgent(options: {
  env: VictoriaEnv;
  embeddingApiKey: string;
  embeddingModel?: string;
  fetcher?: typeof fetch;
}) {
  const { pool } = createPostgresTurnStore(options.env.databaseUrl);
  const embeddings = new OpenAiEmbeddingProvider({ apiKey: options.embeddingApiKey,
    dimensions: SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS,
    ...(options.embeddingModel ? { model: options.embeddingModel } : {}),
    ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  const postgresMemory = new PostgresMemoryRepository(pool, undefined, embeddings);
  const sqliteMemory = new SqliteCachedMemoryProvider(postgresMemory);
  const memory = new MemoryOrchestrator(sqliteMemory, { financialProfiles: postgresMemory });
  const agent = createVictoriaAgent({ env: options.env, memory, ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  return Object.freeze({ agent, pool, memory, sqliteMemory, postgresMemory });
}
