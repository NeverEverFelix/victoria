import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseVictoriaEnv, type EnvSource } from "../../../src/config/env.js";

describe("environment example files", () => {
  it("keeps the local example parseable for mock-backed development", () => {
    const env = parseVictoriaEnv(readEnvExample(".env.example"));

    expect(env.appEnv).toBe("local");
    expect(env.nodeEnv).toBe("development");
    expect(env.openAiModel).toBe("mock");
    expect(env.moneyMovementMode).toBe("mock_ledger");
  });

  it("keeps the test example parseable for automated tests", () => {
    const env = parseVictoriaEnv(readEnvExample(".env.test.example"));

    expect(env.appEnv).toBe("test");
    expect(env.nodeEnv).toBe("test");
    expect(env.openAiModel).toBe("mock");
    expect(env.moneyMovementMode).toBe("mock_ledger");
  });

  it("keeps the staging example fail-closed until real secrets are supplied", () => {
    expect(() => parseVictoriaEnv(readEnvExample(".env.staging.example"))).toThrow(
      "OPENAI_API_KEY is required."
    );
  });

  it("keeps the production example fail-closed until real secrets are supplied", () => {
    expect(() => parseVictoriaEnv(readEnvExample(".env.production.example"))).toThrow(
      "OPENAI_API_KEY is required."
    );
  });
});

function readEnvExample(fileName: string): EnvSource {
  const filePath = join(process.cwd(), fileName);
  const contents = readFileSync(filePath, "utf8");

  return contents.split("\n").reduce<EnvSource>((env, line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return env;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      return env;
    }

    const key = trimmedLine.slice(0, separatorIndex);
    const value = trimmedLine.slice(separatorIndex + 1);

    return {
      ...env,
      [key]: value
    };
  }, {});
}
