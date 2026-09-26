import { describe, expect, it } from "vitest";
import { parseVictoriaEnv, type EnvSource } from "../../../src/config/env.js";

describe("parseVictoriaEnv", () => {
  it("parses a valid local environment", () => {
    const env = parseVictoriaEnv(validEnv());

    expect(env.appEnv).toBe("local");
    expect(env.nodeEnv).toBe("development");
    expect(env.moneyMovementMode).toBe("mock_ledger");
    expect(env.isProduction).toBe(false);
    expect(env.isTest).toBe(false);
    expect(env.usesRealMoneyMovement).toBe(false);
  });

  it("marks test mode when APP_ENV is test", () => {
    const env = parseVictoriaEnv(
      validEnv({
        APP_ENV: "test",
        NODE_ENV: "test",
        OPENAI_MODEL: "mock"
      })
    );

    expect(env.isTest).toBe(true);
    expect(env.openAiModel).toBe("mock");
  });

  it("blocks real money movement outside production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "staging",
          NODE_ENV: "production",
          MONEY_MOVEMENT_MODE: "real_transfer"
        })
      )
    ).toThrow("Real money movement is only allowed in production.");
  });

  it("blocks production Plaid settings outside production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "staging",
          NODE_ENV: "production",
          PLAID_ENV: "production"
        })
      )
    ).toThrow("Production Plaid credentials are only allowed in production.");
  });

  it("allows real money movement in production configuration", () => {
    const env = parseVictoriaEnv(
      validEnv({
        APP_ENV: "production",
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://victoria:password@prod-db.example.com:5432/victoria_prod",
        PLAID_ENV: "production",
        MONEY_MOVEMENT_MODE: "real_transfer",
        AUTH_SECRET: "production-auth-secret-at-least-32-characters"
      })
    );

    expect(env.isProduction).toBe(true);
    expect(env.usesRealMoneyMovement).toBe(true);
  });

  it("requires production Plaid for real money movement", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@prod-db.example.com:5432/victoria_prod",
          PLAID_ENV: "sandbox",
          MONEY_MOVEMENT_MODE: "real_transfer",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("Real money movement requires PLAID_ENV=production.");
  });

  it("blocks production app mode with test node mode", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "test",
          DATABASE_URL: "postgresql://victoria:password@prod-db.example.com:5432/victoria_prod",
          PLAID_ENV: "production",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("APP_ENV=production requires NODE_ENV=production.");
  });

  it("blocks test app mode without test node mode", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "test",
          NODE_ENV: "development",
          OPENAI_MODEL: "mock"
        })
      )
    ).toThrow("APP_ENV=test requires NODE_ENV=test.");
  });

  it("blocks local app mode without development node mode", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "local",
          NODE_ENV: "production"
        })
      )
    ).toThrow("APP_ENV=local requires NODE_ENV=development.");
  });

  it("blocks local database URLs in production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@localhost:5432/victoria_prod",
          PLAID_ENV: "production",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("Production DATABASE_URL must not point to localhost.");
  });

  it("blocks test database names in production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@prod-db.example.com:5432/victoria_test",
          PLAID_ENV: "production",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("Production DATABASE_URL must not use a local or test database name.");
  });

  it("requires DATABASE_URL", () => {
    const source = validEnv();
    delete source.DATABASE_URL;

    expect(() => parseVictoriaEnv(source)).toThrow("DATABASE_URL is required.");
  });

  it("rejects whitespace-only required values", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          AUTH_SECRET: "   "
        })
      )
    ).toThrow("AUTH_SECRET is required.");
  });

  it("requires a stronger auth secret in production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@prod-db.example.com:5432/victoria_prod",
          PLAID_ENV: "production",
          AUTH_SECRET: "test-auth-secret"
        })
      )
    ).toThrow("Production AUTH_SECRET must be at least 32 characters.");
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
