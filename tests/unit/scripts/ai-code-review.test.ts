import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("ai-code-review script", () => {
  it("skips successfully when the API key is missing and review is optional", () => {
    const result = runAiReview({ AI_REVIEW_REQUIRED: "false" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OPENAI_API_KEY is not set; skipping AI review.");
  });

  it("fails when the API key is missing and review is required", () => {
    const result = runAiReview({ AI_REVIEW_REQUIRED: "true" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("AI_REVIEW_REQUIRED=true");
  });
});

function runAiReview(env: Record<string, string>) {
  return spawnSync(process.execPath, ["scripts/ai-code-review.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
      OPENAI_API_KEY: ""
    }
  });
}
