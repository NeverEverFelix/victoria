import { getLocalMockVictoriaRuntime } from "../../../../../src/app/http/create-local-mock-victoria-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const handler = getLocalMockVictoriaRuntime()?.memorySettingsHandler;
  return handler ? handler(request) : notConfigured();
}

export async function PUT(request: Request): Promise<Response> {
  const handler = getLocalMockVictoriaRuntime()?.memorySettingsHandler;
  return handler ? handler(request) : notConfigured();
}

function notConfigured(): Response {
  return new Response(JSON.stringify({ error: "local_mock_runtime_not_configured" }), {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}
