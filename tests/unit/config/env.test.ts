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
        DATABASE_URL: "postgresql://victoria:password@localhost:5432/victoria_test",
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
          DATABASE_URL: "postgresql://victoria:password@staging-db.example.com:5432/victoria_staging",
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
          DATABASE_URL: "postgresql://victoria:password@staging-db.example.com:5432/victoria_staging",
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
        DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_prod",
        OPENAI_API_KEY: "production-openai-key",
        PLAID_CLIENT_ID: "production-plaid-client-id",
        PLAID_SECRET: "production-plaid-secret",
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
          DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_prod",
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
          DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_prod",
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

  it("blocks staging app mode without production node mode", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "staging",
          NODE_ENV: "development",
          DATABASE_URL: "postgresql://victoria:password@staging-db.example.com:5432/victoria_staging"
        })
      )
    ).toThrow("APP_ENV=staging requires NODE_ENV=production.");
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

  it("blocks wildcard local database hosts in production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@0.0.0.0:5432/victoria_prod",
          PLAID_ENV: "production",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("Production DATABASE_URL must not point to localhost.");
  });

  it("requires a Postgres database URL", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          DATABASE_URL: "mysql://victoria:password@localhost:3306/victoria_local"
        })
      )
    ).toThrow("DATABASE_URL must use the postgresql:// or postgres:// protocol.");
  });

  it("rejects malformed database URLs", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          DATABASE_URL: "victoria_local"
        })
      )
    ).toThrow("DATABASE_URL must be a valid URL.");
  });

  it("blocks test database names in production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_test",
          PLAID_ENV: "production",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("production DATABASE_URL must not use the test database name.");
  });

  it("rejects placeholder database URLs in production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@prod-db.example.com:5432/victoria_prod",
          PLAID_ENV: "production",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("Production DATABASE_URL must not use example hosts or placeholder passwords.");
  });

  it("blocks production database names outside production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "staging",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@staging-db.example.com:5432/victoria_prod"
        })
      )
    ).toThrow("staging DATABASE_URL must not use the production database name.");
  });

  it("blocks local database names in test", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "test",
          NODE_ENV: "test",
          DATABASE_URL: "postgresql://victoria:password@localhost:5432/victoria_local",
          OPENAI_MODEL: "mock"
        })
      )
    ).toThrow("test DATABASE_URL must not use the local database name.");
  });

  it("blocks staging database names in local", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "local",
          NODE_ENV: "development",
          DATABASE_URL: "postgresql://victoria:password@localhost:5432/victoria_staging"
        })
      )
    ).toThrow("local DATABASE_URL must not use the staging database name.");
  });

  it("requires DATABASE_URL", () => {
    const source = validEnv();
    delete source.DATABASE_URL;

    expect(() => parseVictoriaEnv(source)).toThrow("DATABASE_URL is required.");
  });

  it("requires OPENAI_MODEL", () => {
    const source = validEnv();
    delete source.OPENAI_MODEL;

    expect(() => parseVictoriaEnv(source)).toThrow("OPENAI_MODEL is required.");
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
          DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_prod",
          PLAID_ENV: "production",
          AUTH_SECRET: "test-auth-secret"
        })
      )
    ).toThrow("Production AUTH_SECRET must be at least 32 characters.");
  });

  it("rejects test provider credentials in production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_prod",
          PLAID_ENV: "production",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("Production provider credentials must not use local or test placeholder values.");
  });

  it("rejects generic placeholder provider credentials in production", () => {
    expect(() =>
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:secure-prod-password@db.victoria.internal:5432/victoria_prod",
          OPENAI_API_KEY: "replace-me",
          PLAID_CLIENT_ID: "production-plaid-client-id",
          PLAID_SECRET: "production-plaid-secret",
          PLAID_ENV: "production",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    ).toThrow("Production provider credentials must not use local or test placeholder values.");
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
