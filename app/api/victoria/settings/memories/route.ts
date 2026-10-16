import { getLocalMemoryControlsRuntime } from "../../../../../src/app/http/local-memory-controls-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const handler = getLocalMemoryControlsRuntime()?.memoryControlsCollectionHandler;
  if (!handler) return notConfigured();
  return handler(request);
}

export async function DELETE(request: Request): Promise<Response> {
  const handler = getLocalMemoryControlsRuntime()?.memoryControlsCollectionHandler;
  if (!handler) return notConfigured();
  return handler(request);
}

function notConfigured(): Response {
  return new Response(JSON.stringify({ error: "local_mock_runtime_not_configured" }), {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}
