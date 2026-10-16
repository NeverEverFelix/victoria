import { MockLlmAdapter } from "../../agent/llm/mock-llm.js";
import { MockMemoryProvider } from "../../agent/memory/mock-memory.js";
import { MemoryOrchestrator } from "../../agent/memory/memory-orchestrator.js";
import { MockVictoriaTools } from "../../agent/tools/mock-tools.js";
import { VictoriaAgent } from "../../agent/victoria-agent.js";
import { OpenAiConversationalMemoryExtractor } from "../../agent/memory/openai-conversational-memory-extractor.js";
import { OpenAiEpisodicMemorySummarizer } from "../../agent/memory/openai-episodic-memory-summarizer.js";
import { MockProfileTransactionHistoryProvider } from "../financial-profile/mock-profile-transaction-history-provider.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";
import { createVictoriaSessionAuthenticator } from "./signed-session-auth.js";
import { createVictoriaChatHandler } from "./victoria-chat-handler.js";
import { createMemoryControlHandler, createMemoryControlsCollectionHandler, createMemorySettingsHandler } from "./memory-controls-handler.js";
import { createHash } from "node:crypto";

export interface LocalMockVictoriaRuntime {
  readonly handler: ReturnType<typeof createVictoriaChatHandler>;
  readonly memoryControlsCollectionHandler: ReturnType<typeof createMemoryControlsCollectionHandler>;
  readonly memoryControlHandler: ReturnType<typeof createMemoryControlHandler>;
  readonly memorySettingsHandler: ReturnType<typeof createMemorySettingsHandler>;
  /** Adapter for a mock or injected sync service to publish its refreshed profile to chat. */
  readonly financialProfileWriter: {
    rememberFinancialProfile(profile: TransactionFinancialProfile): Promise<readonly unknown[]>;
  };
}

interface CachedLocalRuntime {
  readonly cacheKey: string;
  readonly runtime: LocalMockVictoriaRuntime;
}

const GLOBAL_RUNTIME_SLOT = "__victoriaLocalMockRuntimeCache" as const;
type RuntimeGlobal = typeof globalThis & { [GLOBAL_RUNTIME_SLOT]?: CachedLocalRuntime };

/** Creates a local chat runtime with mock model/tools by default; all other environments fail closed. */
export function getLocalMockVictoriaRuntime(env: Record<string, string | undefined> = process.env): LocalMockVictoriaRuntime | null {
  if (env.APP_ENV !== "local" || env.NODE_ENV !== "development") return null;
  const secret = env.AUTH_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || /(?:replace|example|placeholder|changeme)/i.test(secret)) return null;
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const memoryExtractorEnabled = env.OPENAI_MEMORY_EXTRACTION_ENABLED === "true" &&
    Boolean(openAiKey) && !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "") &&
    Boolean(env.OPENAI_MODEL?.trim()) && env.OPENAI_MODEL !== "mock";
  const cacheKey = createHash("sha256")
    .update(secret).update("\0").update(memoryExtractorEnabled ? openAiKey! : "mock")
    .update("\0").update(env.OPENAI_MODEL ?? "mock").digest("hex");
  const runtimeGlobal = globalThis as RuntimeGlobal;
  const cachedRuntime = runtimeGlobal[GLOBAL_RUNTIME_SLOT];
  if (cachedRuntime?.cacheKey === cacheKey) return cachedRuntime.runtime;
  const transactionHistory = new MockProfileTransactionHistoryProvider();
  const memory = new MemoryOrchestrator(new MockMemoryProvider());
  const agent = new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory,
    tools: new MockVictoriaTools(),
    transactionHistory,
    ...(memoryExtractorEnabled ? {
      conversationalMemoryExtractor: new OpenAiConversationalMemoryExtractor({
        apiKey: openAiKey!, model: env.OPENAI_MODEL!
      }),
      episodicMemorySummarizer: new OpenAiEpisodicMemorySummarizer({
        apiKey: openAiKey!, model: env.OPENAI_MODEL!
      })
    } : {})
  });
  const handler = createVictoriaChatHandler({
    authenticate: createVictoriaSessionAuthenticator(secret),
    agent
  });
  const memoryControls = {
    authenticate: createVictoriaSessionAuthenticator(secret),
    memory
  };
  const runtime = Object.freeze({
    handler,
    memoryControlsCollectionHandler: createMemoryControlsCollectionHandler(memoryControls),
    memoryControlHandler: createMemoryControlHandler(memoryControls),
    memorySettingsHandler: createMemorySettingsHandler(memoryControls),
    financialProfileWriter: Object.freeze({
      rememberFinancialProfile: async (profile: TransactionFinancialProfile) => {
        transactionHistory.setProfile(profile);
        return Object.freeze([]);
      }
    })
  });
  runtimeGlobal[GLOBAL_RUNTIME_SLOT] = Object.freeze({ cacheKey, runtime });
  return runtime;
}

export function getLocalMockVictoriaChatHandler(env: Record<string, string | undefined> = process.env) {
  return getLocalMockVictoriaRuntime(env)?.handler ?? null;
}
