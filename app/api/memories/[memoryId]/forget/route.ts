import { getPersistentMemoryManagementHandlers } from "../../../../../src/app/http/create-persistent-memory-management-runtime.js";
import { getLocalMockVictoriaRuntime } from "../../../../../src/app/http/create-local-mock-victoria-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteContext {
  readonly params: Promise<{ readonly memoryId: string }>;
}

function unavailable(): Response {
  return new Response(JSON.stringify({ error: "memory_management_not_configured" }), {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!handlers) return unavailable();
  const { memoryId } = await context.params;
  return handlers.forget(request, { memoryId });
}

const localMode = process.env.APP_ENV === "local";
const handlers = localMode
  ? getLocalMockVictoriaRuntime()?.memoryManagementHandler ?? null
  : getPersistentMemoryManagementHandlers();
