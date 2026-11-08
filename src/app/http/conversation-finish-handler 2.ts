import type { VictoriaAgent } from "../../agent/victoria-agent.js";
import type { ConversationCoordinator } from "../turns/conversation-coordinator.js";
import type { TurnRepository } from "../turns/turn-repository.js";

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface ConversationFinishHandlerDependencies {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  agent: Pick<VictoriaAgent, "finishConversation">;
  conversationCoordinator?: ConversationCoordinator;
  turns?: TurnRepository;
}

/** Authenticated boundary for explicitly ending a chat and saving eligible long-term context. */
export function createConversationFinishHandler(dependencies: ConversationFinishHandlerDependencies) {
  return async function finish(request: Request, conversationId: string): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });
    if (!CONVERSATION_ID_PATTERN.test(conversationId)) return respond(400, { error: "invalid_conversation_id" });

    let user: { readonly userId: string } | null;
    try { user = await dependencies.authenticate(request); }
    catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });

    try {
      const finishConversation = async () => {
        const sourceTurnReferences = dependencies.turns?.listConversation
          ? (await dependencies.turns.listConversation(user.userId, conversationId))
            .filter((turn) => turn.status === "completed")
            .map((turn) => ({ turnId: turn.id, userMessage: turn.userMessage }))
          : [];
        return dependencies.agent.finishConversation(user.userId, conversationId, sourceTurnReferences);
      };
      const saved = dependencies.conversationCoordinator
        ? await dependencies.conversationCoordinator.runExclusive(user.userId, conversationId, finishConversation)
        : await finishConversation();
      return respond(200, { saved });
    } catch {
      return respond(503, { error: "conversation_finish_unavailable" });
    }
  };
}
