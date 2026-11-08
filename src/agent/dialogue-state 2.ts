import type { ConversationContextSnapshot } from "./conversation-responder.js";

export interface DialogueState {
  readonly schemaVersion: 1;
  /** The latest user-authored turn that gives the conversation its current topic. */
  readonly activeTopic?: { readonly text: string; readonly sourceTurnIndex: number };
  /** A direct first-person goal statement, retained as a quote rather than a model inference. */
  readonly userGoal?: { readonly text: string; readonly sourceTurnIndex: number };
  /** Latest question Victoria asked before the current user turn; descriptive only. */
  readonly recentAssistantQuestion?: { readonly text: string; readonly sourceTurnIndex: number };
  readonly currentConstraints: readonly { readonly text: string; readonly sourceTurnIndex: number }[];
  readonly recentCorrections: readonly { readonly text: string; readonly sourceTurnIndex: number }[];
  /** Only references already resolved by deterministic, scoped resolvers are listed. */
  readonly referencedEntities: readonly { readonly kind: "savings_event" | "pending_action"; readonly id: string }[];
  readonly lastUpdatedTurnIndex: number;
}

/** Derives working dialogue context from role-tagged turns; it never creates financial authority. */
export function buildDialogueState(input: {
  readonly dialogueTurns: ConversationContextSnapshot["dialogueTurns"];
  readonly references?: ConversationContextSnapshot["references"];
}): DialogueState {
  const userTurns = input.dialogueTurns.flatMap((turn, sourceTurnIndex) =>
    turn.role === "user" && turn.content.trim() ? [{ text: turn.content.trim().slice(0, 500), sourceTurnIndex }] : []);
  const assistantQuestions = input.dialogueTurns.flatMap((turn, sourceTurnIndex) =>
    turn.role === "assistant" && /[?？]/.test(turn.content)
      ? [{ text: turn.content.trim().slice(0, 500), sourceTurnIndex }] : []);
  const userGoal = [...userTurns].reverse().find(({ text }) =>
    /\b(?:my goal is to|i (?:want|need|hope|plan|would like) to|i'm trying to)\b/i.test(text));
  const currentConstraints = userTurns.filter(({ text }) =>
    /\b(?:i (?:can't|cannot|won't|don't want|do not want|prefer|need)|i have to|only if|it has to)\b/i.test(text)
  ).slice(-4);
  const recentCorrections = userTurns.filter(({ text }) =>
    /^\s*(?:actually|correction|i meant|rather,|instead,)/i.test(text) ||
    /\b(?:actually i|i meant|i should have said|to correct that)\b/i.test(text)
  ).slice(-4);
  const resolvedEvent = input.references?.historicalEvent?.kind === "resolved"
    ? [{ kind: "savings_event" as const, id: input.references.historicalEvent.eventId }] : [];
  const resolvedAction = input.references?.activeWorkflow?.actionId ?? input.references?.pendingWorkflow?.actionId;
  const referencedEntities = [
    ...resolvedEvent,
    ...(resolvedAction ? [{ kind: "pending_action" as const, id: resolvedAction }] : [])
  ];
  const lastUpdatedTurnIndex = Math.max(0, userTurns.at(-1)?.sourceTurnIndex ?? 0);
  return Object.freeze({
    schemaVersion: 1,
    ...(userTurns.at(-1) ? { activeTopic: Object.freeze(userTurns.at(-1)!) } : {}),
    ...(userGoal ? { userGoal: Object.freeze(userGoal) } : {}),
    ...(assistantQuestions.at(-1) ? { recentAssistantQuestion: Object.freeze(assistantQuestions.at(-1)!) } : {}),
    currentConstraints: Object.freeze(currentConstraints.map((item) => Object.freeze(item))),
    recentCorrections: Object.freeze(recentCorrections.map((item) => Object.freeze(item))),
    referencedEntities: Object.freeze(referencedEntities.map((item) => Object.freeze(item))),
    lastUpdatedTurnIndex
  });
}
