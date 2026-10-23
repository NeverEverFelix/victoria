import { readFile } from "node:fs/promises";

const apiKey = process.env.OPENAI_API_KEY?.trim();
if (!apiKey || /(?:local-openai|replace|example|placeholder|changeme)/i.test(apiKey)) {
  throw new Error("Set a real OPENAI_API_KEY to run the memory relevance evaluation.");
}

const model = process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
const cases = JSON.parse(await readFile(new URL("../tests/evaluation/memory-relevance-cases.json", import.meta.url), "utf8"));
const inputs = cases.flatMap(({ memory, query }) => [memory, query]);
const response = await fetch("https://api.openai.com/v1/embeddings", {
  method: "POST",
  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model, input: inputs, dimensions: 1536, encoding_format: "float" }),
  signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`Embedding request failed (${response.status}).`);
const body = await response.json();
const vectors = body.data?.sort((left, right) => left.index - right.index).map(({ embedding }) => embedding);
if (!Array.isArray(vectors) || vectors.length !== inputs.length || vectors.some((v) => !Array.isArray(v) || v.length !== 1536)) {
  throw new Error("Embedding response did not contain one 1536-dimensional vector per input.");
}

const scored = cases.map((item, index) => ({
  id: item.id,
  relevant: item.relevant,
  similarity: cosineSimilarity(vectors[index * 2], vectors[index * 2 + 1])
}));
const thresholds = [0.65, 0.68, 0.70, 0.72, 0.74, 0.76, 0.78, 0.80, 0.82, 0.85];
const rows = thresholds.map((threshold) => {
  const tp = scored.filter((item) => item.relevant && item.similarity >= threshold).length;
  const fp = scored.filter((item) => !item.relevant && item.similarity >= threshold).length;
  const fn = scored.filter((item) => item.relevant && item.similarity < threshold).length;
  return {
    threshold,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn
  };
});

console.log(JSON.stringify({ model, caseCount: cases.length, scores: scored, thresholdMetrics: rows }, null, 2));

function cosineSimilarity(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(3));
}
