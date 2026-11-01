import { getPersistentChatRuntime } from "../../../../src/app/http/create-persistent-chat-runtime.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request): Promise<Response> {
  const handler = getPersistentChatRuntime()?.memoryLearningHandler;
  if (!handler) return new Response(JSON.stringify({ error: "memory_learning_runtime_not_configured" }), {
    status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
  });
  return handler(request);
}
