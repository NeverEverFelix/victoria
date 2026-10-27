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
    /\b(?:should i|can you|could you|please|i want to|i'd like to|i would like to)\s+(?:record|log|save|add|transfer|deposit|withdraw|approve|confirm|decline|revise|correct)\b/i.test(message);
}

export function isConversationTopicTurn(message: string): boolean {
  return isOrdinaryQuestion(message) ||
    /\b(?:let'?s|can we|i(?:'d| would) like to)\s+(?:talk|discuss|think)\s+about\b/i.test(message) ||
    /\b(?:switch|change)\s+(?:the\s+)?(?:topic|subject)\b/i.test(message) ||
    (!hasFinancialActionSignal(message) && message.trim().split(/\s+/).length >= 4 &&
      !/^\s*(?:yes|no|nope|nah|sure|confirm|approve|maybe)\b/i.test(message));
}

export function hasFinancialActionSignal(message: string): boolean {
  return /\$|\b(?:dollars?|bucks|savings?|save|spent|spend|spending|purchase|bought|buy|budget|bill|fee|cost|price|ledger|transfer|deposit|withdraw|goal allocation)\b/i.test(message);
}
