import { describe, expect, it } from "vitest";
import { summarizeLatencies, summarizeValues } from "./metrics.js";

describe("multi-agent evaluation latency summaries", () => {
  it("reports nearest-rank p50, p95, and max across multiple turns", () => {
    expect(summarizeLatencies([10, 20, 30, 40, 50])).toEqual({
      sampleCount: 5, p50Ms: 30, p95Ms: 50, maxMs: 50
    });
  });

  it("represents an empty run without inventing percentile values", () => {
    expect(summarizeLatencies([])).toEqual({ sampleCount: 0, p50Ms: null, p95Ms: null, maxMs: null });
  });

  it("rejects invalid measurements", () => {
    expect(() => summarizeLatencies([10, Number.NaN])).toThrow("finite non-negative");
    expect(() => summarizeLatencies([-1])).toThrow("finite non-negative");
  });
});

describe("numeric evaluation summaries", () => {
  it("reports nearest-rank percentiles without labeling currency as milliseconds", () => {
    expect(summarizeValues([0.001, 0.002, 0.003, 0.004, 0.005])).toEqual({
      sampleCount: 5, p50: 0.003, p95: 0.005, max: 0.005
    });
  });

  it("represents missing cost observations and rejects invalid values", () => {
    expect(summarizeValues([])).toEqual({ sampleCount: 0, p50: null, p95: null, max: null });
    expect(() => summarizeValues([Number.NaN])).toThrow("finite non-negative");
  });
});
