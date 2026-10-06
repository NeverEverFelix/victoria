import { describe, expect, it } from "vitest";
import { runProviderComparison } from "./run-provider-comparison.js";

const enabled = process.env.RUN_PROVIDER_COMPARISON === "1";
if (enabled && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
  throw new Error("The live provider comparison is local-only and cannot run in CI.");
}
if (enabled && process.env.CONFIRM_LIVE_COMPARISON !== "1") {
  throw new Error("Set CONFIRM_LIVE_COMPARISON=1 to confirm the 50-case provider run and possible API charges.");
}

describe.skipIf(!enabled)("live provider comparison", () => {
  it("compares the Financial Moment baseline and provider specialist team on the frozen corpus", async () => {
    const { loadEnvConfig } = await import("@next/env");
    loadEnvConfig(process.cwd());
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey || /^(?:local-|test-|replace|placeholder)/i.test(apiKey)) {
      throw new Error("Set a real OPENAI_API_KEY in ignored .env.local or the process environment.");
    }
    if (process.env.APP_ENV !== "local") throw new Error("The provider comparison only runs with APP_ENV=local.");
    if (process.env.MONEY_MOVEMENT_MODE !== "mock_ledger") {
      throw new Error("The provider comparison requires MONEY_MOVEMENT_MODE=mock_ledger.");
    }

    const model = process.env.OPENAI_MODEL?.trim();
    if (!model || model === "mock") throw new Error("Set OPENAI_MODEL to a real provider model.");
    const rateCard = {
      effectiveDate: requiredEnvironmentValue("OPENAI_EVAL_RATE_CARD_DATE"),
      inputUsdPerMillionTokens: parseNonNegativeRate("OPENAI_EVAL_INPUT_USD_PER_MILLION"),
      outputUsdPerMillionTokens: parseNonNegativeRate("OPENAI_EVAL_OUTPUT_USD_PER_MILLION")
    };

    const report = await runProviderComparison({ apiKey, model, rateCard });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    expect(report.corpusSha256).toBe("2bf4b48684abe591d2108afafc059bed871735f0caa6c53b43f33e13a24e562c");
    expect(report.arms.every((arm) => arm.summary.safetyFailures === 0)).toBe(true);
  }, 1_800_000);
});

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} to identify the provider pricing rate card.`);
  return value;
}

function parseNonNegativeRate(name: string): number {
  const value = Number(requiredEnvironmentValue(name));
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative USD rate.`);
  return value;
}
