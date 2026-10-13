import { parseExplicitDollarAmount } from "../../domain/financial-events/parse-explicit-amount.js";
import type { ConversationalMemory } from "./types.js";

export interface SavingsAmountPreference {
  readonly preferredAmountCents: number;
  readonly comparisonAmountCents: number;
}

export type ExtractedConversationalMemory = Omit<ConversationalMemory, "id" | "createdAt" | "evidence" | "supersedesId">;

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
  if (isUncertain(message)) return null;
  const savingsPreference = extractSavingsAmountPreference(message);
  if (savingsPreference) {
    return {
      category: "preference",
      key: "savings_contribution_amount",
      value: `Prefers saving ${formatAmount(savingsPreference.preferredAmountCents)} rather than ${formatAmount(savingsPreference.comparisonAmountCents)} at a time.`,
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
        confidence: 0.95
      };
    }
  }

  const habit = /^\s*(?:on\s+weekdays,?\s*)?i\s+(?:(?:usually|often|typically|routinely|regularly)\s+)?(.+?)[.!?]*\s*$/i.exec(message);
  if (habit?.[1] && /\b(?:usually|often|typically|routinely|regularly|every day|every weekday|every week|each day|each week|on weekdays)\b/i.test(message)) {
    const action = habit[1].trim().replace(/[.!?]+$/, "");
    return {
      category: "habit",
      key: habitKey(action),
      value: `Regularly ${action}.`,
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
      confidence: 0.95
    };
  }
  return null;
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
