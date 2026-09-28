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

  it("fails clearly when a real AI adapter is requested before it exists", () => {
    expect(() =>
      createVictoriaAgent({
        env: parseVictoriaEnv(validEnv())
      })
    ).toThrow("Real AI adapter is not wired yet. Set OPENAI_MODEL=mock for this skeleton.");
  });

  it("fails clearly when real money movement is requested before it exists", () => {
    expect(() =>
      createVictoriaAgent({
        env: parseVictoriaEnv(
          validEnv({
            APP_ENV: "production",
            NODE_ENV: "production",
            DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_prod",
            OPENAI_API_KEY: "production-openai-key",
            OPENAI_MODEL: "mock",
            PLAID_CLIENT_ID: "production-plaid-client-id",
            PLAID_SECRET: "production-plaid-secret",
            PLAID_ENV: "production",
            MONEY_MOVEMENT_MODE: "real_transfer",
            AUTH_SECRET: "production-auth-secret-at-least-32-characters"
          })
        )
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
