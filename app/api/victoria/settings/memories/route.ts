import { getLocalMockVictoriaRuntime } from "../../../../../src/app/http/create-local-mock-victoria-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const handler = getLocalMockVictoriaRuntime()?.memoryControlsCollectionHandler;
  if (!handler) return notConfigured();
  return handler(request);
}

export async function DELETE(request: Request): Promise<Response> {
  const handler = getLocalMockVictoriaRuntime()?.memoryControlsCollectionHandler;
  if (!handler) return notConfigured();
  return handler(request);
}

function notConfigured(): Response {
  return new Response(JSON.stringify({ error: "local_mock_runtime_not_configured" }), {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}
