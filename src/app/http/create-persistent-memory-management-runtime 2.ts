import "server-only";
import { createHash } from "node:crypto";
import { OpenAiEmbeddingProvider } from "../../agent/memory/openai-embedding-provider.js";
import { SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS } from "../../agent/memory/semantic-embedding.js";
import { parseVictoriaEnv, type EnvSource } from "../../config/env.js";
import { createPostgresTurnStore } from "../turns/postgres-pool.js";
import { createSupabaseBearerAuthenticator } from "../auth/supabase-bearer-auth.js";
import { createMemoryManagementHandlers } from "./memory-management-handler.js";
import { createRlsScopedMemoryManagement } from "./rls-scoped-memory-management.js";

type PersistentMemoryManagementHandlers = ReturnType<typeof createMemoryManagementHandlers>;
let cachedRuntime: { readonly key: string; readonly handlers: PersistentMemoryManagementHandlers } | undefined;

/** Creates a warm-instance cached, Postgres-only memory runtime for Vercel functions. */
export function getPersistentMemoryManagementHandlers(
  source: EnvSource = process.env,
  fetcher?: typeof fetch
): PersistentMemoryManagementHandlers | null {
  if (source.APP_ENV !== "production" && source.APP_ENV !== "staging") return null;
  try {
    const env = parseVictoriaEnv(source);
    const supabaseUrl = source.SUPABASE_URL?.trim();
    const supabasePublishableKey = source.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!supabaseUrl || !supabasePublishableKey) return null;
    const key = createHash("sha256").update(env.databaseUrl).update("\0")
      .update(env.openAiApiKey).update("\0").update(supabaseUrl).update("\0")
      .update(supabasePublishableKey).digest("hex");
    if (cachedRuntime?.key === key) return cachedRuntime.handlers;

    const authenticate = createSupabaseBearerAuthenticator({
      supabaseUrl,
      publishableKey: supabasePublishableKey,
      ...(fetcher ? { fetcher } : {})
    });
    const { pool } = createPostgresTurnStore(env.databaseUrl, { maxPoolSize: 1 });
    const embeddings = new OpenAiEmbeddingProvider({
      apiKey: env.openAiApiKey,
      dimensions: SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS,
      ...(fetcher ? { fetcher } : {})
    });
    // Vercel function instances have ephemeral local filesystems; each statement
    // therefore uses durable Postgres under a transaction-local authenticated RLS scope.
    const memoryForUser = createRlsScopedMemoryManagement(pool, embeddings);
    const handlers = createMemoryManagementHandlers({ authenticate, memoryForUser });
    cachedRuntime = Object.freeze({ key, handlers });
    return handlers;
  } catch {
    return null;
  }
}
