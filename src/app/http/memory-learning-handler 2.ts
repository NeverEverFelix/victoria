import { timingSafeEqual } from "node:crypto";
import type { MemoryLearningRunResult } from "../turns/memory-learning-processor.js";

/** Secret-protected bounded worker endpoint. Requests cannot supply identities or job data. */
export function createMemoryLearningHandler(input: {
  readonly cronSecret: string;
  readonly run: (limit?: number) => Promise<MemoryLearningRunResult>;
}) {
  if (Buffer.byteLength(input.cronSecret, "utf8") < 32) throw new Error("A strong memory learning cron secret is required.");
  return async function handle(request: Request): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
    if (!authorized(request.headers.get("authorization"), input.cronSecret)) return json(401, { error: "unauthorized" });
    try {
      const result = await input.run(10);
      console.info(JSON.stringify({ event: "memory_learning_batch_completed", ...result }));
      return json(200, result);
    } catch {
      console.error(JSON.stringify({ event: "memory_learning_batch_failed", errorCode: "worker_unavailable" }));
      return json(503, { error: "memory_learning_unavailable" });
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
