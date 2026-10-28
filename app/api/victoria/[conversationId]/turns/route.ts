import { getLocalMockVictoriaRuntime } from "../../../../../src/app/http/create-local-mock-victoria-runtime.js";
import { getPersistentChatRuntime } from "../../../../../src/app/http/create-persistent-chat-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly conversationId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { conversationId } = await context.params;
  const handler = process.env.APP_ENV === "local"
    ? getLocalMockVictoriaRuntime()?.submitTurnHandler ?? null
    : getPersistentChatRuntime()?.submitTurnHandler ?? null;
  if (!handler) {
    return new Response(JSON.stringify({ error: "turn_runtime_not_configured" }), {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
    });
  }
  return handler(request, { conversationId });
}
