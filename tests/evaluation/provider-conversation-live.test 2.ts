import { describe, expect, it } from "vitest";
import nextEnv from "@next/env";
import { OpenAiConversationResponder, validateConversationReply } from "../../src/agent/conversation-responder.js";
import { OpenAiConversationalMemoryExtractor } from "../../src/agent/memory/openai-conversational-memory-extractor.js";

const runLive = process.env.RUN_PROVIDER_CONVERSATION_SMOKE === "1";
describe.skipIf(!runLive)("live read-only conversation response", () => {
  it("answers a practical question without claiming a financial action", async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    nextEnv.loadEnvConfig(process.cwd(), true, undefined, true);
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
    const key = process.env.OPENAI_API_KEY?.trim() ?? "";
    const model = process.env.OPENAI_MODEL?.trim() ?? "";
    if (!key || /(?:local-openai|replace|example|placeholder|changeme)/i.test(key) || !model || model === "mock") {
      throw new Error("A real provider key and model are required for the live conversation smoke test.");
    }
    const input = {
      message: "I usually go to the gym after work, but I'm tired tonight and struggling to cook. Any ideas?",
      recentTurns: ["I am trying to make my evenings easier."],
      memories: [],
      baselineReply: "What would help tonight?"
    };
    const reply = await new OpenAiConversationResponder({ apiKey: key, model }).respond(input);
    expect(validateConversationReply(reply, input)).not.toBeNull();
    expect(reply).toMatch(/(?:food|meal|cook|dinner|rest|tired|easy)/i);
    expect(reply).not.toMatch(/ledger|record.*saving/i);
  }, 30_000);

  it("extracts a stable routine from a natural financial conversation", async () => {
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    nextEnv.loadEnvConfig(process.cwd(), true, undefined, true);
    if (priorNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = priorNodeEnv;
    const key = process.env.OPENAI_API_KEY?.trim() ?? "";
    const model = process.env.OPENAI_MODEL?.trim() ?? "";
    if (!key || !model || model === "mock") throw new Error("A provider is required for the live smoke test.");
    const extractor = new OpenAiConversationalMemoryExtractor({ apiKey: key, model });
    const candidates = await extractor.extract({ userMessage:
      "I usually go to this gym to play basketball and it costs me $35 a month. I just got a promotion and my company now pays." });
    expect(candidates.some((candidate) => /basketball|gym/i.test(candidate.value))).toBe(true);
  }, 30_000);
});
