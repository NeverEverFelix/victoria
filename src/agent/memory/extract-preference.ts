import { parseExplicitDollarAmount } from "../../domain/financial-events/parse-explicit-amount.js";
import {
  isExplicitInterestCorrectionEvidence,
  isExplicitUserEvidence,
  isNeverStoreMemoryEvidence
} from "./conversational-memory-extractor.js";
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
  if (!isSafeDirectMemoryEvidence(message)) return null;

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

  const activityMapping = extractActivitySpendMapping(message);
  if (activityMapping) return activityMapping;
  const interestSpend = extractInterestSpendMemories(message)[0] ?? extractInterestSpend(message);
  if (interestSpend) return interestSpend;

  const merchantSpend = extractMerchantSpendClaim(message);
  if (merchantSpend && !merchantSpend.isSpeculative && merchantSpend.confidence >= 0.85) {
    return {
      category: "habit",
      key: merchantSpendMemoryKey(merchantSpend.merchantName),
      value: `Usually spends ${formatAmount(merchantSpend.amountCents)} at ${merchantSpend.merchantName}.`,
      evidence: message,
      confidence: merchantSpend.confidence
    };
  }
  if (isUncertain(message)) return null;
  const interest = extractExplicitInterest(message);
  if (interest) return interest;
  if (/\$\s*\d[\d,.]*.*\b(?:rather than|instead of|over)\b.*\$\s*\d[\d,.]*/i.test(message)) return null;

  const evidence = message.split(/[.!?](?:\s|$)/, 1)[0]?.trim() ?? "";
  const preference = /^\s*(?:actually,?\s*)?(?:i prefer|i'd prefer|i would prefer)\s+(?:a\s+|an\s+|the\s+)?(.+?)[.!?]*\s*$/i.exec(evidence);
  if (preference?.[1]) {
    const subject = preference[1].trim().replace(/[.!?]+$/, "");
    if (subject && !/^(?:not\s|to\s+avoid\s)/i.test(subject)) {
      return {
        category: "preference",
        key: preferenceKey(subject),
        value: `Prefers ${subject}.`,
        evidence,
        confidence: 0.95
      };
    }
  }

  const habit = /^\s*(?:on\s+weekdays,?\s*)?i\s+(?:(?:usually|often|typically|routinely|regularly)\s+)?(.+?)[.!?]*\s*$/i.exec(evidence);
  if (habit?.[1] && /\b(?:usually|often|typically|routinely|regularly|every day|every weekday|every week|each day|each week|on weekdays)\b/i.test(evidence)) {
    const action = habit[1].trim().replace(/[.!?]+$/, "");
    const merchantName = extractNamedMerchantFromHabit(action);
    return {
      category: "habit",
      key: merchantName ? merchantHabitMemoryKey(merchantName) : habitKey(action),
      value: `Regularly ${action}.`,
      evidence,
      confidence: 0.9
    };
  }

  const goal = /^\s*(?:my goal is (?:to )?|i am saving for |i'm saving for |i want to save for )(.+?)[.!?]*\s*$/i.exec(evidence);
  if (goal?.[1]) {
    const target = goal[1].trim().replace(/[.!?]+$/, "");
    return {
      category: "goal",
      key: goalKey(target),
      value: `Wants to save for ${target}.`,
      evidence,
      confidence: 0.95
    };
  }
  return null;
}

/** Capture only a direct user statement linking an activity to a transaction category or merchant. */
function extractActivitySpendMapping(message: string): ExtractedConversationalMemory | null {
  const reportedCategory = /^\s*(?:for\s+)?(.+?)\s+(?:spending|purchases?)\s+(?:shows up under|appears under|is categorized as|is listed under)\s+(.+?)\s+in my\s+(?:linked\s+)?transactions?\s*[.!?]*\s*$/i.exec(message);
  const explicitTarget = /^\s*for\s+(.+?),?\s+my transaction\s+(category|merchant)\s+is\s+(.+?)[.!?]*\s*$/i.exec(message);
  const naturalCategory = /^\s*i\s+(?:categorize|categorise|classify|tag|label)\s+(?:my\s+)?(.+?)\s+(?:spending|expenses?|purchases?)\s+(?:as|under)\s+(.+?)(?:\s+in\s+my\s+(?:linked\s+)?transactions?)?[.!?]*\s*$/i.exec(message);
  const categoryForActivity = /^\s*i\s+(?:use|put|file)\s+(.+?)\s+(?:as\s+)?(?:my\s+)?(?:transaction\s+)?category\s+(?:for|when tracking)\s+(.+?)(?:\s+(?:spending|expenses?|purchases?))?[.!?]*\s*$/i.exec(message);
  const merchantForActivity = /^\s*for\s+(.+?),?\s+i\s+(?:use|shop\s+at|make\s+purchases\s+at)\s+(.+?)\s+as\s+my\s+(?:transaction\s+)?merchant[.!?]*\s*$/i.exec(message);
  if (!reportedCategory && !explicitTarget && !naturalCategory && !categoryForActivity && !merchantForActivity) return null;
  const activity = (reportedCategory?.[1] ?? explicitTarget?.[1] ?? naturalCategory?.[1] ??
    categoryForActivity?.[2] ?? merchantForActivity?.[1] ?? "").trim();
  const target = (reportedCategory?.[2] ?? explicitTarget?.[3] ?? naturalCategory?.[2] ??
    categoryForActivity?.[1] ?? merchantForActivity?.[2] ?? "").trim().replace(/[.!?]+$/, "");
  const dimension = explicitTarget?.[2]?.toLocaleLowerCase("en-US") === "merchant" || merchantForActivity
    ? "merchant" : "category";
  const activityKey = slug(activity);
  const targetKey = slug(target);
  const sensitive = /\b(?:medical|health|clinic|hospital|therapy|therapist|political|politics|religious|religion|faith|church|mosque|synagogue|sexuality|race|ethnicity|immigration|visa|citizenship|bank|account|credit card|debit card|pharmacy|prescription)\b/i;
  if (!activityKey || activityKey.length > 60 || !targetKey || targetKey.length > 60 ||
      activity.length > 80 || target.length > 80 || sensitive.test(`${activity} ${target}`) ||
      /\b(?:maybe|might|possibly|not sure|unsure|guess|thinking about)\b/i.test(message)) return null;
  return {
    category: "financial_pattern",
    key: `activity_mapping:${activityKey}`,
    value: `Uses linked transaction ${dimension} “${target}” for ${activity} spending.`,
    evidence: message,
    confidence: 1,
    sourceType: "user_statement",
    sourceMetadata: { activity, dimension, target, profileKey: `financial_profile:${dimension}:${targetKey}` }
  };
}

/** Extract independently addressable memories from a direct interest list. */
export function extractConversationalMemories(message: string): readonly ExtractedConversationalMemory[] {
  const primary = extractConversationalMemory(message);
  if (primary?.key === "savings_contribution_amount") {
    const activityFacts = extractInterestSpendMemories(message);
    if (activityFacts.length > 0) return [primary, ...activityFacts].slice(0, 9);
    return [primary];
  }
  if (primary?.category === "financial_pattern" && primary.key.startsWith("interest_spend:")) {
    const activitySpends = extractInterestSpendMemories(message);
    if (activitySpends.length > 1) return activitySpends.map((fact) => ({ ...fact, evidence: message }));
  }
  if (!primary || primary.category !== "other" || !primary.key.startsWith("interest:")) {
    return primary ? [primary] : [];
  }
  const match = /^\s*(?:i\s+(?:(?:do not|don't|no longer)\s+(?:really\s+)?(?:love|like|enjoy)|(?:(?:really|really do)\s+)?(?:love|like|enjoy))|i(?:'m| am)\s+(?:(?:really|very)\s+)?into|my\s+hobbies\s+(?:include|are)|one of my hobbies is)\s+(.+?)[.!?]*\s*$/i.exec(message);
  if (!match?.[1]) return [primary];
  const activities = match[1].split(/\s*,\s*|\s+and\s+|\s*&\s*/i)
    .map((item) => item.trim().replace(/^and\s+/i, ""))
    .filter(Boolean);
  if (activities.length < 2 || activities.length > 8) return [primary];
  const correction = primary.sourceMetadata?.interestStatus === "inactive";
  const memories = activities.map((activity): ExtractedConversationalMemory | null => {
    if (activity.length > 80 || /\b(?:spend|spending|spent|saving|money|budget|finance|costs?|paid|bought|purchased)\b|\$\s*\d/i.test(activity)) return null;
    const keyPart = slug(activity);
    if (!keyPart || keyPart.length > 60) return null;
    return {
      category: "other",
      key: `interest:${keyPart}`,
      value: correction ? `No longer enjoys ${activity}.` : `Enjoys ${activity}.`,
      evidence: message,
      confidence: 0.95,
      sourceType: correction ? "user_correction" : "user_statement",
      ...(correction ? { sourceMetadata: { interestStatus: "inactive" } } : {})
    };
  }).filter((item): item is ExtractedConversationalMemory => item !== null);
  return memories.length > 0 ? memories : [primary];
}

function extractInterestSpend(message: string): ExtractedConversationalMemory | null {
  if (isUncertain(message)) return null;
  const amountText = String.raw`(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
  const cadenceText = String.raw`(session|week|month|year|day|visit|class|trip)s?`;
  const beforeActivity = new RegExp(
    String.raw`^\s*i\s+(?:(?:usually|typically|often|regularly)\s+)?spend\s+(?:(?:about|around|approximately)\s+)?\$${amountText}\s+(?:per|a|each|\/)\s*${cadenceText}\s+(?:on|for)\s+(.+?)[.!?]*\s*$`, "i"
  );
  const afterActivity = new RegExp(
    String.raw`^\s*i\s+(?:(?:usually|typically|often|regularly)\s+)?spend\s+(?:(?:about|around|approximately)\s+)?\$${amountText}\s+(?:on|for)\s+(.+?)\s+(?:per|a|each)\s*${cadenceText}[.!?]*\s*$`, "i"
  );
  const match = beforeActivity.exec(message) ?? afterActivity.exec(message);
  if (!match) return null;
  const amount = parseExplicitDollarAmount(`$${match[1]}`);
  const cadenceName = match[2]?.toLocaleLowerCase("en-US").replace(/s$/, "");
  const activityName = match[3]?.trim().replace(/[.!?]+$/, "");
  if (amount.status !== "valid" || !activityName || activityName.length > 80 || !cadenceName ||
      /\b(?:rather than|instead of|on my|at the)\b/i.test(activityName)) return null;
  const keyPart = slug(activityName);
  if (!keyPart || keyPart.length > 60) return null;
  return {
    category: "financial_pattern",
    key: `interest_spend:${keyPart}`,
    value: `Usually spends ${formatAmount(amount.amountCents)} per ${cadenceName} on ${activityName}.`,
    evidence: message,
    confidence: 0.95,
    sourceType: "user_statement",
    sourceMetadata: { activity: activityName, cadence: cadenceName, currency: "USD" }
  };
}

/** Extract independently addressable recurring spend facts when a turn states several. */
function extractInterestSpendMemories(message: string): ExtractedConversationalMemory[] {
  const clauses = message.split(/\s*(?:[,;]|\.(?=\s+(?:i\s+)?(?:(?:usually|typically|often|regularly)\s+)?spend\b)|\band\b)\s*(?=(?:i\s+)?(?:(?:usually|typically|often|regularly)\s+)?(?:spend\b|\$))/i)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .map((clause) => /^\$/.test(clause) ? `I spend ${clause}` : /^spend\b/i.test(clause) ? `I ${clause}` : clause);
  return clauses.map(extractInterestSpend)
    .filter((fact): fact is ExtractedConversationalMemory => fact !== null)
    .map((fact) => ({ ...fact, evidence: message }));
}

function extractExplicitInterest(message: string): ExtractedConversationalMemory | null {
  if (isUncertain(message)) return null;
  const correction = /^\s*i\s+(?:do not|don't|no longer)\s+(?:really\s+)?(?:love|like|enjoy)\s+(.+?)(?:\s+anymore)?[.!?]*\s*$/i.exec(message);
  const match = correction ?? /^\s*i\s+(?:(?:really|really do)\s+)?(?:love|like|enjoy)\s+(.+?)[.!?]*\s*$/i.exec(message) ??
    /^\s*i(?:'m| am)\s+(?:(?:really|very)\s+)?into\s+(.+?)[.!?]*\s*$/i.exec(message) ??
    /^\s*my\s+hobbies\s+(?:include|are)\s+(.+?)[.!?]*\s*$/i.exec(message) ??
    /^\s*one of my hobbies is\s+(.+?)[.!?]*\s*$/i.exec(message);
  const embeddedMatch = match ? null : /\bi\s+(?:(?:really|really do)\s+)?(?:like|love|enjoy)\s+(?:to\s+)?(?:play\s+)?([a-z][a-z -]{0,59}?)(?=\s+(?:at|and|but|because|that|while|now)\b|[,;.!?]|$)/i.exec(message);
  const activity = (match?.[1] ?? embeddedMatch?.[1])?.trim()
    .split(/\s*,\s*|\s+(?:and|&)\s+/i, 1)[0]
    ?.replace(/[.!?]+$/, "");
  if (!activity || activity.length > 80 || /\b(?:spend|spending|spent|saving|money|budget|finance|costs?|paid|bought|purchased)\b|\$\s*\d/i.test(activity)) return null;
  const keyPart = slug(activity);
  if (!keyPart || keyPart.length > 60) return null;
  return {
    category: "other",
    key: `interest:${keyPart}`,
    value: correction ? `No longer enjoys ${activity}.` : `Enjoys ${activity}.`,
    evidence: embeddedMatch?.[0].trim() ?? message,
    confidence: 0.95,
    sourceType: correction ? "user_correction" : "user_statement",
    ...(correction ? { sourceMetadata: { interestStatus: "inactive" } } : {})
  };
}

/** Detects a direct conversational correction of a remembered past spend, not an estimate or new proposal. */
export function extractConversationalSpendCorrection(message: string): ConversationalSpendCorrection | null {
  if (!/\b(?:actually\b|that's not right\b|that isn't right\b|that's wrong\b|i was wrong\b)/i.test(message) ||
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
  if (isUncertain(message)) return null;
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

function isSafeDirectMemoryEvidence(message: string): boolean {
  if (!message.trim() || isUncertain(message) || isNeverStoreMemoryEvidence(message) ||
      /^\s*["“'‘].*["”'’]\s*$/s.test(message)) return false;
  return isExplicitUserEvidence(message, message) || isExplicitInterestCorrectionEvidence(message, message);
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
