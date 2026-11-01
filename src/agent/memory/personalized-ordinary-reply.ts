import { formatUsd } from "../../domain/money.js";
import type { ConversationalMemory, MemoryProvider } from "./types.js";
import { isRetrievableMemory, planMemoryRetrieval } from "./retrieval-planner.js";
import { isUsableEpisodicSummary, SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY } from "./episodic-summary.js";

export function personalizeOrdinaryReply(
  memory: Awaited<ReturnType<MemoryProvider["getMemoryForUser"]>>,
  fallbackMessage: string,
  userMessage: string,
  interestOnly = false
): string | undefined {
  const memories = memory.conversationalMemories ?? [];
  const inactiveInterests = new Set(memories
    .filter((item) => item.key.startsWith("interest:") && item.sourceMetadata?.interestStatus === "inactive")
    .map((item) => memoryTopicLabel(item.key)));
  const spendingQuestion = isSpendingQuestion(userMessage);
  const matchingInterestContext = memories.find((item) => item.key.startsWith("interest:") &&
    item.sourceMetadata?.interestStatus !== "inactive" && isMemoryTopicMatched(item, userMessage) &&
    (spendingQuestion || interestUseContext(item.key, userMessage, item.semanticSimilarity) !== undefined));
  const matchingActivitySpend = spendingQuestion ? memories.find((item) =>
    (item.key.startsWith("interest_spend:") || item.key.startsWith("financial_profile:category:") ||
      item.key.startsWith("activity_mapping:")) &&
    !inactiveInterests.has(memoryTopicLabel(item.key)) && isMemoryTopicMatched(item, userMessage)) : undefined;
  const matchingContext = matchingInterestContext ?? matchingActivitySpend;
  if (matchingContext) {
    const activity = memoryTopicLabel(matchingContext.key);
    if (!activity) return undefined;
    if (spendingQuestion) {
      const reportedSpend = memories.find((item) => item.key.startsWith("interest_spend:") &&
        memoryTopicLabel(item.key) === activity);
      let reportedSpendSummary: string | undefined;
      if (reportedSpend) {
        const amount = reportedSpend.value.match(/\$[\d,]+\.\d{2}/)?.[0];
        const cadence = typeof reportedSpend.sourceMetadata?.cadence === "string"
          ? reportedSpend.sourceMetadata.cadence
          : reportedSpend.value.match(/\bper (day|week|month|year|session|visit|class|trip)\b/i)?.[1]?.toLocaleLowerCase("en-US");
        if (amount && cadence) {
          reportedSpendSummary = `You told me you spend about ${amount} per ${cadence} on ${activity} (last noted ${formatMemoryDate(reportedSpend.createdAt)})`;
        }
      }
      const mapping = memories.find((item) => item.key === `activity_mapping:${activity}` &&
        item.sourceType === "user_statement" && typeof item.sourceMetadata?.profileKey === "string");
      const profileKey = typeof mapping?.sourceMetadata?.profileKey === "string"
        ? mapping.sourceMetadata.profileKey
        : `financial_profile:category:${activity}`;
      const profileSpend = memories.find((item) => item.key === profileKey &&
        item.sourceType === "plaid_transaction_profile");
      const totalCents = profileSpend?.sourceMetadata?.totalCents;
      const recordCount = profileSpend?.sourceRecordCount;
      if (profileSpend && Number.isSafeInteger(totalCents) && Number.isSafeInteger(recordCount) &&
          profileSpend.observedFrom && profileSpend.observedThrough) {
        if (mapping) {
          const mappedTarget = typeof mapping.sourceMetadata?.target === "string" ? mapping.sourceMetadata.target : activity;
          const dimension = mapping.sourceMetadata?.dimension === "merchant" ? "merchant" : "category";
          const userReported = reportedSpendSummary ? `${reportedSpendSummary}. Separately, ` : "";
          const mappingSummary = reportedSpendSummary
            ? `you told me to use ${mappedTarget} as the ${dimension} for ${activity}. `
            : `You told me to use ${mappedTarget} as the ${dimension} for ${activity}. `;
          return `${userReported}${mappingSummary}Your linked transactions show ${formatUsd(totalCents as number)} across ${recordCount} posted purchases for ${mappedTarget}, from ${profileSpend.observedFrom} through ${profileSpend.observedThrough}; that history may not reflect current spending. Is that mapping still right?`;
        }
        const userReported = reportedSpendSummary ? `${reportedSpendSummary}. Separately, ` : "";
        return `${userReported}${reportedSpendSummary ? "your linked" : "Your linked"} transactions show ${formatUsd(totalCents as number)} across ${recordCount} posted purchases categorized as ${activity}, from ${profileSpend.observedFrom} through ${profileSpend.observedThrough}; that history may not reflect current spending. Is that category a good match for your ${activity} spending?`;
      }
      if (reportedSpendSummary) return `${reportedSpendSummary}. Is that still accurate?`;
      if (mapping) {
        const target = typeof mapping.sourceMetadata?.target === "string" ? mapping.sourceMetadata.target : "that transaction label";
        return `You told me to use ${target} for ${activity}, but I don't have a current linked transaction summary for it. If you'd like, tell me what you typically spend per month or per outing, and I'll keep that user-reported estimate separate.`;
      }
      return `I remember ${activity} is something you enjoy, but I don't have a reliable spend amount for it. If you'd like to use linked transactions, tell me which category or merchant represents ${activity}; otherwise, tell me what you typically spend per month or per outing. I'll keep those sources separate.`;
    }
    const useContext = interestUseContext(matchingContext.key, userMessage, matchingContext.semanticSimilarity);
    if (useContext === "planning") {
      return `I remember you enjoy ${activity}. If you're planning around it, we can include ${activity} in the plan. Is that still something you enjoy?`;
    }
    if (useContext === "routine") {
      return `I remember you enjoy ${activity}. We can look for a manageable way to make time for it in your routine. Is that still something you enjoy?`;
    }
    if (useContext === "goal") {
      return `I remember you enjoy ${activity}. If this goal still includes ${activity}, we can keep that in mind as we plan. Is that still something you enjoy?`;
    }
    if (useContext === "spending") {
      return `I remember you enjoy ${activity}. We can include it in this spending discussion, but I don't know what it costs for you. Which expense are you weighing? Is that still something you enjoy?`;
    }
    return `I remember you enjoy ${activity}. Is that still something you enjoy?`;
  }

  if (spendingQuestion) {
    const activity = extractSpendingTopic(userMessage);
    return activity
      ? `I don't have a reliable amount for ${activity} yet. What do you typically spend per month or per outing? If you'd rather use linked transactions, tell me which category or merchant represents ${activity}, and I'll keep that source separate from your estimate.`
      : "I don't have enough detail to identify the activity or a reliable amount. Which activity do you mean, and what do you typically spend per month or per outing? If you'd rather use linked transactions, tell me the category or merchant to check.";
  }

  if (interestOnly) return undefined;

  const routine = memories.find((item) => isRelevantRecurringRoutine(item, userMessage));
  if (routine) {
    const routineName = describeRecurringRoutine(routine.key);
    if (routineName) {
      return `I remember you’ve mentioned your ${routineName} routine. We can think through what would feel manageable this time. What’s been making it difficult?`;
    }
  }

  const goal = memories.find((item) => item.category === "goal" &&
    (item.key === "emergency_fund" || item.key.startsWith("goal:")));
  if (goal) {
    const target = goal.key === "emergency_fund"
      ? "an emergency fund"
      : formatRememberedGoalTarget(goal.key.slice("goal:".length));
    if (target) {
      return `I’m here with you. You’ve mentioned saving for ${target}; we can keep that in mind as we talk this through. What feels most important right now?`;
    }
  }

  const preference = memories.find((item) => item.category === "preference");
  if (preference) {
    const preferredApproach = preference.key.startsWith("preference:")
      ? preference.key.slice("preference:".length).replace(/_/g, " ").replace(/[^a-z0-9 '$.,&-]/gi, "").trim().slice(0, 60)
      : preference.evidence.match(/\bi\s+(?:would\s+|’d\s+)?prefer\s+(?:a\s+|an\s+|the\s+)?([^.!?]+)/i)?.[1]
        ?? preference.evidence.match(/\b([a-z][^,.!?]{1,50}?)\s+(?:is|are)\s+easier\s+for\s+me\b/i)?.[1]
          ?.replace(/^.*\bso\s+/i, "")
        ?? (preference.sourceType === "user_correction"
          ? preference.value.match(/^prefers?\s+(?:a\s+|an\s+|the\s+)?([^.!?]+)/i)?.[1]
          : undefined);
    const safePreferredApproach = preferredApproach
      ?.replace(/[^a-z0-9 '$.,&-]/gi, "").trim().slice(0, 60);
    if (safePreferredApproach) {
      return `I’ll keep your preference for ${safePreferredApproach} in mind. What would be most helpful right now?`;
    }
  }

  const episode = memories.find((item) => isUsableEpisodicSummary(item, userMessage));
  return episode
    ? `I have a note from an earlier conversation: “${episode.value}” Is that still relevant, or has something changed?`
    : fallbackMessage;
}

export function isSpendingQuestion(message: string): boolean {
  return /\b(?:how much|what do i spend|what's my spend|what is my spend|cost|budget|spend(?:ing)?|spent)\b/i.test(message);
}

function interestUseContext(
  interestKey: string,
  message: string,
  semanticSimilarity?: number
): "planning" | "routine" | "goal" | "spending" | undefined {
  const topic = memoryTopicLabel(interestKey);
  if (!topic || !(isMemoryTopicMentioned(interestKey, message) || isStrongSemanticMatch(semanticSimilarity))) return undefined;
  const normalized = message.toLocaleLowerCase("en-US");
  const topicText = topic.toLocaleLowerCase("en-US");
  const topicIndex = normalized.indexOf(topicText);
  const nearby = topicIndex < 0
    ? normalized
    : normalized.slice(Math.max(0, topicIndex - 48), Math.min(normalized.length, topicIndex + topicText.length + 48));
  if (/\b(?:plan(?:ning)?|trip|vacation|itinerary|weekend|activities)\b/.test(nearby)) return "planning";
  if (/\b(?:routine|schedule|make time|fit|practice|weekly|every week|regularly|do more|keep up)\b/.test(nearby)) return "routine";
  if (/\b(?:budget(?:ing)?|costs?|spending|spend|expense|price|gear|equipment|class|lesson|fee)\b/.test(nearby)) return "spending";
  if (/\b(?:goal|aim|aiming|working toward|trying to|want to|hope to)\b/.test(nearby)) return "goal";
  return undefined;
}

export function memoryTopicLabel(key: string): string | undefined {
  const topic = key.startsWith("interest_spend:")
    ? key.slice("interest_spend:".length)
    : key.startsWith("interest:")
      ? key.slice("interest:".length)
      : key.startsWith("activity_mapping:")
        ? key.slice("activity_mapping:".length)
      : key.startsWith("financial_profile:category:")
        ? key.slice("financial_profile:category:".length)
        : "";
  return topic ? topic.replace(/_/g, " ") : undefined;
}

function extractSpendingTopic(message: string): string | undefined {
  const match = /\b(?:spend|spending|spent|budget|cost)\s+(?:on|for|in)\s+([^?.!,;]{1,80})/i.exec(message);
  const topic = match?.[1]?.trim().replace(/\b(?:usually|typically|per month|per outing|each month)\b.*$/i, "").trim();
  return topic ? topic.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase("en-US")) : undefined;
}

function formatMemoryDate(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "date unavailable";
}

function isMemoryTopicMentioned(key: string, message: string): boolean {
  const topic = memoryTopicLabel(key);
  if (!topic) return false;
  const normalize = (value: string) => `_${value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_`;
  const normalizedMessage = normalize(message);
  if (normalizedMessage.includes(normalize(topic))) return true;
  return (INTEREST_TOPIC_ALIASES[topic] ?? []).some((alias) => normalizedMessage.includes(normalize(alias)));
}

const INTEREST_TOPIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  bird_watching: ["birdwatching", "birding"],
  cycling: ["biking", "bike riding"],
  hiking: ["hike", "hikes", "trail walking", "trekking"],
  running: ["run", "jogging", "jog"],
  strength_training: ["weight training", "lifting", "weightlifting"],
  video_games: ["gaming", "video gaming"]
};

export function isMemoryTopicMatched(memory: ConversationalMemory, message: string): boolean {
  return isMemoryTopicMentioned(memory.key, message) || isStrongSemanticMatch(memory.semanticSimilarity);
}

function isStrongSemanticMatch(similarity: number | undefined): boolean {
  return Number.isFinite(similarity) && (similarity as number) >= SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY;
}

function normalizeRoutineTerm(term: string): string {
  return term.length > 4 ? term.replace(/s$/, "") : term;
}

const ROUTINE_STOP_WORDS = new Set([
  "usually", "often", "typically", "routinely", "regularly", "every", "each", "weekdays", "weekday",
  "weekends", "weekend", "during", "before", "after", "from", "with", "your", "have", "make"
]);

function isRelevantRecurringRoutine(
  memory: ConversationalMemory,
  userMessage: string
): boolean {
  if (memory.category !== "habit") return false;
  const message = userMessage.toLocaleLowerCase("en-US");
  if (memory.key === "coffee_routine") return /\b(?:coffee|cafe|café)\b/i.test(message);
  if (memory.key === "takeout_routine") return /\b(?:takeout|delivery|doordash|ordering food|order food)\b/i.test(message);
  if (memory.key.startsWith("merchant_habit:")) {
    const merchantWords = memory.key.slice("merchant_habit:".length).replace(/_/g, " ").trim();
    if (merchantWords && message.includes(merchantWords)) return true;
    const evidenceTerms = new Set((memory.evidence ?? "").toLocaleLowerCase("en-US")
      .match(/[a-z]{4,}/g)?.map(normalizeRoutineTerm).filter((term) => !ROUTINE_STOP_WORDS.has(term)) ?? []);
    const messageTerms = new Set(message.match(/[a-z]{4,}/g)?.map(normalizeRoutineTerm) ?? []);
    const matchingTerms = [...evidenceTerms].filter((term) => messageTerms.has(term));
    return matchingTerms.length >= 2;
  }
  return false;
}

export function selectPersonalizationMemories(
  memories: readonly ConversationalMemory[],
  userMessage: string,
  conversationContext: readonly string[]
): readonly Pick<ConversationalMemory, "id" | "category" | "key" | "value">[] {
  const eligible = memories.filter((memory) => {
    if (memory.category !== "preference" && memory.category !== "goal" && memory.category !== "habit" &&
        !(memory.category === "other" && memory.key.startsWith("interest:"))) return false;
    return isRetrievableMemory(memory);
  });
  return planMemoryRetrieval({
    memories: eligible,
    query: userMessage,
    additionalContext: conversationContext.slice(-6).join(" "),
    limit: 6,
    alwaysRelevant: isCommunicationStylePreference,
    alwaysRelevantLimit: 2,
    categoryLimits: { preference: 2, goal: 2, habit: 2, other: 2, financial_pattern: 2 }
  }).map(({ id, category, key, value }) => ({ id, category, key, value }));
}

function isCommunicationStylePreference(memory: ConversationalMemory): boolean {
  const text = `${memory.key} ${memory.value} ${memory.evidence}`.toLocaleLowerCase("en-US");
  return memory.category === "preference" &&
    /\b(?:reply|replies|response|responses|answer|answers|explanation|explanations|tone|detail|detailed|brief|briefly|concise|short|step by step|one question|practical|direct|gentle|encouraging|no emojis)\b/i.test(text);
}

export function sanitizeMemoryEvidence(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function describeRecurringRoutine(key: string): string | undefined {
  if (key === "coffee_routine") return "coffee";
  if (key === "takeout_routine") return "takeout";
  if (!key.startsWith("merchant_habit:")) return undefined;
  const merchant = key.slice("merchant_habit:".length).replace(/_/g, " ").trim();
  if (!merchant) return undefined;
  const brandNames: Readonly<Record<string, string>> = {
    doordash: "DoorDash",
    blue_bottle: "Blue Bottle",
    starbucks: "Starbucks"
  };
  return brandNames[merchant] ?? merchant.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase("en-US"));
}

function formatRememberedGoalTarget(key: string): string {
  const target = key.replace(/_/g, " ").replace(/[^a-z0-9 '&-]/gi, "").trim().slice(0, 60);
  const tripDestination = /^trip\s+(.+)$/i.exec(target)?.[1];
  if (tripDestination) {
    return `a trip to ${tripDestination.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase("en-US"))}`;
  }
  return target;
}
