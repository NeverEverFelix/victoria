import { describe, expect, it } from "vitest";
import { createVictoriaAgent } from "../../../src/app/create-victoria-agent.js";
import { parseVictoriaEnv, type EnvSource } from "../../../src/config/index.js";

describe("createVictoriaAgent", () => {
  it("creates a mock-backed Victoria agent for the current skeleton", async () => {
    const agent = createVictoriaAgent({
      env: parseVictoriaEnv(
        validEnv({
          OPENAI_MODEL: "mock"
        })
      ),
      seedHabits: [
        {
          id: "habit_7th_street",
          merchantName: "7th Street",
          userId: "user_123",
          typicalAmountCents: 2746,
          currency: "USD",
          confidence: 0.9
        }
      ]
    });

    const response = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });

    expect(response.decision.action).toBe("suggest_savings");
    expect(response.message).toContain("$27.46");
  });

  it("uses the provider-backed Financial Moment while keeping ledger approval in the core agent", async () => {
    const agent = createVictoriaAgent({
      env: parseVictoriaEnv(validEnv({ OPENAI_FINANCIAL_MOMENT_ENABLED: "true" })),
      fetcher: async () => new Response(JSON.stringify({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
          type: "avoided_spend", confidence: 0.91, merchantName: null, goalName: null,
          revisionReason: null, summary: "Waited on a jacket", needsClarification: false
        }) }] }]
      }), { status: 200 })
    });

    const proposed = await agent.respond({ userId: "user_123", conversationId: "provider_flow", message: "I almost bought a $90 jacket but waited." });
    expect(proposed.decision.action).toBe("suggest_savings");
    expect(proposed.decision.suggestion?.amountCents).toBe(9000);
    expect(proposed.decision.toolCall?.requiresApproval).toBe(true);
    expect(proposed.message).toContain("No real money has moved");

    const confirmed = await agent.respond({ userId: "user_123", conversationId: "provider_flow", message: "Yes" });
    expect(confirmed.decision.action).toBe("create_ledger_entry");
    expect(confirmed.decision.toolCall?.name).toBe("createSavingsEntry");
  });

  it("routes all three opt-in provider specialists through the core approval gate", async () => {
    const outputs = [
      {
        type: "avoided_spend", confidence: 0.94, merchantName: null, goalName: null,
        revisionReason: null, summary: "Waited on a jacket", needsClarification: false
      },
      {
        outcome: "suggest", confidence: 0.92, amountCents: 9000, source: "user_provided",
        rationale: "Using the exact amount provided.", question: null
      },
      { response: "That was a thoughtful pause. Would you like to record $90 in your Victoria ledger?" }
    ];
    let callCount = 0;
    const requests: Record<string, unknown>[] = [];
    const agent = createVictoriaAgent({
      env: parseVictoriaEnv(validEnv({ OPENAI_AGENT_TEAM_ENABLED: "true" })),
      fetcher: async (_input, init) => {
        requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return jsonResponse({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(outputs[callCount++]) }] }]
        });
      }
    });

    const proposed = await agent.respond({
      userId: "user_123", conversationId: "provider_team_flow", message: "I almost bought a $90 jacket but waited."
    });
    expect(callCount).toBe(3);
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.store === false && request.tools === undefined)).toBe(true);
    expect(requests.every((request) => {
      const text = request.text as { format?: { type?: string; strict?: boolean } } | undefined;
      return text?.format?.type === "json_schema" && text.format.strict === true;
    })).toBe(true);
    expect(proposed.decision.action).toBe("suggest_savings");
    expect(proposed.decision.suggestion?.amountCents).toBe(9000);
    expect(proposed.decision.toolCall?.requiresApproval).toBe(true);
    expect(proposed.message).toContain("No real money has moved");

    const recorded = await agent.respond({ userId: "user_123", conversationId: "provider_team_flow", message: "Yes" });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(recorded.message).toContain("Victoria savings ledger");
    expect(callCount).toBe(3);
  });

  it("rejects an unsupported provider assessment without proposing or recording savings", async () => {
    const outputs = [
      {
        type: "avoided_spend", confidence: 0.94, merchantName: null, goalName: null,
        revisionReason: null, summary: "Waited on a jacket", needsClarification: false
      },
      {
        outcome: "suggest", confidence: 0.92, amountCents: 9500, source: "user_provided",
        rationale: "A possible amount.", question: null
      }
    ];
    let callCount = 0;
    const agent = createVictoriaAgent({
      env: parseVictoriaEnv(validEnv({ OPENAI_AGENT_TEAM_ENABLED: "true" })),
      fetcher: async () => jsonResponse({
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(outputs[callCount++]) }] }]
      })
    });

    const response = await agent.respond({
      userId: "user_123", conversationId: "provider_team_bad_assessment", message: "I almost bought a $90 jacket but waited."
    });
    expect(callCount).toBe(2);
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
  });

  it("asks safely when provider Savings Reasoning is unavailable", async () => {
    let callCount = 0;
    const agent = createVictoriaAgent({
      env: parseVictoriaEnv(validEnv({ OPENAI_AGENT_TEAM_ENABLED: "true" })),
      fetcher: async () => {
        callCount += 1;
        return callCount === 1
          ? jsonResponse({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
              type: "avoided_spend", confidence: 0.94, merchantName: null, goalName: null,
              revisionReason: null, summary: "Waited on a jacket", needsClarification: false
            }) }] }] })
          : new Response("{}", { status: 503 });
      }
    });

    const response = await agent.respond({
      userId: "user_123", conversationId: "provider_reasoning_failure", message: "I almost bought a $90 jacket but waited."
    });
    expect(callCount).toBe(2);
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("make sure I have the amount right");
  });

  it("uses guarded deterministic wording when provider Companion Voice is unavailable", async () => {
    const outputs = [
      {
        type: "avoided_spend", confidence: 0.94, merchantName: null, goalName: null,
        revisionReason: null, summary: "Waited on a jacket", needsClarification: false
      },
      {
        outcome: "suggest", confidence: 0.92, amountCents: 9000, source: "user_provided",
        rationale: "Using the exact amount provided.", question: null
      }
    ];
    let callCount = 0;
    const agent = createVictoriaAgent({
      env: parseVictoriaEnv(validEnv({ OPENAI_AGENT_TEAM_ENABLED: "true" })),
      fetcher: async () => {
        if (callCount === 2) return new Response("{}", { status: 503 });
        return jsonResponse({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(outputs[callCount++]) }] }]
        });
      }
    });

    const proposed = await agent.respond({
      userId: "user_123", conversationId: "provider_voice_failure", message: "I almost bought a $90 jacket but waited."
    });
    expect(callCount).toBe(2);
    expect(proposed.decision.action).toBe("suggest_savings");
    expect(proposed.decision.toolCall?.requiresApproval).toBe(true);
    expect(proposed.message).toContain("Would you like me to record $90.00");
    expect(proposed.message).toContain("Please confirm");
    expect(proposed.message).toContain("No real money has moved");

    const recorded = await agent.respond({ userId: "user_123", conversationId: "provider_voice_failure", message: "Yes" });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(callCount).toBe(2);
  });

  it("keeps transfer requests on the deterministic refusal path without calling other specialists", async () => {
    let callCount = 0;
    const agent = createVictoriaAgent({
      env: parseVictoriaEnv(validEnv({ OPENAI_AGENT_TEAM_ENABLED: "true" })),
      fetcher: async () => {
        callCount += 1;
        return jsonResponse({
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({
            type: "real_money_movement_request", confidence: 0.98, merchantName: null, goalName: null,
            revisionReason: null, summary: "Asked to transfer funds", needsClarification: false
          }) }] }]
        });
      }
    });

    const response = await agent.respond({ userId: "user_123", message: "Move $25 to savings now." });
    expect(callCount).toBe(1);
    expect(response.decision.action).toBe("refuse");
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("can't move real money");
    expect(response.message).toContain("No transfer has been made");
    expect(response.message).not.toContain("I transferred");
  });

  it("falls back to clarification when the provider Financial Moment fails", async () => {
    const agent = createVictoriaAgent({
      env: parseVictoriaEnv(validEnv({ OPENAI_FINANCIAL_MOMENT_ENABLED: "true" })),
      fetcher: async () => new Response("{}", { status: 503 })
    });
    const response = await agent.respond({
      userId: "user_123", conversationId: "provider_failure", message: "I almost bought a $90 jacket but waited."
    });
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.classification.type).toBe("unclear");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
  });

  it("uses the mock specialist team for a proposal while leaving confirmation to the core agent", async () => {
    const agent = createVictoriaAgent({ env: parseVictoriaEnv(validEnv({ OPENAI_MODEL: "mock" })) });
    const proposed = await agent.respond({
      userId: "user_123",
      conversationId: "team_product_flow",
      message: "I almost bought a $90 jacket but decided to wait."
    });

    expect(proposed.decision.action).toBe("suggest_savings");
    expect(proposed.decision.suggestion?.amountCents).toBe(9000);
    expect(proposed.decision.toolCall?.requiresApproval).toBe(true);
    expect(proposed.message).toContain("Would you like me to record");
    expect(proposed.message).toContain("Please confirm");
    expect(proposed.message).toContain("No real money has moved");

    const recorded = await agent.respond({
      userId: "user_123",
      conversationId: "team_product_flow",
      message: "Yes"
    });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(recorded.message).toContain("Victoria savings ledger");
    expect(recorded.message).toContain("No real money has moved");
  });

  it("fails clearly when real money movement is requested before it exists", () => {
    const productionMockEnv = parseVictoriaEnv(
      validEnv({
        APP_ENV: "production",
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_prod",
        OPENAI_API_KEY: "production-openai-key",
        OPENAI_MODEL: "mock",
        PLAID_CLIENT_ID: "production-plaid-client-id",
        PLAID_SECRET: "production-plaid-secret",
        PLAID_ENV: "production",
        MONEY_MOVEMENT_MODE: "mock_ledger",
        AUTH_SECRET: "production-auth-secret-at-least-32-characters"
      })
    );

    expect(() =>
      createVictoriaAgent({
        env: {
          ...productionMockEnv,
          moneyMovementMode: "real_transfer",
          usesRealMoneyMovement: true
        }
      })
    ).toThrow("Real money movement is not wired yet. Set MONEY_MOVEMENT_MODE=mock_ledger.");
  });
});

function validEnv(overrides: EnvSource = {}): EnvSource {
  return {
    APP_ENV: "local",
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://victoria:password@localhost:5432/victoria_local",
    OPENAI_API_KEY: "test-openai-key",
    OPENAI_MODEL: "gpt-4.1-mini",
    PLAID_CLIENT_ID: "test-plaid-client-id",
    PLAID_SECRET: "test-plaid-secret",
    PLAID_ENV: "sandbox",
    MONEY_MOVEMENT_MODE: "mock_ledger",
    AUTH_SECRET: "test-auth-secret",
    ...overrides
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
