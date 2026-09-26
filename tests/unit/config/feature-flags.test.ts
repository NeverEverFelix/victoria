import { describe, expect, it } from "vitest";
import { buildFeatureFlags } from "../../../src/config/feature-flags.js";
import { parseVictoriaEnv, type EnvSource } from "../../../src/config/env.js";

describe("buildFeatureFlags", () => {
  it("uses mock ledger and sandbox banking in local development", () => {
    const flags = buildFeatureFlags(parseVictoriaEnv(validEnv()));

    expect(flags.useMockAi).toBe(false);
    expect(flags.useMockLedger).toBe(true);
    expect(flags.useSandboxBanking).toBe(true);
    expect(flags.allowRealTransfers).toBe(false);
    expect(flags.requireApprovalForSavingsLedger).toBe(true);
    expect(flags.requireApprovalForRealTransfers).toBe(true);
  });

  it("uses mock AI in test when OPENAI_MODEL is mock", () => {
    const flags = buildFeatureFlags(
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "test",
          NODE_ENV: "test",
          OPENAI_MODEL: "mock"
        })
      )
    );

    expect(flags.useMockAi).toBe(true);
    expect(flags.allowRealTransfers).toBe(false);
  });

  it("does not allow real transfers in production unless the mode is real_transfer", () => {
    const flags = buildFeatureFlags(
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@prod-db.example.com:5432/victoria_prod",
          PLAID_ENV: "production",
          MONEY_MOVEMENT_MODE: "mock_ledger",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    );

    expect(flags.useMockLedger).toBe(true);
    expect(flags.allowRealTransfers).toBe(false);
  });

  it("allows real transfers only for production real_transfer configuration", () => {
    const flags = buildFeatureFlags(
      parseVictoriaEnv(
        validEnv({
          APP_ENV: "production",
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://victoria:password@prod-db.example.com:5432/victoria_prod",
          PLAID_ENV: "production",
          MONEY_MOVEMENT_MODE: "real_transfer",
          AUTH_SECRET: "production-auth-secret-at-least-32-characters"
        })
      )
    );

    expect(flags.useMockLedger).toBe(false);
    expect(flags.useSandboxBanking).toBe(false);
    expect(flags.allowRealTransfers).toBe(true);
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
