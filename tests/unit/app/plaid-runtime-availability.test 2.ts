import { describe, expect, it } from "vitest";
import { isPersistentPlaidRuntimeEnabled } from "../../../src/app/plaid/runtime-availability.js";

describe("Plaid runtime availability", () => {
  it("requires explicit staging opt-in and refuses local, production, and non-true flags", () => {
    expect(isPersistentPlaidRuntimeEnabled({ APP_ENV: "staging", PLAID_FINANCIAL_PROFILE_ENABLED: "true" })).toBe(true);
    expect(isPersistentPlaidRuntimeEnabled({ APP_ENV: "staging", PLAID_FINANCIAL_PROFILE_ENABLED: "false" })).toBe(false);
    expect(isPersistentPlaidRuntimeEnabled({ APP_ENV: "local", PLAID_FINANCIAL_PROFILE_ENABLED: "true" })).toBe(false);
    expect(isPersistentPlaidRuntimeEnabled({ APP_ENV: "production", PLAID_FINANCIAL_PROFILE_ENABLED: "true" })).toBe(false);
  });
});
