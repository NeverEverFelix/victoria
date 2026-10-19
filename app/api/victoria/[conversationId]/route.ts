import { getLocalMockVictoriaChatHandler } from "../../../../src/app/http/create-local-mock-victoria-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly conversationId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const handler = getLocalMockVictoriaChatHandler();
  if (!handler) {
    return new Response(JSON.stringify({ error: "local_mock_runtime_not_configured" }), {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
    });
  }
  const { conversationId } = await context.params;
  return handler(request, { conversationId });
}
