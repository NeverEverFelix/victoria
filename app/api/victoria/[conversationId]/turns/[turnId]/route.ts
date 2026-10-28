import { getLocalMockVictoriaRuntime } from "../../../../../../src/app/http/create-local-mock-victoria-runtime.js";
import { getPersistentChatRuntime } from "../../../../../../src/app/http/create-persistent-chat-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  readonly params: Promise<{ readonly conversationId: string; readonly turnId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const handlers = getHandlers();
  if (!handlers) return notConfigured();
  return handlers.result(request, await context.params);
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const handlers = getHandlers();
  if (!handlers) return notConfigured();
  return handlers.process(request, await context.params);
}

function getHandlers() {
  if (process.env.APP_ENV === "local") {
    const local = getLocalMockVictoriaRuntime();
    if (!local?.turnResultHandler || !local.processQueuedTurnHandler) return null;
    return { result: local.turnResultHandler, process: local.processQueuedTurnHandler };
  }
  const persistent = getPersistentChatRuntime();
  if (!persistent) return null;
  return { result: persistent.turnResultHandler, process: persistent.processQueuedTurnHandler };
}

function notConfigured(): Response {
  return new Response(JSON.stringify({ error: "turn_runtime_not_configured" }), {
    status: 503,
    headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
}
