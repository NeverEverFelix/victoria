import { describe, expect, it, vi } from "vitest";
import { createMemoryRetentionHandler } from "../../../src/app/http/memory-retention-handler.js";

const success = { runId: 7, status: "succeeded" as const, deletedContextRows: 2,
  deletedMemoryRows: 0, deletedEmbeddingRows: 0, deletedProfileRows: 0 };

describe("memory retention handler", () => {
  it("requires the configured cron bearer and emits the run summary", async () => {
    const run = vi.fn(async () => success);
    const handler = createMemoryRetentionHandler({ cronSecret: "cron-secret-value-with-at-least-32-characters", run });
    expect((await handler(new Request("https://example.test/api/cron/memory-retention"))).status).toBe(401);
    const response = await handler(new Request("https://example.test/api/cron/memory-retention", {
      headers: { authorization: "Bearer cron-secret-value-with-at-least-32-characters" }
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(success);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reports SQL job failure and database errors without exposing details", async () => {
    const failed = createMemoryRetentionHandler({ cronSecret: "cron-secret-value-with-at-least-32-characters",
      run: async () => ({ ...success, status: "failed" }) });
    const request = new Request("https://example.test/", { headers: { authorization: "Bearer cron-secret-value-with-at-least-32-characters" } });
    expect((await failed(request)).status).toBe(503);
    const unavailable = createMemoryRetentionHandler({ cronSecret: "cron-secret-value-with-at-least-32-characters",
      run: async () => { throw new Error("private database details"); } });
    expect((await (await unavailable(request)).json()).error).toBe("retention_unavailable");
  });

  it("rejects unsupported methods and weak secrets", async () => {
    expect(() => createMemoryRetentionHandler({ cronSecret: "short", run: async () => success })).toThrow("strong retention");
    const handler = createMemoryRetentionHandler({ cronSecret: "cron-secret-value-with-at-least-32-characters", run: async () => success });
    expect((await handler(new Request("https://example.test/", { method: "POST" }))).status).toBe(405);
  });
});
