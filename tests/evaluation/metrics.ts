export interface LatencySummary {
  sampleCount: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

/** Nearest-rank percentile summary; calculate over many complete turns, not one turn. */
export function summarizeLatencies(samplesMs: readonly number[]): LatencySummary {
  if (samplesMs.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new Error("Latency samples must be finite non-negative milliseconds.");
  }
  if (samplesMs.length === 0) return { sampleCount: 0, p50Ms: null, p95Ms: null, maxMs: null };
  const sorted = [...samplesMs].sort((left, right) => left - right);
  return {
    sampleCount: sorted.length,
    p50Ms: nearestRank(sorted, 0.5),
    p95Ms: nearestRank(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? null
  };
}

function nearestRank(sorted: number[], percentile: number): number {
  const index = Math.max(0, Math.ceil(percentile * sorted.length) - 1);
  return sorted[index] ?? 0;
}
