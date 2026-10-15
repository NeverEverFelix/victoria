import { describe, expect, it } from "vitest";
import type { VictoriaEnv } from "../../../src/config/env.js";
import { createPlaidFinancialProfileRuntime } from "../../../src/app/plaid/create-plaid-financial-profile-runtime.js";

describe("createPlaidFinancialProfileRuntime", () => {
  it("requires explicit opt-in before composing providers", () => {
    expect(() => createPlaidFinancialProfileRuntime({
      enabled: false,
      env: {} as VictoriaEnv,
      tokenEncryptionKeyBase64: "",
      authenticate: async () => null
    })).toThrow("requires explicit opt-in");
  });

  it("refuses a non-sandbox Plaid environment", () => {
    const env = {
      plaidClientId: "client-test",
      plaidSecret: "secret-test",
      plaidEnv: "production",
      openAiApiKey: "openai-test"
    } as VictoriaEnv;
    expect(() => createPlaidFinancialProfileRuntime({
      enabled: true,
      env,
      tokenEncryptionKeyBase64: Buffer.alloc(32).toString("base64"),
      authenticate: async () => null
    })).toThrow("Only the Plaid sandbox environment is enabled");
  });

  it("refuses to initialize in production, even with sandbox credentials", () => {
    const env = {
      appEnv: "production",
      plaidClientId: "client-test",
      plaidSecret: "secret-test",
      plaidEnv: "sandbox",
      openAiApiKey: "openai-test"
    } as VictoriaEnv;
    expect(() => createPlaidFinancialProfileRuntime({
      enabled: true,
      env,
      tokenEncryptionKeyBase64: Buffer.alloc(32).toString("base64"),
      authenticate: async () => null
    })).toThrow("disabled in production");
  });
});
