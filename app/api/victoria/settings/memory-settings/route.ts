import { getLocalMemoryControlsRuntime, localMemoryControlsEnabled } from "../../../../../src/app/http/local-memory-controls-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!localMemoryControlsEnabled()) return notConfigured(404);
  const handler = getLocalMemoryControlsRuntime()?.memorySettingsHandler;
  return handler ? handler(request) : notConfigured(503);
}

export async function PUT(request: Request): Promise<Response> {
  if (!localMemoryControlsEnabled()) return notConfigured(404);
  const handler = getLocalMemoryControlsRuntime()?.memorySettingsHandler;
  return handler ? handler(request) : notConfigured(503);
}

function notConfigured(status: 404 | 503): Response {
  return new Response(JSON.stringify({ error: "local_mock_runtime_not_configured" }), {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}
