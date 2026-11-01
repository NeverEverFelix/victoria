/** Narrow routing helpers for read-only dialogue versus financial workflows. */
export function isOrdinaryQuestion(message: string): boolean {
  return /\?/.test(message) &&
    !/^\s*(?:yes|no|nope|nah|sure|confirm|approve)\b/i.test(message) &&
    !/\b(?:record|log|add|transfer|deposit|move)\b[^?]*\b(?:savings|money|funds|ledger|entry)\b/i.test(message);
}

export function isReadOnlyEventHistoryQuestion(message: string): boolean {
  if (/^\s*(?:yes|no|nope|nah|sure|confirm|approve)\b/i.test(message)) return false;
  const question = message.replace(/\b(?:not|never|don't|do not)\s+(?:to\s+)?(?:record|log|save|add|transfer|move)\b/gi, " ");
  return /\?/.test(question) &&
    !/\b(?:should i|can you|could you|please)\s+(?:record|log|save|add|transfer|move|revise|change|approve|confirm|decline)\b/i.test(question) &&
    !/\b(?:record|log|save|add|transfer|move|revise|change|approve|confirm|decline)\b/i.test(question) &&
    /\b(?:what|which|when|where|list|summari[sz]e|remind me|tell me)\b/i.test(question) &&
    /\b(?:event|thing|moment|purchase|spend|spent|avoid|avoided|skip|skipped|mentioned|told you|conversation|earlier|before)\b/i.test(question);
}

export function isExplicitFinancialActionQuestion(message: string): boolean {
  return /\?/.test(message) &&
    /\b(?:should i|can you|could you|please|i want to|i'd like to|i would like to)\s+(?:record|log|save|add|transfer|deposit|withdraw|approve|confirm|decline|revise|correct|allocate|link|assign|apply|update|change|edit)\b/i.test(message);
}

export function isConversationTopicTurn(message: string): boolean {
  return isOrdinaryQuestion(message) ||
    /\b(?:let'?s|can we|i(?:'d| would) like to)\s+(?:talk|discuss|think)\s+about\b/i.test(message) ||
    /\b(?:switch|change)\s+(?:the\s+)?(?:topic|subject)\b/i.test(message) ||
    (!hasFinancialActionSignal(message) && message.trim().split(/\s+/).length >= 4 &&
      !/^\s*(?:yes|no|nope|nah|sure|confirm|approve|maybe)\b/i.test(message));
}

/** Route clear read-only dialogue without requiring punctuation, while leaving finance/action turns to their existing paths. */
export function shouldRouteToConversationResponder(message: string): boolean {
  return (isOrdinaryQuestion(message) && !hasFinancialActionSignal(message)) ||
    isExplicitReadOnlyTopicSwitch(message) || isReadOnlyFinancialReflection(message) ||
    (isConversationTopicTurn(message) && !hasFinancialActionSignal(message));
}

/** Find a clearly separate ordinary question in a mixed turn, without treating the financial clause as approval. */
export function independentOrdinaryQuestion(message: string): string | undefined {
  const clauses = message.split(/(?<=[.!?])\s+|,\s+(?=(?:and\s+)?(?:what|which|where|when|who|how|can|could|would|do|does|is|are|will)\b)|\s+(?:and then|also)\s+/i);
  if (clauses.length < 2) return undefined;
  for (const clause of clauses.slice(1)) {
    const candidate = clause.trim();
    if ((isOrdinaryQuestion(candidate) && !hasFinancialActionSignal(candidate) || isLowCostMealQuestion(candidate)) &&
        !isExplicitFinancialActionQuestion(candidate) &&
        !/\b(?:record|log|save|add|transfer|deposit|withdraw|revise|correct|allocate|link)\b/i.test(candidate)) return candidate;
  }
  return undefined;
}

function isLowCostMealQuestion(message: string): boolean {
  return /\?/.test(message) &&
    /\b(?:low[- ]cost|budget[- ]friendly|inexpensive|affordable)\b/i.test(message) &&
    /\b(?:meal|dinner|recipe|dish|lunch|breakfast)\b/i.test(message);
}

export function isReadOnlyFinancialReflection(message: string): boolean {
  const normalizedSavingReflection = message.replace(/\bsaving money\b/gi, "money");
  return !/\?/.test(message) && !/\$\s*\d|\b\d+(?:\.\d+)?\s*(?:dollars?|bucks)\b/i.test(message) &&
    !/\b(?:record|log|sav(?:e|ing|ed)|add|transfer|deposit|withdraw|pay|purchase|buy|spend|spent|allocate|set aside|move)\b/i.test(normalizedSavingReflection) &&
    /\b(?:budget|budgets|bills?|money|finances?|financial situation|spending)\b/i.test(message) &&
    /\b(?:anxious|worried|stressed|overwhelm\w*|uncertain|nervous|afraid|frustrat\w*|confus\w*|hard|difficult)\b/i.test(message);
}

/** A read-only topic may pass a pending financial workflow without resolving or revising it. */
export function isSafePendingWorkflowTopicSwitch(message: string): boolean {
  return isConversationTopicTurn(message) &&
    !/\b(?:revise|correct)\b/i.test(message) &&
    !isExplicitFinancialActionQuestion(message) &&
    (!/\b(?:change|instead)\b/i.test(message) || !hasFinancialActionSignal(message) ||
      isExplicitReadOnlyTopicSwitch(message));
}

/** A clear replacement request invalidates the old pending version before a new one is proposed. */
export function isPendingCorrectionReplacementRequest(message: string): boolean {
  return /\b(?:correct|revise|change|edit)\b/i.test(message) &&
    /\b(?:entry|correction|amount|ledger)\b|\$/i.test(message) &&
    /\b(?:instead|actually|rather)\b|\$\s*\d/i.test(message);
}

/** A clear new goal target supersedes the old target and must receive fresh approval. */
export function isPendingGoalRetargetRequest(message: string): boolean {
  return /\b(?:link|allocate|assign|switch|change|retarget)\b/i.test(message) &&
    /\b(?:goal|fund|savings)\b/i.test(message) &&
    /\b(?:instead|different|another|new)\b/i.test(message);
}

/** Explicit conversational topic changes remain read-only even when the topic contains finance words. */
export function isExplicitReadOnlyTopicSwitch(message: string): boolean {
  return /^\s*(?:let'?s|can we|i(?:'d| would| want to) like to|i want to)\s+(?:talk|discuss|think)\s+about\b/i.test(message) &&
    !/\b(?:record|log|revise|correct|approve|confirm|decline|transfer|deposit|withdraw|ledger)\b/i.test(message);
}

export function hasFinancialActionSignal(message: string): boolean {
  return /\$|\b(?:dollars?|bucks|savings?|save|spent|spend|spending|purchase|bought|buy|order(?:ed|ing)?|budget|bill|fee|cost|price|ledger|transfer|deposit|withdraw|goal|fund)\b/i.test(message);
}
