import { timingSafeEqual } from "node:crypto";
import type { StaleTurnRecoverySummary } from "../turns/stale-turn-recovery.js";

/** Secret-protected bounded maintenance endpoint; callers cannot choose turns or recovery policy. */
export function createStaleTurnRecoveryHandler(input: {
  readonly cronSecret: string;
  readonly run: () => Promise<StaleTurnRecoverySummary>;
}) {
  if (Buffer.byteLength(input.cronSecret, "utf8") < 32) throw new Error("A strong turn-recovery cron secret is required.");
  return async function recover(request: Request): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
    if (!authorized(request.headers.get("authorization"), input.cronSecret)) return json(401, { error: "unauthorized" });
    try {
      const result = await input.run();
      console.info(JSON.stringify({ event: "stale_turn_recovery_completed", ...result }));
      return json(200, result);
    } catch {
      console.error(JSON.stringify({ event: "stale_turn_recovery_failed", errorCode: "worker_unavailable" }));
      return json(503, { error: "turn_recovery_unavailable" });
    }
  };
}

function authorized(header: string | null, secret: string): boolean {
  const match = header?.match(/^Bearer (.+)$/i);
  if (!match?.[1]) return false;
  const candidate = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
