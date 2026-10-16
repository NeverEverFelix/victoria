import { getLocalMemoryControlsRuntime } from "../../../../../../src/app/http/local-memory-controls-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly memoryId: string }>;
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const handler = getLocalMemoryControlsRuntime()?.memoryControlHandler;
  if (!handler) return notConfigured();
  const { memoryId } = await context.params;
  return handler(request, memoryId);
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const handler = getLocalMemoryControlsRuntime()?.memoryControlHandler;
  if (!handler) return notConfigured();
  const { memoryId } = await context.params;
  return handler(request, memoryId);
}

function notConfigured(): Response {
  return new Response(JSON.stringify({ error: "local_mock_runtime_not_configured" }), {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}
