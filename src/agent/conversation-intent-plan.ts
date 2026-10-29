import { calculateReadOnlySavingsQuestion } from "./read-only-calculator.js";
import {
  independentOrdinaryQuestion,
  isExplicitFinancialActionQuestion,
  isOrdinaryQuestion,
  isConversationTopicTurn,
  isReadOnlyFinancialReflection,
  isExplicitReadOnlyTopicSwitch
} from "./conversation-routing.js";

export type ConversationIntent = "dialogue" | "financial_analysis" | "savings_proposal" | "correction" | "memory_control";

export interface ConversationIntentPlan {
  readonly schemaVersion: 1;
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
}): ConversationIntentPlan {
  const message = input.message.trim();
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

  return Object.freeze({
    schemaVersion: 1,
    intents: Object.freeze([...new Set(intents)]),
    requestedActions: Object.freeze(directProposalInstruction
      ? [Object.freeze({ kind: "propose_savings" as const, sourceText: message.slice(0, 500) })] : []),
    readOnlyQuestions: Object.freeze(readOnlyQuestions),
    unresolvedReferences: Object.freeze(unresolvedReferences),
    needsClarification: unresolvedReferences.length > 0 || (actionMention && !directProposalInstruction && !hasTopic && !actionQuestion)
  });
}

/** Only read-only dialogue with no requested mutation can use this path. */
export function mayDispatchConversationIntent(plan: ConversationIntentPlan): boolean {
  return plan.intents.includes("dialogue") && plan.requestedActions.length === 0 && !plan.needsClarification;
}
