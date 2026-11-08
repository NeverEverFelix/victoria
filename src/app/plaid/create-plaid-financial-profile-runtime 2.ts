import { OpenAiEmbeddingProvider } from "../../agent/memory/openai-embedding-provider.js";
import { SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS } from "../../agent/memory/semantic-embedding.js";
import { PostgresMemoryRepository } from "../../agent/memory/postgres-memory-repository.js";
import { SqliteCachedMemoryProvider } from "../../agent/memory/sqlite-cached-memory-provider.js";
import { MemoryOrchestrator } from "../../agent/memory/memory-orchestrator.js";
import type { VictoriaEnv } from "../../config/env.js";
import { createVictoriaAgent } from "../create-victoria-agent.js";
import { createPostgresTurnStore } from "../turns/postgres-pool.js";
import { PlaidAccessTokenCipher } from "./access-token-cipher.js";
import { PostgresPlaidConsentRepository } from "./consent-repository.js";
import { createPlaidLinkTokenHandler } from "./create-link-token-handler.js";
import { FinancialProfileSyncService } from "./financial-profile-sync.js";
import { createFinancialProfileSyncHandler } from "./financial-profile-sync-handler.js";
import { PlaidApiClient } from "./plaid-api-client.js";
import { PostgresPlaidDataRepository } from "./plaid-data-repository.js";
import { PostgresPlaidTokenMaintenanceRepository } from "./plaid-token-maintenance-repository.js";
import { PlaidLinkTokenClient } from "./plaid-link-token-client.js";
import { createPlaidPublicTokenExchangeHandler } from "./public-token-exchange-handler.js";
import { PlaidDataLifecycleService } from "./plaid-data-lifecycle.js";
import { createPlaidDisconnectHandler } from "./disconnect-handler.js";
import { createPlaidConsentHandler } from "./consent-handler.js";

/** Explicitly opted-in Supabase/Postgres + Plaid runtime. Never called by default composition. */
export function createPlaidFinancialProfileRuntime(options: {
  readonly enabled: boolean;
  env: VictoriaEnv;
  tokenEncryptionKeyBase64: string;
  tokenEncryptionKeyVersion?: string;
  previousTokenEncryptionKeysBase64?: Readonly<Record<string, string>>;
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  fetcher?: typeof fetch;
}) {
  if (options.enabled !== true) throw new Error("The Plaid financial-profile runtime requires explicit opt-in.");
  if (options.env.appEnv === "production") throw new Error("Plaid financial-profile runtime is disabled in production.");
  if (!options.env.plaidClientId.trim() || !options.env.plaidSecret.trim()) {
    throw new Error("Plaid client credentials are required for the financial profile runtime.");
  }
  if (options.env.plaidEnv !== "sandbox") {
    throw new Error("Only the Plaid sandbox environment is enabled for the financial profile runtime.");
  }
  if (!options.env.openAiApiKey.trim()) {
    throw new Error("OPENAI_API_KEY is required for semantic memory in the financial profile runtime.");
  }
  const key = Buffer.from(options.tokenEncryptionKeyBase64, "base64");
  if (key.byteLength !== 32 || key.toString("base64") !== options.tokenEncryptionKeyBase64) {
    throw new Error("PLAID_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  const activeKeyVersion = options.tokenEncryptionKeyVersion ?? "v1";
  const previousKeys = new Map<string, Uint8Array>();
  for (const [version, encoded] of Object.entries(options.previousTokenEncryptionKeysBase64 ?? {})) {
    if (version === activeKeyVersion) throw new Error("Active and previous Plaid token key versions must be unique.");
    const decoded = Buffer.from(encoded, "base64");
    if (!encoded || decoded.byteLength !== 32 || decoded.toString("base64") !== encoded) {
      throw new Error(`PLAID_TOKEN_ENCRYPTION_KEYS[${version}] must be base64 for a 32-byte key.`);
    }
    previousKeys.set(version, decoded);
  }
  const cipher = new PlaidAccessTokenCipher(key, activeKeyVersion, previousKeys);
  const { pool } = createPostgresTurnStore(options.env.databaseUrl);
  const consent = new PostgresPlaidConsentRepository(pool);
  const data = new PostgresPlaidDataRepository(pool);
  const maintenance = new PostgresPlaidTokenMaintenanceRepository(pool);
  const plaid = new PlaidApiClient({ clientId: options.env.plaidClientId, secret: options.env.plaidSecret,
    environment: options.env.plaidEnv, ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  const link = new PlaidLinkTokenClient({ clientId: options.env.plaidClientId, secret: options.env.plaidSecret,
    environment: options.env.plaidEnv, ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  const embeddings = new OpenAiEmbeddingProvider({ apiKey: options.env.openAiApiKey,
    dimensions: SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  const profiles = new PostgresMemoryRepository(pool, undefined, embeddings);
  const sqliteMemory = new SqliteCachedMemoryProvider(profiles);
  const agentMemory = new MemoryOrchestrator(sqliteMemory, { financialProfiles: profiles });
  const agent = createVictoriaAgent({ env: options.env, memory: agentMemory, ...(options.fetcher ? { fetcher: options.fetcher } : {}) });
  const sync = new FinancialProfileSyncService({ consent, data, plaid, cipher, profiles: agentMemory });
  const lifecycle = new PlaidDataLifecycleService({ consent, data, maintenance, plaid, cipher,
    invalidateMemoryCache: (userId) => sqliteMemory.invalidateUserMemoryCache(userId) });
  return Object.freeze({
    pool,
    agent,
    agentMemory,
    sqliteMemory,
    consent,
    data,
    maintenance,
    profiles,
    sync,
    lifecycle,
    consentHandler: createPlaidConsentHandler({
      authenticate: options.authenticate,
      consent,
      getConnectedItemCount: async (userId) => (await data.listItems(userId)).length
    }),
    disconnect: createPlaidDisconnectHandler({ authenticate: options.authenticate, lifecycle }),
    createLinkToken: createPlaidLinkTokenHandler({ authenticate: options.authenticate,
      getConsent: (userId) => consent.getConsent(userId), createLinkToken: (input) => link.create(input) }),
    exchangePublicToken: createPlaidPublicTokenExchangeHandler({ authenticate: options.authenticate,
      consent, plaid, data, cipher, sync }),
    refreshFinancialProfile: createFinancialProfileSyncHandler({ authenticate: options.authenticate, sync })
  });
}
