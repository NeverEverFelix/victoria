import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const specificationPath = "docs/specification/mvp-safety-contract.md";
const scenarioPaths = [
  "tests/contracts/mvp-safety-contract.test.ts",
  "tests/contracts/mvp-safety-contract.pending.test.ts",
  "tests/type-contracts/savings.ts"
] as const;

describe("MVP safety contract traceability", () => {
  it("gives every normative rule a stable identifier and a scenario reference", () => {
    const specification = readFileSync(specificationPath, "utf8");
    const scenarioSources = scenarioPaths.map((path) => readFileSync(path, "utf8")).join("\n");
    const ruleIds = new Set(
      specification.match(/\b(?:FIN|ARC|INT|APR|STA|AMT|IDM|COR|ERR|AUD)-\d{3}\b/g)
    );

    expect(ruleIds.size).toBeGreaterThan(0);

    const untracedRuleIds = [...ruleIds].filter(
      (ruleId) => !scenarioSources.includes(`[${ruleId}]`)
    );

    expect(untracedRuleIds).toEqual([]);
  });
});
