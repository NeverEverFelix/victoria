import { getLocalMockVictoriaRuntime } from "../../../../src/app/http/create-local-mock-victoria-runtime.js";
import { getPersistentChatRuntime } from "../../../../src/app/http/create-persistent-chat-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const handler = process.env.APP_ENV === "local"
    ? getLocalMockVictoriaRuntime()?.staleTurnRecoveryHandler
    : getPersistentChatRuntime()?.staleTurnRecoveryHandler;
  if (!handler) {
    return new Response(JSON.stringify({ error: "turn_recovery_not_configured" }), {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
    });
  }
  return handler(request);
}
