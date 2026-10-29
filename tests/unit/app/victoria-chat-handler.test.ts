import { describe, expect, it, vi } from "vitest";
import { createVictoriaSessionAuthenticator, signVictoriaSession } from "../../../src/app/http/signed-session-auth.js";
import { createVictoriaChatHandler } from "../../../src/app/http/victoria-chat-handler.js";
import { getLocalMockVictoriaChatHandler, getLocalMockVictoriaRuntime } from "../../../src/app/http/create-local-mock-victoria-runtime.js";
import { buildTransactionFinancialProfile } from "../../../src/domain/financial-profile.js";
import { InMemoryTurnRepository } from "../../../src/app/turns/in-memory-turn-repository.js";

const secret = "test-only-session-secret-with-more-than-32-bytes";

describe("Victoria chat HTTP boundary", () => {
  it("rejects user-supplied identity fields in the request body", async () => {
    const agent = { respond: vi.fn(async (request: { userId: string; conversationId?: string; message: string }) => ({
      message: `Reply to ${request.userId}: ${request.message}`,
      decision: { action: "reflect", classification: { type: "general_finance", summary: request.message } }
    })) } as unknown as Parameters<typeof createVictoriaChatHandler>[0]["agent"];
    const handler = createVictoriaChatHandler({ authenticate: createVictoriaSessionAuthenticator(secret), agent });
    const token = signVictoriaSession({ userId: "user-from-session", secret });

    const response = await handler(new Request("https://victoria.local/api/victoria/chat-1", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello Victoria", userId: "attacker" })
    }), { conversationId: "chat-1" });

    expect(response.status).toBe(400);
    expect(agent.respond).not.toHaveBeenCalled();
  });

  it("passes authenticated identity and route conversation ID to the agent", async () => {
    const agent = { respond: vi.fn(async (request: { userId: string; conversationId?: string; message: string }) => ({
      message: `${request.userId}:${request.conversationId}:${request.message}`,
      decision: { action: "reflect", classification: { type: "general_finance", summary: request.message } }
    })) } as unknown as Parameters<typeof createVictoriaChatHandler>[0]["agent"];
    const handler = createVictoriaChatHandler({ authenticate: createVictoriaSessionAuthenticator(secret), agent });
    const token = signVictoriaSession({ userId: "user-a", secret });

    const response = await handler(new Request("https://victoria.local/api/victoria/chat-1", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello Victoria" })
    }), { conversationId: "chat-1" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ message: "user-a:chat-1:Hello Victoria" });
    expect(agent.respond).toHaveBeenCalledWith({ userId: "user-a", conversationId: "chat-1", message: "Hello Victoria" });
  });

  it("passes stable owner-scoped turn references from completed chat turns", async () => {
    const seen: unknown[] = [];
    const agent = { respond: vi.fn(async (request: { sourceTurnReferences?: unknown }) => {
      seen.push(request.sourceTurnReferences);
      return { message: "Got it.", decision: { action: "reflect", classification: { type: "general_finance", summary: "" } } };
    }) } as unknown as Parameters<typeof createVictoriaChatHandler>[0]["agent"];
    const turns = new InMemoryTurnRepository();
    const handler = createVictoriaChatHandler({ authenticate: createVictoriaSessionAuthenticator(secret), agent, turns });
    const token = signVictoriaSession({ userId: "turn-user", secret });
    await handler(chatRequest(token, "turn-chat", "I want to plan my weekends."), { conversationId: "turn-chat" });
    await handler(chatRequest(token, "turn-chat", "I enjoy hiking."), { conversationId: "turn-chat" });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject([{ turnId: expect.any(String), userMessage: "I want to plan my weekends." }]);
    expect(seen[1]).toHaveLength(2);
    expect((await turns.listConversation("turn-user", "turn-chat"))).toHaveLength(2);
    expect((await turns.listConversation("another-user", "turn-chat"))).toEqual([]);
  });

  it("rejects unsigned, expired, and tampered sessions", async () => {
    const now = Date.UTC(2026, 9, 14);
    const authenticate = createVictoriaSessionAuthenticator(secret, () => now);
    const expired = signVictoriaSession({ userId: "user-a", secret, now: now - 120_000, lifetimeSeconds: 60 });
    const valid = signVictoriaSession({ userId: "user-a", secret, now });
    const [payload, signature] = valid.split(".");
    const tampered = `${payload?.slice(0, -1)}a.${signature}`;

    await expect(authenticate(new Request("https://victoria.local"))).resolves.toBeNull();
    await expect(authenticate(bearer(expired))).resolves.toBeNull();
    await expect(authenticate(bearer(tampered))).resolves.toBeNull();
  });

  it("fails closed outside local development and when no strong local secret is configured", () => {
    expect(getLocalMockVictoriaChatHandler({ APP_ENV: "production", NODE_ENV: "production", AUTH_SECRET: secret })).toBeNull();
    expect(getLocalMockVictoriaChatHandler({ APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: "short" })).toBeNull();
  });

  it("uses an available local database without a memory switch and rejects invalid database configuration", () => {
    expect(getLocalMockVictoriaRuntime({
      APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: `${secret}-no-database`
    })).not.toBeNull();
    expect(getLocalMockVictoriaRuntime({
      APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: `${secret}-persistent-invalid`,
      DATABASE_URL: "not-a-database-url", OPENAI_API_KEY: "local-openai-key", OPENAI_MODEL: "mock",
      PLAID_ENV: "sandbox", MONEY_MOVEMENT_MODE: "mock_ledger"
    })).toBeNull();
  });

  it("uses the configured provider for conversation without a separate switch", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
        text: "Start with one easy evening routine you can repeat."
      }) }] }]
    })));
    vi.stubGlobal("fetch", fetcher);
    try {
      const base = {
        APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: `${secret}-response-mode`,
        OPENAI_API_KEY: "sk-test-provider-key", OPENAI_MODEL: "gpt-5-mini",
        OPENAI_MEMORY_EXTRACTION_ENABLED: "false", OPENAI_PERSONALIZED_REPLIES_ENABLED: "false",
        OPENAI_EPISODIC_SUMMARIES_ENABLED: "false"
      };
      const provider = getLocalMockVictoriaRuntime(base);
      expect(provider).not.toBeNull();
      const token = signVictoriaSession({ userId: "response-mode-user", secret: base.AUTH_SECRET });
      const response = await provider!.handler(chatRequest(token, "response-mode-chat", "What can I do with my evenings?"),
        { conversationId: "response-mode-chat" });
      expect(response.status).toBe(200);
      expect((await response.json()).message).toContain("easy evening routine");
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("enables episode summaries by default with a real provider and honors the explicit opt-out", async () => {
    const episodeRequests: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body)) as { text?: { format?: { name?: string } } };
      const format = requestBody.text?.format?.name;
      episodeRequests.push(format ?? "unknown");
      const result = format === "episodic_memory_summary_v1"
        ? {
            summary: "The user enjoys hiking and wants to spend more time outdoors on weekends.",
            evidenceQuotes: ["I love hiking."], confidence: 0.94, sensitivity: "ordinary"
          }
        : { candidates: [] };
      return new Response(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(result) }] }]
      }));
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const baseEnv = {
        APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: `${secret}-episode-default`,
        OPENAI_API_KEY: "sk-test-provider-key", OPENAI_MODEL: "gpt-5-mini",
        OPENAI_MEMORY_EXTRACTION_ENABLED: "false", OPENAI_PERSONALIZED_REPLIES_ENABLED: "false"
      };
      const runtime = getLocalMockVictoriaRuntime(baseEnv);
      expect(runtime).not.toBeNull();
      const token = signVictoriaSession({ userId: "episode-default-user", secret: baseEnv.AUTH_SECRET });
      for (const message of ["I love hiking.", "I want to spend more time outdoors on weekends."]) {
        const response = await runtime!.handler(chatRequest(token, "episode-default", message), { conversationId: "episode-default" });
        expect(response.status).toBe(200);
      }
      const finished = await runtime!.finishHandler(finishRequest(token), "episode-default");
      expect(await finished.json()).toEqual({ saved: true });
      expect(episodeRequests.filter((name) => name === "episodic_memory_summary_v1")).toEqual(["episodic_memory_summary_v1"]);

      episodeRequests.length = 0;
      const disabledEnv = {
        ...baseEnv, AUTH_SECRET: `${secret}-episode-optout`, OPENAI_EPISODIC_SUMMARIES_ENABLED: "false"
      };
      const disabledRuntime = getLocalMockVictoriaRuntime(disabledEnv);
      expect(disabledRuntime).not.toBeNull();
      const disabledToken = signVictoriaSession({ userId: "episode-optout-user", secret: disabledEnv.AUTH_SECRET });
      for (const message of ["I love hiking.", "I want to spend more time outdoors on weekends."]) {
        await disabledRuntime!.handler(chatRequest(disabledToken, "episode-optout", message), { conversationId: "episode-optout" });
      }
      const notSaved = await disabledRuntime!.finishHandler(finishRequest(disabledToken), "episode-optout");
      expect(await notSaved.json()).toEqual({ saved: false });
      expect(episodeRequests).not.toContain("episodic_memory_summary_v1");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("feeds a refreshed user-scoped financial profile into the running local chat route", async () => {
    const userId = "local-profile-user";
    const localRuntime = getLocalMockVictoriaRuntime({
      APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: `${secret}-profile-refresh`
    });
    expect(localRuntime).not.toBeNull();
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const profile = buildTransactionFinancialProfile({
      userId,
      now,
      transactions: [600, 800, 1_000].map((amountCents, index) => ({
        transactionId: `local-txn-${index}`, amountCents, isoCurrencyCode: "USD",
        date, merchantName: "Blue Bottle", category: "Coffee", pending: false
      }))
    });
    await localRuntime!.financialProfileWriter.rememberFinancialProfile(profile);
    const token = signVictoriaSession({ userId, secret: `${secret}-profile-refresh` });

    const response = await localRuntime!.handler(new Request("https://victoria.local/api/victoria/chat-1", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "I made coffee at home instead of going to Blue Bottle." })
    }), { conversationId: "chat-1" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      message: expect.stringContaining("$8.00"),
      decision: { action: "suggest_savings" }
    });

    const otherUserToken = signVictoriaSession({ userId: "different-user", secret: `${secret}-profile-refresh` });
    const otherUserResponse = await localRuntime!.handler(new Request("https://victoria.local/api/victoria/chat-2", {
      method: "POST",
      headers: { authorization: `Bearer ${otherUserToken}`, "content-type": "application/json" },
      body: JSON.stringify({ message: "I made coffee at home instead of going to Blue Bottle." })
    }), { conversationId: "chat-2" });
    expect(await otherUserResponse.json()).toMatchObject({ decision: { action: "ask_follow_up" } });
  });

  it("carries a remembered preference across authenticated chat conversations without crossing users", async () => {
    const authSecret = `${secret}-memory-continuity`;
    const localRuntime = getLocalMockVictoriaRuntime({
      APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: authSecret
    });
    expect(localRuntime).not.toBeNull();
    const userToken = signVictoriaSession({ userId: "continuity-user", secret: authSecret });

    const learnedResponse = await localRuntime!.handler(chatRequest(
      userToken, "share-preference", "I prefer saving $20 rather than $50 at a time."
    ), { conversationId: "share-preference" });
    expect(learnedResponse.status).toBe(200);

    const laterResponse = await localRuntime!.handler(chatRequest(
      userToken, "later-reflection", "I'm trying to make saving feel manageable and consistent."
    ), { conversationId: "later-reflection" });
    expect(laterResponse.status).toBe(200);
    expect(await laterResponse.json()).toMatchObject({
      message: expect.stringContaining("preference for saving $20 rather than $50 at a time"),
      decision: { action: "reflect" }
    });

    const otherUserToken = signVictoriaSession({ userId: "unrelated-user", secret: authSecret });
    const otherUserResponse = await localRuntime!.handler(chatRequest(
      otherUserToken, "unrelated-reflection", "I'm trying to make saving feel manageable and consistent."
    ), { conversationId: "unrelated-reflection" });
    const otherUserBody = await otherUserResponse.json() as { message: string };
    expect(otherUserResponse.status).toBe(200);
    expect(otherUserBody.message).not.toContain("$20");
    expect(otherUserBody.message).not.toContain("$50");
  });

  it("keeps pending savings approval scoped to its conversation and supports a return visit", async () => {
    const authSecret = `${secret}-pending-return`;
    const localRuntime = getLocalMockVictoriaRuntime({
      APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: authSecret
    });
    expect(localRuntime).not.toBeNull();
    const token = signVictoriaSession({ userId: "returning-user", secret: authSecret });

    const proposalResponse = await localRuntime!.handler(chatRequest(
      token, "book-decision", "I almost bought a $9 book but decided to wait."
    ), { conversationId: "book-decision" });
    const proposal = await proposalResponse.json() as { decision: { action: string } };
    expect(proposal.decision.action).toBe("suggest_savings");

    const unrelatedApprovalResponse = await localRuntime!.handler(chatRequest(
      token, "another-conversation", "Yes"
    ), { conversationId: "another-conversation" });
    const unrelatedApproval = await unrelatedApprovalResponse.json() as { decision: { action: string }; message: string };
    expect(unrelatedApproval.decision.action).not.toBe("create_ledger_entry");
    expect(unrelatedApproval.message).not.toContain("recorded in your Victoria savings ledger");

    const returnResponse = await localRuntime!.handler(chatRequest(
      token, "book-decision", "Yes"
    ), { conversationId: "book-decision" });
    const returned = await returnResponse.json() as { decision: { action: string }; message: string };
    expect(returned.decision.action).toBe("create_ledger_entry");
    expect(returned.message).toContain("recorded $9.00 in your Victoria savings ledger");
    expect(returned.message).toContain("No real money has moved");

    const progressResponse = await localRuntime!.handler(chatRequest(
      token, "return-visit", "How much have I saved this week?"
    ), { conversationId: "return-visit" });
    expect(await progressResponse.json()).toMatchObject({
      message: expect.stringContaining("$9.00"), decision: { action: "summarize_progress" }
    });
  });

  it("handles a financial correction on the route without rewriting an estimate or recording money", async () => {
    const authSecret = `${secret}-correction-return`;
    const localRuntime = getLocalMockVictoriaRuntime({
      APP_ENV: "local", NODE_ENV: "development", AUTH_SECRET: authSecret
    });
    expect(localRuntime).not.toBeNull();
    const token = signVictoriaSession({ userId: "correction-user", secret: authSecret });

    const learnedResponse = await localRuntime!.handler(chatRequest(
      token, "spend-context", "I usually spend $6 at Blue Bottle."
    ), { conversationId: "spend-context" });
    expect(learnedResponse.status).toBe(200);

    const correctionResponse = await localRuntime!.handler(chatRequest(
      token, "spend-context", "No, that's not right. I actually spent $40 that day."
    ), { conversationId: "spend-context" });
    const correction = await correctionResponse.json() as { message: string; decision: { action: string } };
    expect(correction.decision.action).toBe("reflect");
    expect(correction.message).toContain("spent $40.00 on that day");
    expect(correction.message).toContain("I haven't changed or recorded any money");

    const futureEstimateResponse = await localRuntime!.handler(chatRequest(
      token, "later-coffee", "I made coffee at home instead of going to Blue Bottle."
    ), { conversationId: "later-coffee" });
    expect(await futureEstimateResponse.json()).toMatchObject({
      message: expect.stringContaining("$6.00"), decision: { action: "suggest_savings" }
    });
  });

  it("rejects unauthenticated and malformed requests before invoking the agent", async () => {
    const agent = { respond: vi.fn() } as unknown as Parameters<typeof createVictoriaChatHandler>[0]["agent"];
    const handler = createVictoriaChatHandler({ authenticate: async () => null, agent });
    const unauthenticated = await handler(new Request("https://victoria.local/api/victoria/chat-1", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hello" })
    }), { conversationId: "chat-1" });
    const invalidId = await handler(new Request("https://victoria.local/api/victoria/chat-1", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hello" })
    }), { conversationId: "../other-user" });

    expect(unauthenticated.status).toBe(401);
    expect(invalidId.status).toBe(400);
    expect(agent.respond).not.toHaveBeenCalled();
  });
});

function bearer(token: string): Request {
  return new Request("https://victoria.local", { headers: { authorization: `Bearer ${token}` } });
}

function chatRequest(token: string, conversationId: string, message: string): Request {
  return new Request(`https://victoria.local/api/victoria/${conversationId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ message })
  });
}

function finishRequest(token: string): Request {
  return new Request("https://victoria.local/api/victoria/conversation/finish", {
    method: "POST", headers: { authorization: `Bearer ${token}` }
  });
}
