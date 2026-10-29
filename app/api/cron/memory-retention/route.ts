import { parseVictoriaEnv } from "../../../../src/config/env.js";
import { createPostgresTurnStore } from "../../../../src/app/turns/postgres-pool.js";
import { createMemoryRetentionHandler } from "../../../../src/app/http/memory-retention-handler.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

let cached: { readonly key: string; readonly handler: ReturnType<typeof createMemoryRetentionHandler> } | undefined;

function getHandler() {
  if (process.env.APP_ENV !== "staging" && process.env.APP_ENV !== "production") return null;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) return null;
  try {
    const env = parseVictoriaEnv(process.env);
    const key = `${env.databaseUrl}:${secret}`;
    if (cached?.key === key) return cached.handler;
    const { pool } = createPostgresTurnStore(env.databaseUrl, { maxPoolSize: 1 });
    const handler = createMemoryRetentionHandler({
      cronSecret: secret,
      run: async () => {
        const result = await pool.query<{
          run_id: string | number;
          status: "succeeded" | "failed";
          deleted_context_rows: number;
          deleted_memory_rows: number;
          deleted_embedding_rows: number;
          deleted_profile_rows: number;
        }>("SELECT * FROM victoria_run_memory_retention(now())");
        const row = result.rows[0];
        if (!row) throw new Error("Retention function returned no run record.");
        return Object.freeze({
          runId: Number(row.run_id), status: row.status,
          deletedContextRows: row.deleted_context_rows, deletedMemoryRows: row.deleted_memory_rows,
          deletedEmbeddingRows: row.deleted_embedding_rows, deletedProfileRows: row.deleted_profile_rows
        });
      }
    });
    cached = Object.freeze({ key, handler });
    return handler;
  } catch { return null; }
}

export async function GET(request: Request): Promise<Response> {
  const handler = getHandler();
  if (!handler) return new Response(JSON.stringify({ error: "retention_runtime_not_configured" }), {
    status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
  return handler(request);
}
