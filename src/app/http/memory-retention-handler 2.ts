import { timingSafeEqual } from "node:crypto";

export interface MemoryRetentionResult {
  readonly runId: number;
  readonly status: "succeeded" | "failed";
  readonly deletedContextRows: number;
  readonly deletedMemoryRows: number;
  readonly deletedEmbeddingRows: number;
  readonly deletedProfileRows: number;
}

/** Secret-protected scheduled maintenance endpoint. It never accepts user or cutoff data. */
export function createMemoryRetentionHandler(input: {
  readonly cronSecret: string;
  readonly run: () => Promise<MemoryRetentionResult>;
}) {
  if (input.cronSecret.length < 32) throw new Error("A strong retention cron secret is required.");
  return async function handle(request: Request): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
    if (!authorized(request.headers.get("authorization"), input.cronSecret)) return json(401, { error: "unauthorized" });
    try {
      const result = await input.run();
      if (result.status !== "succeeded") {
        console.error(JSON.stringify({ event: "memory_retention_failed", ...result }));
        return json(503, result);
      }
      console.info(JSON.stringify({ event: "memory_retention_completed", ...result }));
      return json(200, result);
    } catch {
      console.error(JSON.stringify({ event: "memory_retention_failed", errorCode: "database_unavailable" }));
      return json(503, { error: "retention_unavailable" });
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
