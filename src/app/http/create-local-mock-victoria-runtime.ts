import { MockLlmAdapter } from "../../agent/llm/mock-llm.js";
import { MockMemoryProvider } from "../../agent/memory/mock-memory.js";
import { MockVictoriaTools } from "../../agent/tools/mock-tools.js";
import { VictoriaAgent } from "../../agent/victoria-agent.js";
import { OpenAiConversationalMemoryExtractor } from "../../agent/memory/openai-conversational-memory-extractor.js";
import { OpenAiEpisodicMemorySummarizer } from "../../agent/memory/openai-episodic-memory-summarizer.js";
import { MockProfileTransactionHistoryProvider } from "../financial-profile/mock-profile-transaction-history-provider.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";
import { createVictoriaSessionAuthenticator } from "./signed-session-auth.js";
import { createVictoriaChatHandler } from "./victoria-chat-handler.js";

export interface LocalMockVictoriaRuntime {
  readonly handler: ReturnType<typeof createVictoriaChatHandler>;
  /** Adapter for a mock or injected sync service to publish its refreshed profile to chat. */
  readonly financialProfileWriter: {
    rememberFinancialProfile(profile: TransactionFinancialProfile): Promise<readonly unknown[]>;
  };
}

let cachedRuntime: { readonly cacheKey: string; readonly runtime: LocalMockVictoriaRuntime } | undefined;

/** Creates a local chat runtime with mock model/tools by default; all other environments fail closed. */
export function getLocalMockVictoriaRuntime(env: Record<string, string | undefined> = process.env): LocalMockVictoriaRuntime | null {
  if (env.APP_ENV !== "local" || env.NODE_ENV !== "development") return null;
  const secret = env.AUTH_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || /(?:replace|example|placeholder|changeme)/i.test(secret)) return null;
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const memoryExtractorEnabled = env.OPENAI_MEMORY_EXTRACTION_ENABLED === "true" &&
    Boolean(openAiKey) && !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "") &&
    Boolean(env.OPENAI_MODEL?.trim()) && env.OPENAI_MODEL !== "mock";
  const cacheKey = [secret, memoryExtractorEnabled ? openAiKey : "mock", env.OPENAI_MODEL ?? "mock"].join("\u0000");
  if (cachedRuntime?.cacheKey === cacheKey) return cachedRuntime.runtime;
  const transactionHistory = new MockProfileTransactionHistoryProvider();
  const agent = new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: new MockMemoryProvider(),
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
  const runtime = Object.freeze({
    handler,
    financialProfileWriter: Object.freeze({
      rememberFinancialProfile: async (profile: TransactionFinancialProfile) => {
        transactionHistory.setProfile(profile);
        return Object.freeze([]);
      }
    })
  });
  cachedRuntime = Object.freeze({ cacheKey, runtime });
  return runtime;
}

export function getLocalMockVictoriaChatHandler(env: Record<string, string | undefined> = process.env) {
  return getLocalMockVictoriaRuntime(env)?.handler ?? null;
}
