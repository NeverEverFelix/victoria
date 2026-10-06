import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import {
  buildCompleteReviewComment,
  buildReviewInput,
  buildReviewRequest,
  chunkDiffForReview,
  resolveReviewOutputTokenLimit,
  splitReviewChunkForRetry
} from "./ai-code-review-core.mjs";

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

const maxDiffChars = Number(process.env.AI_REVIEW_MAX_DIFF_CHARS ?? 18000);
const maxChunks = Number(process.env.AI_REVIEW_MAX_CHUNKS ?? 24);
const reviewConcurrency = 5;
const maxCommentChars = Number(process.env.AI_REVIEW_MAX_COMMENT_CHARS ?? 60000);
const maxTrustedFileChars = 12000;

function log(message) {
  console.log(`[ai-code-review] ${message}`);
}

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
}

function readTrustedFileAtRef(ref, path, maxChars = maxTrustedFileChars) {
  if (!/^[a-f0-9]{40}$/i.test(ref)) {
    throw new Error(`Trusted review ref must be a full commit SHA; received an invalid ref.`);
  }

  let text;
  try {
    text = runGit(["show", `${ref}:${path}`]);
  } catch {
    throw new Error(`Required trusted review context is missing at base commit: ${path}`);
  }

  return text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[truncated at ${maxChars} characters]` : text;
}

function getTrustedRef(event) {
  const ref = GITHUB_EVENT_NAME === "pull_request_target"
    ? event.pull_request?.base?.sha ?? BASE_SHA
    : HEAD_SHA;
  if (!ref || !/^[a-f0-9]{40}$/i.test(ref)) {
    throw new Error("A full trusted base commit SHA is required to load AI review context.");
  }
  return ref;
}

function loadTrustedContext(ref) {
  return {
    agentInstructions: readTrustedFileAtRef(ref, "AGENTS.md"),
    codingPatterns: readTrustedFileAtRef(ref, "docs/agentic-coding-patterns.md"),
    decisions: readTrustedFileAtRef(ref, "docs/decisions.md"),
    mvp: readTrustedFileAtRef(ref, "docs/mvp.md"),
    userStories: readTrustedFileAtRef(ref, "docs/user-stories.md"),
    safetyContract: readTrustedFileAtRef(ref, "docs/specification/mvp-safety-contract.md", 24000),
    testPlan: readTrustedFileAtRef(ref, "tests/test-plan.md")
  };
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

async function createReview(input, maxOutputTokens) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildReviewRequest(OPENAI_CODE_REVIEW_MODEL, input, maxOutputTokens))
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  if (data.status === "incomplete") {
    const reason = data.incomplete_details?.reason ?? "unknown reason";
    const error = new Error(`OpenAI review response was incomplete: ${reason}. No partial review will be posted.`);
    if (reason === "max_output_tokens") {
      error.code = "AI_REVIEW_OUTPUT_LIMIT";
    }
    throw error;
  }
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

  throw new Error("OpenAI review response contained no review text. No partial review will be posted.");
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
  console.log(body);
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

  if (!Number.isInteger(maxChunks) || maxChunks < 1) {
    throw new Error("AI_REVIEW_MAX_CHUNKS must be a positive integer.");
  }
  if (!Number.isInteger(maxCommentChars) || maxCommentChars < 1) {
    throw new Error("AI_REVIEW_MAX_COMMENT_CHARS must be a positive integer.");
  }

  const partition = chunkDiffForReview(rawDiff, maxDiffChars);
  if (partition.chunks.length > maxChunks) {
    throw new Error(
      `AI review stopped without posting a partial result: ${partition.chunks.length} chunks are required, but AI_REVIEW_MAX_CHUNKS is ${maxChunks}. Split the PR or raise the configured cap.`
    );
  }

  const trustedRef = getTrustedRef(event);
  const trustedContext = loadTrustedContext(trustedRef);
  const maxOutputTokens = resolveReviewOutputTokenLimit(
    process.env.AI_REVIEW_MAX_OUTPUT_TOKENS
  );
  const reviewChunks = [...partition.chunks];
  const reviews = Array(reviewChunks.length);
  let apiCalls = 0;
  let index = 0;
  while (index < reviewChunks.length) {
    const end = Math.min(index + reviewConcurrency, reviewChunks.length);
    const batch = reviewChunks.slice(index, end);
    apiCalls += batch.length;
    if (apiCalls > maxChunks) {
      throw new Error(`AI review stopped without posting a partial result: AI_REVIEW_MAX_CHUNKS (${maxChunks}) API-call limit exceeded.`);
    }
    const results = await Promise.allSettled(batch.map((chunk) => {
      const scope = [
        `This pass covers ${chunk.paths.length} changed path(s): ${chunk.paths.join(", ")}.`,
        "Review only this bounded segment of the PR diff. The complete diff is covered across all passes; do not infer that files outside this segment are unchanged or absent."
      ].join(" ");
      return createReview(buildReviewInput({ diff: chunk.text, reviewScope: scope, ...trustedContext }), maxOutputTokens);
    }));
    const retryChunks = [];
    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const result = results[resultIndex];
      const chunk = batch[resultIndex];
      if (result.status === "fulfilled") {
        reviews[index + resultIndex] = result.value;
        continue;
      }
      if (result.reason.code !== "AI_REVIEW_OUTPUT_LIMIT") {
        throw result.reason;
      }
      const smallerChunks = splitReviewChunkForRetry(chunk);
      if (!smallerChunks) throw result.reason;
      retryChunks.push({ position: index + resultIndex, chunks: smallerChunks });
    }
    for (const retry of retryChunks.reverse()) {
      reviewChunks.splice(retry.position, 1, ...retry.chunks);
      reviews.splice(retry.position, 1, ...retry.chunks.map(() => undefined));
    }
    if (retryChunks.length) log(`Split ${retryChunks.length} over-budget pass(es); retrying smaller segments (${reviewChunks.length} total passes).`);
    index = retryChunks.length ? index : end;
  }

  partition.chunks = reviewChunks;
  const body = buildCompleteReviewComment(partition, reviews, trustedRef, maxCommentChars);

  if (GITHUB_EVENT_NAME === "pull_request_target") {
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
