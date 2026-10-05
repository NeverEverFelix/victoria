import { createQueuedTurn } from "../../domain/turns/lifecycle.js";
import type { TurnRepository } from "../turns/turn-repository.js";
import { TurnRepositoryConflictError } from "../turns/turn-repository.js";

export interface AuthenticatedUser {
  readonly userId: string;
}

export interface SubmitTurnHandlerDependencies {
  /** Must return identity from a verified session/token, never request-supplied user data. */
  authenticate(request: Request): Promise<AuthenticatedUser | null>;
  /** Return false both for missing conversations and conversations owned by another user. */
  ownsConversation(userId: string, conversationId: string): Promise<boolean>;
  /** Use a keyed digest (for example HMAC), not a plain hash of predictable message text. */
  fingerprintRequest(input: { userId: string; conversationId: string; message: string }): Promise<string>;
  createTurnId(): string;
  now(): string;
  turns: TurnRepository;
}

export interface SubmitTurnRouteContext {
  readonly conversationId: string;
}

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_REQUEST_BYTES = 32_000;

/** Headless Web Request handler; framework routes can delegate to this boundary. */
export function createSubmitTurnHandler(dependencies: SubmitTurnHandlerDependencies) {
  return async function submitTurn(request: Request, context: SubmitTurnRouteContext): Promise<Response> {
    const headers = { "Cache-Control": "no-store" };
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "method_not_allowed" }, { ...headers, Allow: "POST" });
    }

    let user: AuthenticatedUser | null;
    try {
      user = await dependencies.authenticate(request);
    } catch {
      return jsonResponse(503, { error: "authentication_unavailable" }, headers);
    }
    if (!user?.userId.trim()) return jsonResponse(401, { error: "unauthorized" }, headers);

    let ownsConversation: boolean;
    try {
      ownsConversation = await dependencies.ownsConversation(user.userId, context.conversationId);
    } catch {
      return jsonResponse(503, { error: "conversation_check_unavailable" }, headers);
    }
    if (!ownsConversation) return jsonResponse(404, { error: "conversation_not_found" }, headers);

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return jsonResponse(400, { error: "invalid_idempotency_key" }, headers);
    }
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      return jsonResponse(415, { error: "unsupported_media_type" }, headers);
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return jsonResponse(413, { error: "request_too_large" }, headers);
    }

    let body: unknown;
    try {
      body = await readBoundedJson(request, MAX_REQUEST_BYTES);
    } catch (error) {
      if (error instanceof RequestTooLargeError) {
        return jsonResponse(413, { error: "request_too_large" }, headers);
      }
      return jsonResponse(400, { error: "invalid_json" }, headers);
    }
    if (!isTurnBody(body)) return jsonResponse(400, { error: "invalid_turn_request" }, headers);

    try {
      const requestFingerprint = await dependencies.fingerprintRequest({
        userId: user.userId,
        conversationId: context.conversationId,
        message: body.message
      });
      if (!requestFingerprint.trim()) return jsonResponse(503, { error: "request_fingerprint_unavailable" }, headers);

      const turn = createQueuedTurn({
        id: dependencies.createTurnId(),
        userId: user.userId,
        conversationId: context.conversationId,
        idempotencyKey,
        userMessage: body.message,
        requestFingerprint,
        acceptedAt: dependencies.now()
      });
      const accepted = await dependencies.turns.accept(turn);
      return jsonResponse(
        202,
        {
          turnId: accepted.turn.id,
          status: accepted.turn.status,
          acceptedAt: accepted.turn.acceptedAt
        },
        { ...headers, ...(accepted.disposition === "replayed" ? { "Idempotency-Replayed": "true" } : {}) }
      );
    } catch (error) {
      if (error instanceof TurnRepositoryConflictError) {
        return jsonResponse(409, { error: "idempotency_conflict" }, headers);
      }
      return jsonResponse(503, { error: "turn_acceptance_unavailable" }, headers);
    }
  };
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
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
  text += decoder.decode();
  return JSON.parse(text) as unknown;
}

class RequestTooLargeError extends Error {}

function isTurnBody(value: unknown): value is { message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1 && typeof body.message === "string" &&
    body.message.trim().length > 0 && body.message.length <= MAX_MESSAGE_LENGTH;
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}
