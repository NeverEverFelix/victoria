import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { buildReviewInput, prepareDiffForReview } from "./ai-code-review-core.mjs";

const {
  BASE_SHA,
  HEAD_SHA,
  GITHUB_EVENT_NAME,
  GITHUB_EVENT_PATH,
  GITHUB_REPOSITORY,
  GITHUB_STEP_SUMMARY,
  GITHUB_TOKEN,
  PULL_REQUEST_NUMBER,
  AI_REVIEW_REQUIRED,
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

async function getPullRequestDiff() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PULL_REQUEST_NUMBER) {
    throw new Error(
      "GITHUB_TOKEN, GITHUB_REPOSITORY, and PULL_REQUEST_NUMBER are required for pull request review."
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${PULL_REQUEST_NUMBER}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3.diff",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub diff request failed: ${response.status} ${body}`);
  }

  return response.text();
}

async function getDiff() {
  if (GITHUB_EVENT_NAME === "pull_request_target") {
    return getPullRequestDiff();
  }

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

  return diff;
}

async function createReview(input) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_CODE_REVIEW_MODEL,
      input,
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
    const message = "OPENAI_API_KEY is not set; skipping AI review.";
    log("OPENAI_API_KEY is not set; skipping AI review.");
    writeSummary("## AI Code Review\n\nSkipped because `OPENAI_API_KEY` is not configured.");
    if (AI_REVIEW_REQUIRED === "true") {
      throw new Error(`${message} AI_REVIEW_REQUIRED=true, so this job must fail.`);
    }
    return;
  }

  const event = getEvent();
  const rawDiff = await getDiff();

  if (!rawDiff.trim()) {
    log("No diff found; skipping AI review.");
    writeSummary("## AI Code Review\n\nSkipped because there was no diff to review.");
    if (AI_REVIEW_REQUIRED === "true") {
      throw new Error("AI_REVIEW_REQUIRED=true, but there was no diff to review.");
    }
    return;
  }

  const preparedDiff = prepareDiffForReview(rawDiff, maxDiffChars);
  const input = buildReviewInput({
    diff: preparedDiff.text,
    agentInstructions: readOptional("AGENTS.md"),
    codingPatterns: readOptional("docs/agentic-coding-patterns.md"),
    decisions: readOptional("docs/decisions.md")
  });
  const review = await createReview(input);
  const completenessWarning = preparedDiff.truncated
    ? `> **Incomplete automated review:** the diff was ${preparedDiff.originalChars} characters and exceeded the ${maxDiffChars}-character limit. Safety-sensitive files were prioritized, but a human must review the complete diff.\n\n`
    : "";
  const body = `## AI Code Review\n\n${completenessWarning}${review}`;

  if (GITHUB_EVENT_NAME === "pull_request_target") {
    const posted = await postPullRequestComment(event, body);
    if (posted) {
      log("Posted AI review comment to pull request.");
    } else {
      log("Could not post PR comment; writing summary instead.");
      writeSummary(body);
    }
    if (preparedDiff.truncated && AI_REVIEW_REQUIRED === "true") {
      throw new Error("Required AI review was incomplete because the diff exceeded the review limit.");
    }
    return;
  }

  writeSummary(body);
  if (preparedDiff.truncated && AI_REVIEW_REQUIRED === "true") {
    throw new Error("Required AI review was incomplete because the diff exceeded the review limit.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
