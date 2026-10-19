import { getPersistentMemoryManagementHandlers } from "../../../src/app/http/create-persistent-memory-management-runtime.js";
import { getLocalMockVictoriaRuntime } from "../../../src/app/http/create-local-mock-victoria-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const localMode = process.env.APP_ENV === "local";
const handlers = localMode
  ? getLocalMockVictoriaRuntime()?.memoryManagementHandler ?? null
  : getPersistentMemoryManagementHandlers();

function unavailable(): Response {
  return new Response(JSON.stringify({ error: "memory_management_not_configured" }), {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function GET(request: Request): Promise<Response> {
  return handlers ? handlers.collection(request) : unavailable();
}

export async function PATCH(request: Request): Promise<Response> {
  return handlers ? handlers.collection(request) : unavailable();
}
