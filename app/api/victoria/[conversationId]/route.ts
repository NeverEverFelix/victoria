import { getLocalMockVictoriaChatHandler } from "../../../../src/app/http/create-local-mock-victoria-runtime.js";
import { getPersistentChatRuntime } from "../../../../src/app/http/create-persistent-chat-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly conversationId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const handler = process.env.APP_ENV === "local"
    ? getLocalMockVictoriaChatHandler()
    : getPersistentChatRuntime()?.handler ?? null;
  if (!handler) {
    return new Response(JSON.stringify({ error: "chat_runtime_not_configured" }), {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
    });
  }
  const { conversationId } = await context.params;
  return handler(request, { conversationId });
}
