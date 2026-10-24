import type { VictoriaAgent } from "../../agent/victoria-agent.js";
import type { ConversationCoordinator } from "../turns/conversation-coordinator.js";

export interface VictoriaChatHandlerDependencies {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  agent: Pick<VictoriaAgent, "respond">;
  conversationCoordinator?: ConversationCoordinator;
}

export interface VictoriaChatRouteContext {
  readonly conversationId: string;
}

const MAX_BODY_BYTES = 16_000;
const MAX_MESSAGE_LENGTH = 10_000;
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** Authenticated synchronous chat boundary for the mock-backed local runtime. */
export function createVictoriaChatHandler(dependencies: VictoriaChatHandlerDependencies) {
  return async function chat(request: Request, context: VictoriaChatRouteContext): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });
    if (!CONVERSATION_ID_PATTERN.test(context.conversationId)) return respond(400, { error: "invalid_conversation_id" });
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return respond(415, { error: "unsupported_media_type" });

    let user: { readonly userId: string } | null;
    try { user = await dependencies.authenticate(request); } catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });

    let body: unknown;
    try {
      const text = await readBoundedBody(request, MAX_BODY_BYTES);
      body = JSON.parse(text) as unknown;
    } catch (error) {
      return respond(error instanceof RequestTooLargeError ? 413 : 400,
        { error: error instanceof RequestTooLargeError ? "request_too_large" : "invalid_json" });
    }
    if (!isMessageBody(body)) return respond(400, { error: "invalid_chat_request" });

    try {
      const runAgent = () => dependencies.agent.respond({
          userId: user.userId,
          conversationId: context.conversationId,
          message: body.message
        });
      const response = dependencies.conversationCoordinator
        ? await dependencies.conversationCoordinator.runExclusive(user.userId, context.conversationId, runAgent)
        : await runAgent();
      return respond(200, {
        message: response.message,
        decision: {
          action: response.decision.action,
          classification: response.decision.classification
        }
      });
    } catch (error) {
      console.error("Victoria chat turn failed", safeErrorDiagnostic(error));
      return respond(503, { error: "chat_unavailable" });
    }
  };
}

function safeErrorDiagnostic(error: unknown): Readonly<Record<string, unknown>> {
  if (!(error instanceof Error)) return { errorName: "non_error_throwable" };
  const code = "code" in error && typeof error.code === "string"
    ? error.code.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)
    : undefined;
  const stackFrames = error.stack?.split("\n").slice(1, 6).map((frame) => frame.trim());
  return {
    errorName: error.name,
    ...(error instanceof ReferenceError ? { referenceError: error.message.slice(0, 160) } : {}),
    ...(code ? { errorCode: code } : {}),
    ...(stackFrames?.length ? { stackFrames } : {})
  };
}

async function readBoundedBody(request: Request, maximumBytes: number): Promise<string> {
  if (!request.body) throw new Error("Request body is missing.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function isMessageBody(value: unknown): value is { readonly message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.message === "string" &&
    body.message.trim().length > 0 && body.message.length <= MAX_MESSAGE_LENGTH;
}

class RequestTooLargeError extends Error {}
