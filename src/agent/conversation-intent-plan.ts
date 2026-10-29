import { calculateReadOnlySavingsQuestion } from "./read-only-calculator.js";
import type { AdvisoryTurnPlan } from "./turn-understanding.js";
import {
  independentOrdinaryQuestion,
  isExplicitFinancialActionQuestion,
  isOrdinaryQuestion,
  isConversationTopicTurn,
  isReadOnlyFinancialReflection,
  isExplicitReadOnlyTopicSwitch,
  shouldRouteToConversationResponder
} from "./conversation-routing.js";

export type ConversationIntent = "dialogue" | "financial_analysis" | "savings_proposal" | "correction" | "memory_control";
export type DialogueAct =
  | "ask_question"
  | "answer_question"
  | "provide_context"
  | "attempt_confirmation"
  | "attempt_decline"
  | "revise"
  | "change_topic"
  | "express_uncertainty"
  | "other";
export type WorkflowRelation = "none" | "references_pending" | "revises_pending" | "asks_about_pending" | "ambiguous";
/** A description of the user's wording, never permission to call a financial tool. */
export type DescriptiveActionRequest =
  | { readonly kind: "none" }
  | { readonly kind: "plan_only" }
  | { readonly kind: "mock_ledger_record"; readonly sourceText: string }
  | { readonly kind: "real_money_movement"; readonly sourceText: string };

export interface ConversationIntentPlan {
  readonly schemaVersion: 1;
  /** Descriptive dialogue interpretation only; these tags never authorize a mutation. */
  readonly dialogueActs: readonly DialogueAct[];
  readonly workflowRelation: WorkflowRelation;
  /** Coarse, descriptive action intent; policy and exact approval remain authoritative. */
  readonly actionRequest: DescriptiveActionRequest;
  readonly referentHints: readonly string[];
  readonly expressesUncertainty: boolean;
  readonly ambiguous: boolean;
  readonly intents: readonly ConversationIntent[];
  readonly requestedActions: readonly { readonly kind: "propose_savings"; readonly sourceText: string }[];
  readonly readOnlyQuestions: readonly string[];
  readonly unresolvedReferences: readonly string[];
  readonly needsClarification: boolean;
}

/**
 * Build a conservative contextual dispatch hint. It can identify work to do,
 * but never approves an action or supplies an amount/target to a workflow.
 */
export function buildConversationIntentPlan(input: {
  readonly message: string;
  readonly recentTurns?: readonly string[];
  readonly hasPendingWorkflow?: boolean;
}): ConversationIntentPlan {
  const message = input.message.trim();
  const lowerMessage = message.toLocaleLowerCase("en-US");
  const actionQuestion = isExplicitFinancialActionQuestion(message);
  const readOnlyQuestions: string[] = [];
  const independent = independentOrdinaryQuestion(message);
  if (independent) readOnlyQuestions.push(independent);
  else if (!actionQuestion && (isOrdinaryQuestion(message) || isReadOnlyFinancialReflection(message) ||
      isExplicitReadOnlyTopicSwitch(message) || calculateReadOnlySavingsQuestion(message))) {
    readOnlyQuestions.push(message);
  }

  const correction = /\b(?:actually|correction|i meant|revise|correct that|change that|change the amount|change the goal)\b/i.test(message);
  const memoryControl = /\b(?:forget|don't remember|do not remember|stop remembering|remember that)\b/i.test(message);
  const directProposalInstruction = !actionQuestion && (
    /\b(?:put|allocate|link|assign|apply)\b[^.!?]{0,100}\b(?:toward|to|for|goal|savings)\b/i.test(message) ||
    /\b(?:record|log|add)\b[^.!?]{0,80}\b(?:ledger|savings entry|saved)\b/i.test(message));
  const actionMention = /\b(?:record|log|add|transfer|deposit|withdraw|approve|confirm|allocate|link|assign)\b[^.!?]{0,60}\b(?:the|that|this|it|\$|entry|ledger|money|funds?|goal|savings)\b/i.test(message) ||
    /\b(?:the|that|this|it|\$|entry|ledger|money|funds?|goal|savings)\b[^.!?]{0,60}\b(?:record|log|add|transfer|deposit|withdraw|approve|confirm|allocate|link|assign)\b/i.test(message);
  const hasAmbiguousReference = /\b(?:that|it|the other one|the other bill|the other amount)\b/i.test(message) &&
    (input.recentTurns?.length ?? 0) > 0;
  const clearConversationIntent = isConversationTopicTurn(message) ||
    /\b(?:can we|i(?:'d| would| want to| only want to| just want to))\s+(?:talk|discuss|think)\b/i.test(message) ||
    /\bi (?:want|hope|plan|need) to save for\b/i.test(message) ||
    /\b(?:i feel|i'm feeling|i am feeling|i'm worried|i am worried|i regret|feel(?:ing)? (?:bad|guilty|ashamed|anxious|worried|stressed))\b/i.test(message);
  const hasTopic = readOnlyQuestions.length > 0 || clearConversationIntent;
  const attemptsConfirmation = /^(?:yes|yeah|yep|sure|okay|ok|correct|that's right|that is right|go ahead)(?:[.,!\s]|$)/i.test(message);
  const attemptsDecline = /^(?:no|nope|decline|cancel|not now|don't|do not)(?:[.!\s]|$)/i.test(message);
  const expressesUncertainty = /\b(?:maybe|perhaps|i think|not sure|unsure|i guess|whatever you think)\b/i.test(message);
  const negatesFinancialAction = /\b(?:don't|do not|never|not|without)\b[^.!?]{0,50}\b(?:transfer|move|deposit|withdraw|record|log|add)\b/i.test(message);
  const realMovementRequest = !negatesFinancialAction &&
    (/\b(?:transfer|move|deposit|withdraw)\b[^.!?]{0,60}\b(?:money|funds?|it|that|savings|account)\b|\b(?:move|transfer)\s+(?:it|that|the money|funds?)\b/i.test(message));
  const mockRecordRequest = !negatesFinancialAction && !realMovementRequest &&
    /\b(?:record|log|add)\b[^.!?]{0,80}\b(?:ledger|savings entry|saved|mock(?:ed)? entry)\b/i.test(message);
  const planOnly = !realMovementRequest && !mockRecordRequest && /\b(?:plan|planning|goal|save|saving|set aside|monthly target)\b/i.test(message);
  const revisionWording = correction || /\b(?:yes|yeah|sure)\s*,?\s*but\b|\b(?:instead|rather|make it|change to|use \$)\b/i.test(message);
  const changesTopic = isExplicitReadOnlyTopicSwitch(message) || isConversationTopicTurn(message);
  const lastTurnWasQuestion = (input.recentTurns ?? []).at(-1)
    ?.replace(/^Victoria:\s*/i, "").trim().endsWith("?") ?? false;
  const shortAnswer = message.length <= 100 && !actionQuestion && !directProposalInstruction;
  const dialogueActs = new Set<DialogueAct>();
  if (readOnlyQuestions.length > 0 || /^(?:what|why|how|when|where|who|can|could|would|should|do|does|did|is|are|am)\b/i.test(message)) {
    dialogueActs.add("ask_question");
  }
  if (lastTurnWasQuestion && shortAnswer) dialogueActs.add("answer_question");
  if (directCandidateContext(lowerMessage) || (!attemptsConfirmation && !attemptsDecline && !correction && !expressesUncertainty)) {
    dialogueActs.add("provide_context");
  }
  if (attemptsConfirmation) dialogueActs.add("attempt_confirmation");
  if (attemptsDecline) dialogueActs.add("attempt_decline");
  if (revisionWording) dialogueActs.add("revise");
  if (changesTopic) dialogueActs.add("change_topic");
  if (expressesUncertainty) dialogueActs.add("express_uncertainty");
  if (dialogueActs.size === 0) dialogueActs.add("other");

  const workflowRelation: WorkflowRelation = !input.hasPendingWorkflow
    ? "none"
    : revisionWording
    ? "revises_pending"
    : attemptsConfirmation || attemptsDecline
    ? "references_pending"
    : lastTurnWasQuestion && shortAnswer
    ? "references_pending"
    : readOnlyQuestions.length > 0 && /\b(?:pending|proposal|suggestion|that amount|this amount|it)\b/i.test(message)
    ? "asks_about_pending"
    : hasAmbiguousReference
    ? "ambiguous"
    : "none";
  const intents: ConversationIntent[] = [];
  if (hasTopic) intents.push("dialogue");
  if ([...readOnlyQuestions, message].some((question) =>
    /\$|\b(?:budget|bill|spend|saving|cost|amount|year|month|gym|grocery|groceries|money|financial|vacation)\b/i.test(question))) {
    intents.push("financial_analysis");
  }
  if (directProposalInstruction) intents.push("savings_proposal");
  if (correction) intents.push("correction");
  if (memoryControl) intents.push("memory_control");
  const unresolvedReferences = correction && hasAmbiguousReference ? ["financial_reference"] : [];
  const referentHints = hasAmbiguousReference ? ["unresolved_contextual_reference"] : [];
  const ambiguous = unresolvedReferences.length > 0 || hasAmbiguousReference ||
    (input.hasPendingWorkflow === true && attemptsConfirmation && revisionWording);
  const actionRequest: DescriptiveActionRequest = realMovementRequest
    ? Object.freeze({ kind: "real_money_movement", sourceText: message.slice(0, 500) })
    : mockRecordRequest
      ? Object.freeze({ kind: "mock_ledger_record", sourceText: message.slice(0, 500) })
      : planOnly ? Object.freeze({ kind: "plan_only" }) : Object.freeze({ kind: "none" });

  return Object.freeze({
    schemaVersion: 1,
    dialogueActs: Object.freeze([...dialogueActs]),
    workflowRelation,
    actionRequest,
    referentHints: Object.freeze(referentHints),
    expressesUncertainty,
    ambiguous,
    intents: Object.freeze([...new Set(intents)]),
    requestedActions: Object.freeze(directProposalInstruction
      ? [Object.freeze({ kind: "propose_savings" as const, sourceText: message.slice(0, 500) })] : []),
    readOnlyQuestions: Object.freeze(readOnlyQuestions),
    unresolvedReferences: Object.freeze(unresolvedReferences),
    needsClarification: unresolvedReferences.length > 0 || (actionMention && !directProposalInstruction && !hasTopic && !actionQuestion)
  });
}

function directCandidateContext(message: string): boolean {
  return /\b(?:i|my|we|our)\b/.test(message) &&
    !/\b(?:what|why|how|when|where|who|can|could|would|should)\b/.test(message);
}

/** Only read-only dialogue with no requested mutation can use this path. */
export function mayDispatchConversationIntent(plan: ConversationIntentPlan): boolean {
  return plan.intents.includes("dialogue") && plan.requestedActions.length === 0 && !plan.needsClarification;
}

/** The single read-only dialogue handoff; descriptive plans never grant workflow authority. */
export function shouldDispatchConversationIntent(
  plan: ConversationIntentPlan,
  message: string,
  advisoryPlan?: AdvisoryTurnPlan,
  classificationType?: string
): boolean {
  const deterministicReadOnly = mayDispatchConversationIntent(plan) &&
    (shouldRouteToConversationResponder(message) ||
      (plan.intents.includes("dialogue") && plan.readOnlyQuestions[0] === message.trim()));
  if (deterministicReadOnly) return true;

  const modelDescribesReadOnlyDialogue = advisoryPlan !== undefined &&
    (advisoryPlan.primaryIntent === "dialogue" || advisoryPlan.primaryIntent === "financial_reflection" ||
      advisoryPlan.primaryIntent === "planning") &&
    advisoryPlan.requestedAction === "none" && advisoryPlan.actionMention === "none" &&
    !advisoryPlan.uncertainty.needsClarification;
  const descriptiveRequestIsReadOnly = plan.actionRequest.kind === "none" || plan.actionRequest.kind === "plan_only";
  const deterministicSafetyAllowsReadOnly = classificationType === "general_finance" &&
    descriptiveRequestIsReadOnly && plan.requestedActions.length === 0 && !plan.needsClarification && !plan.ambiguous &&
    !plan.dialogueActs.includes("attempt_confirmation") && !plan.dialogueActs.includes("attempt_decline") && !plan.dialogueActs.includes("revise");
  return modelDescribesReadOnlyDialogue && deterministicSafetyAllowsReadOnly;
}
