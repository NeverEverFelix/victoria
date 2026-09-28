import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("agentic setup validation", () => {
  it("fails when CODEOWNERS is missing", () => {
    const fixture = createRepositoryFixture();
    rmSync(join(fixture, ".github/CODEOWNERS"));

    const result = runValidator(fixture);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Missing required file: .github/CODEOWNERS");
  });

  it("fails when the README suggests moving money during the MVP", () => {
    const fixture = createRepositoryFixture();
    const readmePath = join(fixture, "README.md");
    const readme = readFileSync(readmePath, "utf8");
    writeFileSync(
      readmePath,
      `${readme}\nWould you like me to move $90 into your savings account?\n`,
      "utf8"
    );

    const result = runValidator(fixture);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("would you like me to move");
  });

  it("fails when the secret-bearing AI workflow runs for pull requests", () => {
    const fixture = createRepositoryFixture();
    const workflowPath = join(fixture, ".github/workflows/ai-code-review.yml");
    const workflow = readFileSync(workflowPath, "utf8");
    writeFileSync(workflowPath, workflow.replace("on:\n", "on:\n  pull_request:\n"), "utf8");

    const result = runValidator(fixture);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("pull_request:");
  });
});

function createRepositoryFixture(): string {
  const fixture = mkdtempSync(join(tmpdir(), "victoria-agentic-setup-"));
  temporaryDirectories.push(fixture);
  const repositoryRoot = process.cwd();
  const excludedRoots = [join(repositoryRoot, ".git"), join(repositoryRoot, "node_modules")];

  cpSync(repositoryRoot, fixture, {
    recursive: true,
    filter: (source) =>
      !excludedRoots.some((excludedRoot) => source === excludedRoot || source.startsWith(`${excludedRoot}/`))
  });

  return fixture;
}

function runValidator(cwd: string) {
  return spawnSync(process.execPath, [resolve("scripts/validate-agentic-setup.mjs")], {
    cwd,
    encoding: "utf8"
  });
}
