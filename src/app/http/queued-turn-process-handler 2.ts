import type { ProcessQueuedTurnResult } from "../turns/queued-turn-processor.js";

export interface QueuedTurnProcessHandlerDependencies {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  process(input: { readonly userId: string; readonly conversationId: string; readonly turnId: string }): Promise<ProcessQueuedTurnResult>;
}

/** Authenticated entry point for a host to process one of the caller's queued turns. */
export function createQueuedTurnProcessHandler(dependencies: QueuedTurnProcessHandlerDependencies) {
  return async function processTurn(request: Request, context: {
    readonly conversationId: string;
    readonly turnId: string;
  }): Promise<Response> {
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), {
      status,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" }
    });
    if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });
    let user: { readonly userId: string } | null;
    try { user = await dependencies.authenticate(request); }
    catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId.trim()) return respond(401, { error: "unauthorized" });

    try {
      const result = await dependencies.process({
        userId: user.userId, conversationId: context.conversationId, turnId: context.turnId
      });
      if (result.status === "completed") {
        return respond(200, {
          turnId: result.turnId,
          status: result.status,
          result: {
            message: result.response.message,
            decision: {
              action: result.response.decision.action,
              classification: {
                type: result.response.decision.classification.type,
                summary: result.response.decision.classification.summary
              }
            }
          }
        });
      }
      if (result.status === "already_claimed") return respond(202, { turnId: result.turnId, status: result.status });
      return respond(409, { turnId: result.turnId, status: result.status });
    } catch {
      return respond(503, { error: "turn_processing_unavailable" });
    }
  };
}
