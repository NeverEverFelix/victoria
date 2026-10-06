import { describe, expect, it } from "vitest";
import { runMockProviderComparison } from "./run-mock-provider-comparison.js";

const enabled = process.env.RUN_MOCK_PROVIDER_COMPARISON === "1";

describe.skipIf(!enabled)("mock provider comparison runner", () => {
  it("replays all 50 frozen cases through both local arms and preserves safety boundaries", async () => {
    const report = await runMockProviderComparison();

    expect(report.reportType).toBe("mock_contract_comparison");
    expect(report.corpusSha256).toBe("2bf4b48684abe591d2108afafc059bed871735f0caa6c53b43f33e13a24e562c");
    expect(report.arms.map((arm) => arm.armId)).toEqual(["deterministic_baseline", "scripted_specialists"]);
    for (const arm of report.arms) {
      expect(arm.turns).toHaveLength(50);
      expect(arm.safetyFailures, JSON.stringify(arm.turns.filter((turn) => turn.safetyFailures.length > 0))).toBe(0);
      expect(arm.turns.find((turn) => turn.id === "P31")?.setupActions).toEqual(["suggest_savings"]);
      expect(arm.turns.find((turn) => turn.id === "P50")?.setupActions).toEqual([
        "suggest_savings", "create_ledger_entry"
      ]);
      expect(arm.turns.find((turn) => turn.id === "P31")?.actualIntent).toBe("unclear");
      expect(arm.turns.find((turn) => turn.id === "P31")?.runtimeClassification).toBe("avoided_spend");
    }
    expect(report.limitations).toContain(
      "Both arms use deterministic local model behavior; results are contract-plumbing checks, not provider quality evidence."
    );
    process.stdout.write(`${JSON.stringify(report.arms.map((arm) => ({
      armId: arm.armId,
      turns: arm.turns.length,
      intentPasses: arm.intentPasses,
      actionPasses: arm.actionPasses,
      amountPasses: arm.amountPasses,
      safetyFailures: arm.safetyFailures,
      p50: arm.turns.find((turn) => turn.id === "P50"),
      intentMismatchIds: arm.turns.filter((turn) => !turn.intentPass).map((turn) => turn.id),
      actionMismatchIds: arm.turns.filter((turn) => !turn.actionPass).map((turn) => turn.id),
      amountMismatchIds: arm.turns.filter((turn) => !turn.amountPass).map((turn) => turn.id)
    })), null, 2)}\n`);
  });
});
