/** Historical user-authored context retained separately from the rolling transcript and personal memory. */
export interface DialogueWorkingTurn {
  readonly sourceTurnId: string;
  readonly text: string;
  readonly createdAt: string;
  readonly kind: "question" | "constraint" | "correction" | "decision" | "topic";
}

export interface DialogueWorkingState {
  readonly schemaVersion: 1;
  readonly conversationId: string;
  readonly turns: readonly DialogueWorkingTurn[];
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export const DIALOGUE_WORKING_STATE_TURN_LIMIT = 40;
export const DIALOGUE_WORKING_STATE_TTL_MS = 30 * 24 * 60 * 60_000;
const DIALOGUE_TURN_TEXT_LIMIT = 700;

export function appendDialogueWorkingTurn(input: {
  readonly state?: DialogueWorkingState | undefined;
  readonly conversationId: string;
  readonly sourceTurnId: string;
  readonly text: string;
  readonly createdAt?: string;
  readonly now?: Date;
}): DialogueWorkingState | undefined {
  const conversationId = input.conversationId.trim();
  const sourceTurnId = input.sourceTurnId.trim();
  const text = input.text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, DIALOGUE_TURN_TEXT_LIMIT);
  if (!conversationId || !sourceTurnId || !text || containsSensitiveDialogueData(text)) return undefined;

  const now = input.now ?? new Date();
  const createdAt = validTimestamp(input.createdAt) ?? now.toISOString();
  const previous = input.state?.schemaVersion === 1 && input.state.conversationId === conversationId &&
    Date.parse(input.state.expiresAt) > now.getTime()
    ? input.state.turns.filter(isDialogueWorkingTurn)
    : [];
  const turns = previous.some((turn) => turn.sourceTurnId === sourceTurnId)
    ? previous
    : [...previous, Object.freeze({ sourceTurnId, text, createdAt, kind: classifyDialogueTurn(text) })];
  return Object.freeze({
    schemaVersion: 1,
    conversationId,
    turns: Object.freeze(turns.slice(-DIALOGUE_WORKING_STATE_TURN_LIMIT)),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DIALOGUE_WORKING_STATE_TTL_MS).toISOString()
  });
}

/** Selects source-linked historical user turns for continuity; returned text is never financial evidence or action authority. */
export function selectRelevantDialogueWorkingTurns(
  turns: readonly DialogueWorkingTurn[],
  query: string,
  limit = 6
): readonly DialogueWorkingTurn[] {
  const boundedLimit = Math.max(0, Math.min(Number.isSafeInteger(limit) ? limit : 6, 8));
  if (boundedLimit === 0) return Object.freeze([]);
  const queryTokens = new Set(dialogueTokens(query));
  const scored = turns.map((turn, index) => ({
    turn,
    index,
    score: dialogueTokens(turn.text).filter((token) => queryTokens.has(token)).length
  }));
  const relevant = scored.filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, boundedLimit);
  const recent = turns.slice(-Math.min(2, boundedLimit));
  const selectedIds = new Set(recent.map(({ sourceTurnId }) => sourceTurnId));
  for (const { turn } of relevant) {
    if (selectedIds.size >= boundedLimit) break;
    selectedIds.add(turn.sourceTurnId);
  }
  return Object.freeze(turns.filter((turn) => selectedIds.has(turn.sourceTurnId))
    .slice(-boundedLimit).map((turn) => Object.freeze({ ...turn })));
}

export function isDialogueWorkingState(value: unknown, conversationId?: string): value is DialogueWorkingState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DialogueWorkingState>;
  const updatedAt = validTimestamp(candidate.updatedAt);
  const expiresAt = validTimestamp(candidate.expiresAt);
  return candidate.schemaVersion === 1 && typeof candidate.conversationId === "string" &&
    (!conversationId || candidate.conversationId === conversationId) &&
    Array.isArray(candidate.turns) && candidate.turns.length <= DIALOGUE_WORKING_STATE_TURN_LIMIT &&
    candidate.turns.every(isDialogueWorkingTurn) && updatedAt !== undefined && expiresAt !== undefined &&
    Date.parse(expiresAt) > Date.parse(updatedAt);
}

function isDialogueWorkingTurn(value: unknown): value is DialogueWorkingTurn {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DialogueWorkingTurn>;
  return typeof candidate.sourceTurnId === "string" && candidate.sourceTurnId.trim().length > 0 &&
    typeof candidate.text === "string" && candidate.text.trim().length > 0 &&
    candidate.text.length <= DIALOGUE_TURN_TEXT_LIMIT && validTimestamp(candidate.createdAt) !== undefined &&
    ["question", "constraint", "correction", "decision", "topic"].includes(candidate.kind ?? "");
}

function validTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function dialogueTokens(value: string): string[] {
  return value.toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]{3,}/gu) ?? [];
}

function containsSensitiveDialogueData(value: string): boolean {
  return /\b(?:diagnos(?:is|ed)|diabetes|cancer|medication|prescription|medical|health condition|mental health|therapy|therapist|disability|political|politics|religious|religion|faith|church|mosque|synagogue|sexuality|sexual orientation|gender identity|race|ethnicity|immigration|visa status|citizenship status|account number|routing number|card number|credit card number|debit card number|bank login|security code|social security|ssn|password|passcode|pin number)\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|(?=(?:\D*\d){10})\+?\d[\d .()-]{8,}\d/i.test(value);
}

function classifyDialogueTurn(text: string): DialogueWorkingTurn["kind"] {
  if (/^\s*(?:actually|correction|i meant|to correct that|i should have said)\b/i.test(text) ||
      /\b(?:actually i|i meant|i should have said|to correct that)\b/i.test(text)) return "correction";
  if (/\b(?:i (?:can't|cannot|won't|don't want|do not want|prefer|need)|i have to|only if|it has to)\b/i.test(text)) {
    return "constraint";
  }
  if (/\b(?:i decided to|i chose to|i plan to|i'm going to|i am going to)\b/i.test(text)) return "decision";
  if (/[?？]/.test(text) || /^(?:what|why|how|when|where|who|can|could|would|should|do|does|did|is|are|am)\b/i.test(text)) {
    return "question";
  }
  return "topic";
}
