import { deterministicConversationFallback } from "./conversation-fallback.js";
import {
  buildConversationContextSnapshot,
  ConversationResponderError,
  validateConversationReplyDetailed,
  type ConversationReplyFallbackReason,
  type ConversationReplyRejectionReason,
  type ConversationResponder,
  type ConversationResponderInput
} from "./conversation-responder.js";

export interface ConversationReplyTrace {
  readonly route: "pending_workflow" | "grounded_read_only" | "ordinary_dialogue";
  readonly outcome: "provider_accepted" | "retry_accepted" | "fallback";
  readonly retryCount: 0 | 1;
  readonly rejectionReason?: ConversationReplyRejectionReason;
  readonly fallbackReason?: ConversationReplyFallbackReason;
}

/** Read-only dialogue generation, validation, and degraded-mode recovery. */
export class ConversationReplyService {
  constructor(
    private readonly responder?: ConversationResponder,
    private readonly onFallback?: (reason: ConversationReplyFallbackReason) => void,
    private readonly onTrace?: (trace: ConversationReplyTrace) => void
  ) {}

  async respond(input: ConversationResponderInput): Promise<string> {
    if (!this.responder) return input.baselineReply;
    const contextSnapshot = input.contextSnapshot
      ? input.verifiedCalculations && !input.contextSnapshot.verifiedCalculations
        ? Object.freeze({ ...input.contextSnapshot, verifiedCalculations: input.verifiedCalculations })
        : input.contextSnapshot
      : buildConversationContextSnapshot(input);
    const dialogue = contextSnapshot.dialogueTurns;
    const currentTurnIsLast = dialogue.at(-1)?.role === "user" &&
      dialogue.at(-1)?.content === contextSnapshot.currentMessage;
    const recentTurns = (currentTurnIsLast ? dialogue.slice(0, -1) : dialogue).map((turn) =>
      turn.role === "assistant" ? `Victoria: ${turn.content}` : turn.content
    );
    const responderInput: ConversationResponderInput = {
      message: input.responseFocus ?? contextSnapshot.currentMessage,
      ...(input.responseFocus ? { responseFocus: input.responseFocus } : {}),
      recentTurns,
      memories: contextSnapshot.selectedMemories,
      episodicSummaries: contextSnapshot.episodicSummaries,
      baselineReply: input.baselineReply,
      ...(contextSnapshot.responsePreference ? { responsePreference: contextSnapshot.responsePreference } : {}),
      ...(contextSnapshot.pendingAction ? { pendingAction: contextSnapshot.pendingAction } : {}),
      ...(contextSnapshot.references?.pendingWorkflow
        ? { pendingWorkflowReference: contextSnapshot.references.pendingWorkflow } : {}),
      ...(contextSnapshot.financialContext ? { financialContext: contextSnapshot.financialContext } : {}),
      ...(contextSnapshot.conversationSavingsEvents
        ? { conversationSavingsEvents: contextSnapshot.conversationSavingsEvents } : {}),
      ...(contextSnapshot.verifiedCalculations
        ? { verifiedCalculations: contextSnapshot.verifiedCalculations } : {}),
      contextSnapshot
    };
    const fallbackReply = deterministicConversationFallback(responderInput);
    let candidate: string;
    try {
      candidate = await this.responder.respond(responderInput);
    } catch (error) {
      const reason = error instanceof ConversationResponderError ? error.reason : "provider_unavailable";
      this.reportFallback(reason);
      this.reportTrace({ input, outcome: "fallback", retryCount: 0, fallbackReason: reason });
      return fallbackReply;
    }

    const validation = validateConversationReplyDetailed(candidate, responderInput);
    if (validation.ok) {
      const unchangedBaseline = validation.reply.trim().replace(/\s+/g, " ") ===
        responderInput.baselineReply.trim().replace(/\s+/g, " ");
      const hasMoreSpecificFallback = fallbackReply.trim().replace(/\s+/g, " ") !==
        responderInput.baselineReply.trim().replace(/\s+/g, " ");
      this.reportTrace({ input, outcome: "provider_accepted", retryCount: 0 });
      return unchangedBaseline && hasMoreSpecificFallback ? fallbackReply : validation.reply;
    }

    // A revision can improve the answer but has no tools and cannot resolve the workflow.
    const retryInput: ConversationResponderInput = {
      ...responderInput,
      baselineReply: `Your previous draft was not safe to show. Answer the user's current request directly, using only supported facts and no unsupported dollar amounts. Keep the pending ${responderInput.pendingAction ?? "financial action"} unchanged. If you cannot answer safely, use this fallback: ${responderInput.baselineReply}`,
      contextSnapshot
    };
    let retryReason: ConversationReplyRejectionReason = validation.reason;
    try {
      const retryValidation = validateConversationReplyDetailed(
        await this.responder.respond(retryInput), retryInput
      );
      if (retryValidation.ok) {
        this.reportTrace({ input, outcome: "retry_accepted", retryCount: 1, rejectionReason: validation.reason });
        return retryValidation.reply;
      }
      retryReason = retryValidation.reason;
    } catch (error) {
      const reason = error instanceof ConversationResponderError ? error.reason : "provider_unavailable";
      this.reportFallback(reason);
      this.reportTrace({ input, outcome: "fallback", retryCount: 1,
        rejectionReason: validation.reason, fallbackReason: reason });
      return fallbackReply;
    }
    const fallbackReason = fallbackReasonForValidation(retryReason);
    this.reportFallback(fallbackReason);
    this.reportTrace({ input, outcome: "fallback", retryCount: 1,
      rejectionReason: retryReason, fallbackReason });
    return fallbackReply;
  }

  private reportTrace(input: {
    readonly input: ConversationResponderInput;
    readonly outcome: ConversationReplyTrace["outcome"];
    readonly retryCount: ConversationReplyTrace["retryCount"];
    readonly rejectionReason?: ConversationReplyRejectionReason;
    readonly fallbackReason?: ConversationReplyFallbackReason;
  }): void {
    const route = input.input.pendingAction || input.input.pendingWorkflowReference || input.input.financialContext?.workflowState
      ? "pending_workflow"
      : input.input.verifiedCalculations?.length || input.input.financialContext?.financialFacts.length
        ? "grounded_read_only" : "ordinary_dialogue";
    try {
      this.onTrace?.(Object.freeze({ route, outcome: input.outcome, retryCount: input.retryCount,
        ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
        ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}) }));
    } catch { /* Content-free observability cannot block response recovery. */ }
  }

  private reportFallback(reason: ConversationReplyFallbackReason): void {
    try { this.onFallback?.(reason); }
    catch { /* Observability is best-effort and cannot block safe recovery. */ }
  }
}

function fallbackReasonForValidation(reason: ConversationReplyRejectionReason): ConversationReplyFallbackReason {
  if (reason === "unsupported_numeric_claim" || reason === "unsupported_projection_claim") return "unsupported_numeric_claim";
  if (reason === "response_too_long") return "response_too_long";
  if (["completed_action_claim", "unsupported_balance_claim", "real_transfer_promise", "ledger_action_offer"]
    .includes(reason)) return "violates_action_boundary";
  return "invalid_after_retry";
}
