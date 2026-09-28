import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";

const {
  BASE_SHA,
  HEAD_SHA,
  GITHUB_EVENT_NAME,
  GITHUB_EVENT_PATH,
  GITHUB_REPOSITORY,
  GITHUB_STEP_SUMMARY,
  GITHUB_TOKEN,
  OPENAI_API_KEY,
  OPENAI_CODE_REVIEW_MODEL = "gpt-5"
} = process.env;

const maxDiffChars = Number(process.env.AI_REVIEW_MAX_DIFF_CHARS ?? 60000);

function log(message) {
  console.log(`[ai-code-review] ${message}`);
}

function readOptional(path, maxChars = 12000) {
  if (!existsSync(path)) {
    return "";
  }

  const text = readFileSync(path, "utf8");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[truncated]` : text;
}

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
}

function getEvent() {
  if (!GITHUB_EVENT_PATH || !existsSync(GITHUB_EVENT_PATH)) {
    return {};
  }

  return JSON.parse(readFileSync(GITHUB_EVENT_PATH, "utf8"));
}

function getDiff() {
  if (!BASE_SHA || !HEAD_SHA) {
    throw new Error("BASE_SHA and HEAD_SHA are required.");
  }

  const isMissingBase = /^0+$/.test(BASE_SHA);
  const range =
    GITHUB_EVENT_NAME === "pull_request"
      ? `${BASE_SHA}...${HEAD_SHA}`
      : isMissingBase
        ? `${HEAD_SHA}^..${HEAD_SHA}`
        : `${BASE_SHA}..${HEAD_SHA}`;
  const diff = runGit([
    "diff",
    "--unified=40",
    "--find-renames",
    range,
    "--",
    ".",
    ":(exclude)package-lock.json"
  ]);

  if (diff.length > maxDiffChars) {
    return `${diff.slice(0, maxDiffChars)}\n\n[Diff truncated at ${maxDiffChars} characters]`;
  }

  return diff;
}

function buildPrompt(diff) {
  const agentInstructions = readOptional("AGENTS.md");
  const codingPatterns = readOptional("docs/agentic-coding-patterns.md");
  const decisions = readOptional("docs/decisions.md");

  return `You are reviewing a Victoria repository change.

Focus on bugs, regressions, missing tests, safety issues, and docs drift.
Prioritize findings by severity. Be concise and concrete.

Victoria-specific review priorities:
- No real money movement in the MVP.
- Mocked ledger entries must not be described as bank transfers.
- User approval is required before recording savings.
- Ambiguous user language must not be treated as approval.
- Product behavior should match docs and tests.
- External integrations should not be wired prematurely.

Return Markdown with these sections:

## Findings
- If there are findings, list them as severity + file/path + issue + suggested fix.
- If there are no findings, say "No blocking findings."

## Tests
- Mention missing or relevant tests.

## Notes
- Mention docs drift or follow-up concerns.

Repository instructions:

${agentInstructions}

Agentic coding patterns:

${codingPatterns}

Product decisions:

${decisions}

Diff to review:

\`\`\`diff
${diff}
\`\`\``;
}

async function createReview(prompt) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_CODE_REVIEW_MODEL,
      input: prompt,
      text: {
        verbosity: "medium"
      },
      store: false
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const outputText = data.output_text;

  if (typeof outputText === "string" && outputText.trim()) {
    return outputText.trim();
  }

  const fallback = data.output
    ?.flatMap((item) => item.content ?? [])
    ?.map((content) => content.text)
    ?.filter(Boolean)
    ?.join("\n")
    ?.trim();

  if (fallback) {
    return fallback;
  }

  return "AI review completed, but no review text was returned.";
}

async function postPullRequestComment(event, body) {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !event.pull_request?.number) {
    return false;
  }

  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${event.pull_request.number}/comments`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ body })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub comment failed: ${response.status} ${text}`);
  }

  return true;
}

function writeSummary(body) {
  if (!GITHUB_STEP_SUMMARY) {
    console.log(body);
    return;
  }

  appendFileSync(GITHUB_STEP_SUMMARY, `${body}\n`, "utf8");
}

async function main() {
  if (!OPENAI_API_KEY) {
    log("OPENAI_API_KEY is not set; skipping AI review.");
    writeSummary("## AI Code Review\n\nSkipped because `OPENAI_API_KEY` is not configured.");
    return;
  }

  const event = getEvent();
  const diff = getDiff();

  if (!diff.trim()) {
    log("No diff found; skipping AI review.");
    writeSummary("## AI Code Review\n\nSkipped because there was no diff to review.");
    return;
  }

  const review = await createReview(buildPrompt(diff));
  const body = `## AI Code Review\n\n${review}`;

  if (GITHUB_EVENT_NAME === "pull_request") {
    const posted = await postPullRequestComment(event, body);
    if (posted) {
      log("Posted AI review comment to pull request.");
    } else {
      log("Could not post PR comment; writing summary instead.");
      writeSummary(body);
    }
    return;
  }

  writeSummary(body);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
