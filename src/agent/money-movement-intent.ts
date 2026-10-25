import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";

/** Conservative deterministic fallback for explicit requests to move real funds. */
export function isRealMoneyMovementRequest(message: string): boolean {
  const text = message.toLowerCase();
  return (
    /\b(?:move|transfer|send|deposit|withdraw)\b.{0,50}\b(?:money|funds|cash)\b/.test(text) ||
    /\b(?:money|funds|cash)\b.{0,50}\b(?:move|transfer|send|deposit|withdraw)\b/.test(text) ||
    /\b(?:deposit|withdraw)\b.{0,50}\b(?:to|into|from|out of)\b.{0,45}\b(?:savings|checking|bank|account)\b/.test(text) ||
    /\b(?:move|transfer|send)\b.{0,45}\b(?:to|into)\b.{0,45}\b(?:savings|checking|bank|account|emergency fund)\b/.test(text) ||
    /\b(?:move|transfer|send)\b.{0,45}\b(?:from|between)\b.{0,45}\b(?:to|into)\b/.test(text) ||
    /\b(?:withdraw|take|pull|remove)\b.{0,50}\b(?:from|out of)\b.{0,40}\b(?:checking|savings|bank|account)\b/.test(text) ||
    /\b(?:bank|account)\s+transfer\b/.test(text)
  );
}

/** A direct instruction to Victoria takes precedence over covered-bill budgeting context. */
export function isExplicitRealMoneyMovementRequest(message: string): boolean {
  return /\b(?:please|can you|could you|would you|will you|go ahead and)\s+(?:(?:now|just)\s+)?(?:transfer|deposit|withdraw)\b/i.test(message) ||
    /\b(?:please|can you|could you|would you|will you|go ahead and)\s+(?:(?:now|just)\s+)?(?:move|send)\b.{0,50}(?:\$\s?\d|\b(?:money|funds|cash|savings|checking|bank|account)\b)/i.test(message) ||
    /\b(?:move|transfer|send|deposit|withdraw)\b.{0,60}\b(?:from|to|into|out of)\b.{0,45}\b(?:checking|savings|bank|account)\b/i.test(message);
}

/** Questions about whether to redirect a covered expense are planning requests. */
export function isBudgetingAdviceQuestion(message: string): boolean {
  return /\b(?:is it (?:a )?good idea|should i|would it make sense|is it sensible|what (?:should|could) i do|what do you think)\b/i.test(message);
}

/** A recurring bill newly covered by an employer is a budgeting moment, not a transfer instruction. */
export function employerCoveredRecurringSpend(message: string): { amountCents: number; cadence: "month" | "year" } | undefined {
  if (!/\b(?:company|employer|work)\b.{0,100}\b(?:pay(?:s|ing)?|cover(?:s|ing)?|reimburse(?:s|d|ing)?)\b|\b(?:pay(?:s|ing)?|cover(?:s|ing)?|reimburse(?:s|d|ing)?)\b.{0,100}\b(?:company|employer|work)\b/i.test(message)) return;
  const cadence = recurringCadence(message);
  if (!cadence || !/\b(?:now|anymore|instead|covered|covering|pays|paid)\b/i.test(message)) return;
  const amount = parseExplicitDollarAmount(message);
  return amount.status === "valid" ? { amountCents: amount.amountCents, cadence } : undefined;
}

/** A clearly ended personal recurring cost can free room in a budget. */
export function endedRecurringSpend(message: string): { amountCents: number; cadence: "month" | "year" } | undefined {
  if (!/\b(?:quit|quitting|stopped|stopping|ended|gave up|giving up|ditch|ditching|cancelled|canceled|cancelling|canceling|no longer (?:play|go|attend|use))\b/i.test(message)) return;
  if (/\b(?:might|may|maybe|considering|thinking (?:about|of)|if I|could|would)\b.{0,30}\b(?:quit|quitting|stop|stopping|ditch|ditching|cancel|canceling|cancelling)\b/i.test(message)) return;
  const priceWithCadence = /\$\s?\d[\d,]*(?:\.\d{1,2})?\s*(?:[-/]\s*(?:a[-\s]+)?(?:month|year)\b|(?:per|a|each|every)\s+(?:month|year)\b)/i.test(message);
  if (!priceWithCadence && !/\b(?:cost(?:s|ing)?(?: me)?|pay(?:ing|ed)?|spend(?:ing|t)?)\b.{0,50}\$\s?\d/i.test(message)) return;
  const cadence = recurringCadence(message);
  if (!cadence) return;
  const amount = parseExplicitDollarAmount(message);
  return amount.status === "valid" ? { amountCents: amount.amountCents, cadence } : undefined;
}

function recurringCadence(message: string): "month" | "year" | undefined {
  // Prefer the period attached to the stated price. A later question about a
  // yearly projection must not turn a $35/month source cost into an ambiguity.
  const pricePeriod = message.match(/\$\s?\d[\d,]*(?:\.\d{1,2})?\s*(?:[-/]\s*)?(?:(?:per|a|each|every)[\s-]+)?(month|year)\b/i)?.[1];
  if (pricePeriod === "month" || pricePeriod === "year") return pricePeriod;
  const monthly = /\b(?:per|a|each|every)[\s-]+month\b|\bmonthly\b|\/month\b/i.test(message);
  const yearly = /\b(?:per|a|each|every)[\s-]+year\b|\byearly\b|\bannually\b|\/year\b/i.test(message);
  return monthly === yearly ? undefined : monthly ? "month" : "year";
}

export function freedRecurringSpend(message: string): { amountCents: number; cadence: "month" | "year" } | undefined {
  return employerCoveredRecurringSpend(message) ?? endedRecurringSpend(message);
}
