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
