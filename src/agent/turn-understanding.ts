import type { ConversationContextSnapshot } from "./conversation-responder.js";
import type { ConversationIntentPlan } from "./conversation-intent-plan.js";

export const TURN_UNDERSTANDING_VERSION = 1 as const;

export type TurnPrimaryIntent =
  | "dialogue"
  | "financial_reflection"
  | "planning"
  | "savings_moment"
  | "workflow_action"
  | "memory_control"
  | "unclear";

export type TurnRequestedAction =
  | "none"
  | "propose_savings"
  | "approval_attempt"
  | "decline_attempt"
  | "revise"
  | "real_transfer_request";

/** Model interpretation only. It contains no amount, target ID, permission, or executable tool call. */
export interface AdvisoryTurnPlan {
  readonly schemaVersion: typeof TURN_UNDERSTANDING_VERSION;
  readonly primaryIntent: TurnPrimaryIntent;
  readonly secondaryIntents: readonly TurnPrimaryIntent[];
  readonly dialogueActs: readonly (
    | "question"
    | "answer"
    | "personal_update"
    | "reflection"
    | "correction"
    | "topic_switch"
    | "confirmation_attempt"
    | "decline_attempt"
  )[];
  readonly questionFocus?: string;
  readonly references: readonly {
    readonly phrase: string;
    readonly kind: "prior_topic" | "financial_fact" | "pending_workflow" | "historical_event" | "unknown";
    readonly confidence: "clear" | "ambiguous" | "unresolved";
  }[];
  readonly requestedReadOnlyTools: readonly ("financial_profile" | "savings_history" | "calculator")[];
  readonly actionMention: "none" | "mock_ledger" | "real_money" | "goal_allocation" | "correction" | "unclear";
  /** An untrusted description; explicit deterministic approval policy remains authoritative. */
  readonly requestedAction: TurnRequestedAction;
  readonly uncertainty: {
    readonly needsClarification: boolean;
    readonly reasons: readonly string[];
  };
}

export interface TurnUnderstandingProvider {
  understandTurn(input: { readonly contextSnapshot: ConversationContextSnapshot }): Promise<unknown>;
}

export async function interpretConversationTurn(input: {
  readonly contextSnapshot: ConversationContextSnapshot;
  readonly fallback: ConversationIntentPlan;
  readonly provider?: TurnUnderstandingProvider;
}): Promise<{ readonly plan: AdvisoryTurnPlan; readonly source: "model" | "fallback"; readonly failure?: "unavailable" | "invalid_output" }> {
  if (!input.provider) return Object.freeze({ plan: deterministicAdvisoryPlan(input.fallback), source: "fallback" });
  try {
    const plan = validateAdvisoryTurnPlan(await input.provider.understandTurn({ contextSnapshot: input.contextSnapshot }));
    return plan
      ? Object.freeze({ plan, source: "model" })
      : Object.freeze({ plan: deterministicAdvisoryPlan(input.fallback), source: "fallback", failure: "invalid_output" });
  } catch {
    return Object.freeze({ plan: deterministicAdvisoryPlan(input.fallback), source: "fallback", failure: "unavailable" });
  }
}

function deterministicAdvisoryPlan(plan: ConversationIntentPlan): AdvisoryTurnPlan {
  const primaryIntent: TurnPrimaryIntent = plan.intents.includes("memory_control") ? "memory_control"
    : plan.intents.includes("savings_proposal") ? "workflow_action"
    : plan.actionRequest.kind !== "none" ? "planning"
    : plan.intents.includes("financial_analysis") ? "financial_reflection"
    : plan.intents.includes("dialogue") ? "dialogue" : "unclear";
  const secondaryIntents = plan.intents.flatMap((intent): TurnPrimaryIntent[] => {
    if (intent === "dialogue") return ["dialogue"];
    if (intent === "financial_analysis") return ["financial_reflection"];
    if (intent === "savings_proposal") return ["workflow_action"];
    if (intent === "memory_control") return ["memory_control"];
    return [];
  });
  const dialogueActs: AdvisoryTurnPlan["dialogueActs"] = [
    ...(plan.dialogueActs.includes("ask_question") ? ["question" as const] : []),
    ...(plan.dialogueActs.includes("answer_question") ? ["answer" as const] : []),
    ...(plan.dialogueActs.includes("provide_context") ? ["personal_update" as const] : []),
    ...(plan.dialogueActs.includes("attempt_confirmation") ? ["confirmation_attempt" as const] : []),
    ...(plan.dialogueActs.includes("attempt_decline") ? ["decline_attempt" as const] : []),
    ...(plan.dialogueActs.includes("revise") ? ["correction" as const] : []),
    ...(plan.dialogueActs.includes("change_topic") ? ["topic_switch" as const] : []),
    ...(plan.expressesUncertainty ? ["reflection" as const] : [])
  ];
  const requestedAction: TurnRequestedAction = plan.actionRequest.kind === "real_money_movement" ? "real_transfer_request"
    : plan.actionRequest.kind === "mock_ledger_record" || plan.requestedActions.length > 0 ? "propose_savings"
    : plan.dialogueActs.includes("attempt_confirmation") ? "approval_attempt"
    : plan.dialogueActs.includes("attempt_decline") ? "decline_attempt"
    : plan.dialogueActs.includes("revise") ? "revise" : "none";
  return Object.freeze({
    schemaVersion: TURN_UNDERSTANDING_VERSION,
    primaryIntent,
    secondaryIntents: Object.freeze([...new Set(secondaryIntents.filter((intent) => intent !== primaryIntent))]),
    dialogueActs: Object.freeze(dialogueActs.length ? dialogueActs : ["reflection" as const]),
    ...(plan.readOnlyQuestions[0] ? { questionFocus: plan.readOnlyQuestions[0].slice(0, 240) } : {}),
    references: Object.freeze(plan.referentHints.slice(0, 8).map((phrase) => Object.freeze({
      phrase: phrase.slice(0, 120), kind: "unknown" as const, confidence: "unresolved" as const
    }))),
    requestedReadOnlyTools: Object.freeze([]),
    actionMention: (plan.actionRequest.kind === "real_money_movement" ? "real_money"
      : plan.actionRequest.kind === "mock_ledger_record" ? "mock_ledger"
      : plan.intents.includes("savings_proposal") ? "goal_allocation"
      : plan.intents.includes("correction") ? "correction" : "none") as AdvisoryTurnPlan["actionMention"],
    requestedAction,
    uncertainty: Object.freeze({
      needsClarification: plan.needsClarification || plan.ambiguous,
      reasons: Object.freeze(plan.unresolvedReferences.slice(0, 8))
    })
  });
}

const primaryIntents = new Set<TurnPrimaryIntent>([
  "dialogue", "financial_reflection", "planning", "savings_moment", "workflow_action", "memory_control", "unclear"
]);
const dialogueActs = new Set([
  "question", "answer", "personal_update", "reflection", "correction", "topic_switch", "confirmation_attempt", "decline_attempt"
]);
const referenceKinds = new Set(["prior_topic", "financial_fact", "pending_workflow", "historical_event", "unknown"]);
const referenceConfidence = new Set(["clear", "ambiguous", "unresolved"]);
const actionMentions = new Set(["none", "mock_ledger", "real_money", "goal_allocation", "correction", "unclear"]);
const requestedActions = new Set<TurnRequestedAction>([
  "none", "propose_savings", "approval_attempt", "decline_attempt", "revise", "real_transfer_request"
]);
const readOnlyTools = new Set(["financial_profile", "savings_history", "calculator"]);

/** Strictly validate provider output before any application code can consult it. */
export function validateAdvisoryTurnPlan(value: unknown): AdvisoryTurnPlan | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "primaryIntent", "secondaryIntents", "dialogueActs", "questionFocus", "references", "requestedReadOnlyTools", "actionMention", "requestedAction", "uncertainty"]) ||
      value.schemaVersion !== TURN_UNDERSTANDING_VERSION ||
      !isIntent(value.primaryIntent) || !isIntentArray(value.secondaryIntents) ||
      !isStringArrayIn(value.dialogueActs, dialogueActs, 8) ||
      (value.questionFocus !== null && !isBoundedString(value.questionFocus, 240)) ||
      !Array.isArray(value.references) || value.references.length > 8 ||
      !value.references.every(isReference) || !isStringArrayIn(value.requestedReadOnlyTools, readOnlyTools, 3) ||
      !isStringIn(value.actionMention, actionMentions) ||
      !isStringIn(value.requestedAction, requestedActions) || !isRecord(value.uncertainty) ||
      !hasOnlyKeys(value.uncertainty, ["needsClarification", "reasons"]) ||
      typeof value.uncertainty.needsClarification !== "boolean" ||
      !isBoundedStringArray(value.uncertainty.reasons, 8, 120)) return undefined;

  return Object.freeze({
    schemaVersion: TURN_UNDERSTANDING_VERSION,
    primaryIntent: value.primaryIntent,
    secondaryIntents: Object.freeze([...new Set(value.secondaryIntents)]),
    dialogueActs: Object.freeze([...new Set(value.dialogueActs)] as AdvisoryTurnPlan["dialogueActs"]),
    ...(typeof value.questionFocus === "string" ? { questionFocus: value.questionFocus } : {}),
    references: Object.freeze(value.references.map((reference) => Object.freeze({
      phrase: reference.phrase,
      kind: reference.kind,
      confidence: reference.confidence
    }))),
    requestedReadOnlyTools: Object.freeze([...new Set(value.requestedReadOnlyTools)] as AdvisoryTurnPlan["requestedReadOnlyTools"]),
    actionMention: value.actionMention as AdvisoryTurnPlan["actionMention"],
    requestedAction: value.requestedAction,
    uncertainty: Object.freeze({
      needsClarification: value.uncertainty.needsClarification,
      reasons: Object.freeze([...new Set(value.uncertainty.reasons)])
    })
  });
}

function isReference(value: unknown): value is AdvisoryTurnPlan["references"][number] {
  return isRecord(value) && hasOnlyKeys(value, ["phrase", "kind", "confidence"]) && isBoundedString(value.phrase, 120) &&
    isStringIn(value.kind, referenceKinds) && isStringIn(value.confidence, referenceConfidence);
}

function isIntent(value: unknown): value is TurnPrimaryIntent {
  return isStringIn(value, primaryIntents);
}

function isIntentArray(value: unknown): value is TurnPrimaryIntent[] {
  return Array.isArray(value) && value.length <= 6 && value.every(isIntent);
}

function isStringArrayIn(value: unknown, allowed: Set<string>, limit: number): value is string[] {
  return Array.isArray(value) && value.length <= limit && value.every((item) => isStringIn(item, allowed));
}

function isBoundedStringArray(value: unknown, limit: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= limit && value.every((item) => isBoundedString(item, maxLength));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isStringIn<T extends string>(value: unknown, allowed: Set<T>): value is T {
  return typeof value === "string" && allowed.has(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}
