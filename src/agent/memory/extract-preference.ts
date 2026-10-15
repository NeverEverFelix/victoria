import { parseExplicitDollarAmount } from "../../domain/financial-events/parse-explicit-amount.js";
import type { ConversationalMemory } from "./types.js";

export interface SavingsAmountPreference {
  readonly preferredAmountCents: number;
  readonly comparisonAmountCents: number;
}

export type ExtractedConversationalMemory = Omit<ConversationalMemory, "id" | "createdAt" | "supersedesId">;

export interface MerchantSpendClaim {
  readonly amountCents: number;
  readonly merchantName: string;
  readonly confidence: number;
  readonly isSpeculative: boolean;
}

export interface ConversationalSpendCorrection {
  readonly amountCents: number;
  readonly scopeText: string;
}

const amount = String.raw`\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const preferencePattern = new RegExp(
  String.raw`\b(?:i prefer|i'd prefer|i would prefer)\s+(?:(?:to\s+)?save|saving|setting aside|to set aside|putting aside|to put aside)\s+${amount}\s+(?:rather than|instead of|over)\s+${amount}(?:\s+at a time)?\b`,
  "i"
);

/** Extract only explicit, certain, USD contribution preferences stated by the user. */
export function extractSavingsAmountPreference(message: string): SavingsAmountPreference | null {
  if (isUncertain(message)) return null;
  const match = preferencePattern.exec(message);
  if (!match?.[1] || !match[2]) return null;
  const preferred = parseExplicitDollarAmount(`$${match[1]}`);
  const comparison = parseExplicitDollarAmount(`$${match[2]}`);
  if (preferred.status !== "valid" || comparison.status !== "valid" ||
      preferred.amountCents === comparison.amountCents) return null;
  return Object.freeze({
    preferredAmountCents: preferred.amountCents,
    comparisonAmountCents: comparison.amountCents
  });
}

/** Extract a narrow set of direct preferences, recurring habits, and stated goals. */
export function extractConversationalMemory(message: string): ExtractedConversationalMemory | null {
  const merchantSpend = extractMerchantSpendClaim(message);
  if (merchantSpend) {
    return {
      category: "habit",
      key: merchantSpendMemoryKey(merchantSpend.merchantName),
      value: `Usually spends ${formatAmount(merchantSpend.amountCents)} at ${merchantSpend.merchantName}.`,
      evidence: message,
      confidence: merchantSpend.confidence
    };
  }
  if (isUncertain(message)) return null;
  const savingsPreference = extractSavingsAmountPreference(message);
  if (savingsPreference) {
    return {
      category: "preference",
      key: "savings_contribution_amount",
      value: `Prefers saving ${formatAmount(savingsPreference.preferredAmountCents)} rather than ${formatAmount(savingsPreference.comparisonAmountCents)} at a time.`,
      evidence: message,
      confidence: 1
    };
  }
  if (/\$\s*\d[\d,.]*.*\b(?:rather than|instead of|over)\b.*\$\s*\d[\d,.]*/i.test(message)) return null;

  const preference = /^\s*(?:actually,?\s*)?(?:i prefer|i'd prefer|i would prefer)\s+(?:a\s+|an\s+|the\s+)?(.+?)[.!?]*\s*$/i.exec(message);
  if (preference?.[1]) {
    const subject = preference[1].trim().replace(/[.!?]+$/, "");
    if (subject && !/^(?:not\s|to\s+avoid\s)/i.test(subject)) {
      return {
        category: "preference",
        key: preferenceKey(subject),
        value: `Prefers ${subject}.`,
        evidence: message,
        confidence: 0.95
      };
    }
  }

  const habit = /^\s*(?:on\s+weekdays,?\s*)?i\s+(?:(?:usually|often|typically|routinely|regularly)\s+)?(.+?)[.!?]*\s*$/i.exec(message);
  if (habit?.[1] && /\b(?:usually|often|typically|routinely|regularly|every day|every weekday|every week|each day|each week|on weekdays)\b/i.test(message)) {
    const action = habit[1].trim().replace(/[.!?]+$/, "");
    const merchantName = extractNamedMerchantFromHabit(action);
    return {
      category: "habit",
      key: merchantName ? merchantHabitMemoryKey(merchantName) : habitKey(action),
      value: `Regularly ${action}.`,
      evidence: message,
      confidence: 0.9
    };
  }

  const goal = /^\s*(?:my goal is (?:to )?|i am saving for |i'm saving for |i want to save for )(.+?)[.!?]*\s*$/i.exec(message);
  if (goal?.[1]) {
    const target = goal[1].trim().replace(/[.!?]+$/, "");
    return {
      category: "goal",
      key: goalKey(target),
      value: `Wants to save for ${target}.`,
      evidence: message,
      confidence: 0.95
    };
  }
  return null;
}

/** Detects a direct conversational correction of a remembered past spend, not an estimate or new proposal. */
export function extractConversationalSpendCorrection(message: string): ConversationalSpendCorrection | null {
  if (!/\b(?:no\b|actually\b|that's not right\b|that isn't right\b|that's wrong\b|i was wrong\b)/i.test(message) ||
      !/\b(?:i\s+)?(?:actually\s+)?(?:spent|paid|was charged|got charged)\b/i.test(message)) return null;
  const parsed = parseExplicitDollarAmount(message);
  if (parsed.status !== "valid") return null;
  const scopeText = message.match(/\b(?:that day|that night|yesterday|today|on\s+[a-z]+\s+\d{1,2}(?:,\s*\d{4})?|last\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i)?.[0] ?? "the referenced day";
  return Object.freeze({ amountCents: parsed.amountCents, scopeText });
}

export function merchantSpendMemoryKey(merchantName: string): string {
  return `merchant_spend:${slug(merchantName)}`;
}

export function merchantHabitMemoryKey(merchantName: string): string {
  return `merchant_habit:${slug(merchantName)}`;
}

export function extractMerchantSpendClaim(message: string): MerchantSpendClaim | null {
  const amountPattern = String.raw`\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
  const routine = new RegExp(String.raw`^\s*i\s+(?:usually|often|typically|regularly)\s+spend\s+${amountPattern}\s+(?:at|on)\s+(.+?)(?:\s+for\s+.+)?[.!?]*\s*$`, "i");
  const estimate = new RegExp(String.raw`^\s*i\s+(?:think|estimate|theorize|guess)\s+(?:that\s+)?i\s+(?:usually\s+)?spend\s+(?:(?:about|around)\s+)?${amountPattern}\s+(?:at|on)\s+(.+?)(?:\s+for\s+.+)?[.!?]*\s*$`, "i");
  const usualSpend = new RegExp(String.raw`^\s*my\s+(?:usual|typical)\s+spend\s+(?:at|on)\s+(.+?)\s+(?:is|runs|costs)\s+(?:(?:about|around|approximately)\s+)?${amountPattern}[.!?]*\s*$`, "i");
  const routineMatch = routine.exec(message);
  const estimateMatch = estimate.exec(message);
  const usualSpendMatch = usualSpend.exec(message);
  const amountText = routineMatch?.[1] ?? estimateMatch?.[1] ?? usualSpendMatch?.[2];
  const merchantText = routineMatch?.[2] ?? estimateMatch?.[2] ?? usualSpendMatch?.[1];
  if (!amountText || !merchantText) return null;
  const parsed = parseExplicitDollarAmount(`$${amountText}`);
  const merchantName = merchantText.trim().replace(/[.!?]+$/, "");
  if (parsed.status !== "valid" || !merchantName || merchantName.length > 60) return null;
  const isSpeculative = !routineMatch && !usualSpendMatch;
  if (!isSpeculative && isUncertain(message)) return null;
  return {
    amountCents: parsed.amountCents,
    merchantName,
    confidence: isSpeculative ? 0.55 : 0.95,
    isSpeculative
  };
}

function isUncertain(message: string): boolean {
  return /\b(?:maybe|might|possibly|not sure|unsure|i guess|could|should i|someday|eventually|thinking about|considering)\b/i.test(message);
}

function preferenceKey(subject: string): string {
  if (/\b(?:saving|savings|weekly|monthly|daily)\b/i.test(subject) && /\b(?:goal|plan|target|amount)\b/i.test(subject)) return "savings_goal_style";
  if (/\breminders?\b/i.test(subject)) return "reminder_style";
  return `preference:${slug(subject)}`;
}

function habitKey(action: string): string {
  if (/\bcoffee\b/i.test(action)) return "coffee_routine";
  if (/\b(?:takeout|delivery|doordash|eating out)\b/i.test(action)) return "takeout_routine";
  return `habit:${slug(action)}`;
}

function extractNamedMerchantFromHabit(action: string): string | null {
  const match = /\b(?:at|from|through|via)\s+(.+?)(?=\s+(?:on|in|during|every|each|before|after|weekday|weekend|daily|weekly)\b|[,;.!?]|$)/i.exec(action);
  const merchantName = match?.[1]?.trim();
  if (!merchantName || /^(?:home|work|school|office|the office|gym|the gym|restaurant|a restaurant|restaurants|the store|a store)$/i.test(merchantName)) {
    return null;
  }
  return merchantName;
}

function goalKey(target: string): string {
  if (/\bemergency fund\b/i.test(target)) return "emergency_fund";
  const topic = target
    .replace(/\$?\d[\d,]*(?:\.\d{1,2})?/g, " ")
    .replace(/\b(?:save|saving|build|create|fund|reach|for|to|a|an|the)\b/gi, " ");
  return `goal:${slug(topic || target)}`;
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80);
}

function formatAmount(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}
