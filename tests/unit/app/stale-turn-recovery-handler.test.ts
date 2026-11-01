import { describe, expect, it, vi } from "vitest";
import { createStaleTurnRecoveryHandler } from "../../../src/app/http/stale-turn-recovery-handler.js";

const secret = "turn-recovery-test-secret-with-more-than-32-bytes";

describe("stale turn recovery handler", () => {
  it("rejects weak secrets at setup", () => {
    expect(() => createStaleTurnRecoveryHandler({ cronSecret: "too-short", run: async () => summary }))
      .toThrow("strong turn-recovery cron secret");
  });

  it("requires an authenticated GET and exposes only aggregate recovery outcomes", async () => {
    const run = vi.fn(async () => summary);
    const handler = createStaleTurnRecoveryHandler({ cronSecret: secret, run });

    expect((await handler(new Request("https://victoria.local", { method: "POST" }))).status).toBe(405);
    expect((await handler(new Request("https://victoria.local"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();

    const response = await handler(new Request("https://victoria.local", {
      headers: { authorization: `Bearer ${secret}` }
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(run).toHaveBeenCalledOnce();
  });

  it("returns a safe unavailable response when the scan fails", async () => {
    const handler = createStaleTurnRecoveryHandler({ cronSecret: secret, run: async () => { throw new Error("database details"); } });
    const response = await handler(new Request("https://victoria.local", {
      headers: { authorization: `Bearer ${secret}` }
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "turn_recovery_unavailable" });
  });
});

const summary = { scanned: 3, completedFromReceipt: 1, markedInterrupted: 2, racedOrFailed: 0 };
