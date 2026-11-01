import type { TurnRepository } from "../turns/turn-repository.js";

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface TurnResultHandlerDependencies {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  turns: TurnRepository;
}

/** Authenticated, owner-scoped status and result polling for an accepted turn. */
export function createTurnResultHandler(dependencies: TurnResultHandlerDependencies) {
  return async function getTurnResult(request: Request, context: {
    readonly conversationId: string;
    readonly turnId: string;
  }): Promise<Response> {
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), {
      status,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
    });
    if (request.method !== "GET") return respond(405, { error: "method_not_allowed" });
    if (!CONVERSATION_ID_PATTERN.test(context.conversationId) || !context.turnId.trim()) {
      return respond(400, { error: "invalid_turn_reference" });
    }
    let user: { readonly userId: string } | null;
    try { user = await dependencies.authenticate(request); }
    catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId.trim()) return respond(401, { error: "unauthorized" });

    try {
      const turn = await dependencies.turns.get(user.userId, context.conversationId, context.turnId);
      if (!turn) return respond(404, { error: "turn_not_found" });
      if (turn.status !== "completed") {
        return respond(200, {
          turnId: turn.id, status: turn.status,
          ...(turn.status === "failed" ? { error: "turn_failed" } : {})
        });
      }
      if (turn.resultPayload !== undefined && !isPublicAgentResult(turn.resultPayload)) {
        return respond(503, { error: "turn_result_unavailable" });
      }
      return respond(200, {
        turnId: turn.id,
        status: turn.status,
        ...(turn.resultPayload === undefined ? {} : { result: publicAgentResult(turn.resultPayload) })
      });
    } catch {
      return respond(503, { error: "turn_status_unavailable" });
    }
  };
}

function isPublicAgentResult(value: unknown): value is {
  readonly message: string;
  readonly decision: { readonly action: string; readonly classification: { readonly type: string; readonly summary: string } };
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.message !== "string" || !record.decision || typeof record.decision !== "object" || Array.isArray(record.decision)) return false;
  const decision = record.decision as Record<string, unknown>;
  if (typeof decision.action !== "string" || !decision.classification || typeof decision.classification !== "object" || Array.isArray(decision.classification)) return false;
  const classification = decision.classification as Record<string, unknown>;
  return typeof classification.type === "string" && typeof classification.summary === "string";
}

function publicAgentResult(value: unknown) {
  const result = value as {
    readonly message: string;
    readonly decision: { readonly action: string; readonly classification: { readonly type: string; readonly summary: string } };
  };
  return {
    message: result.message,
    decision: {
      action: result.decision.action,
      classification: { type: result.decision.classification.type, summary: result.decision.classification.summary }
    }
  };
}
