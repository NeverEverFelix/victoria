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
  return /\b(?:please|can you|could you|would you|will you|go ahead and)\s+(?:(?:now|just)\s+)?(?:move|transfer|send|deposit|withdraw)\b/i.test(message) ||
    /\b(?:move|transfer|send|deposit|withdraw)\b.{0,60}\b(?:from|to|into|out of)\b.{0,45}\b(?:checking|savings|bank|account)\b/i.test(message);
}

/** A recurring bill newly covered by an employer is a budgeting moment, not a transfer instruction. */
export function employerCoveredRecurringSpend(message: string): { amountCents: number; cadence: "month" | "year" } | undefined {
  if (!/\b(?:company|employer|work)\b.{0,100}\b(?:pay(?:s|ing)?|cover(?:s|ing)?|reimburse(?:s|d|ing)?)\b|\b(?:pay(?:s|ing)?|cover(?:s|ing)?|reimburse(?:s|d|ing)?)\b.{0,100}\b(?:company|employer|work)\b/i.test(message)) return;
  const cadence = /\b(?:per|a|each|every)\s+month|\bmonthly\b/i.test(message) ? "month"
    : /\b(?:per|a|each|every)\s+year|\byearly\b|\bannually\b/i.test(message) ? "year" : undefined;
  if (!cadence || !/\b(?:now|anymore|instead|covered|covering|pays|paid)\b/i.test(message)) return;
  const amount = parseExplicitDollarAmount(message);
  return amount.status === "valid" ? { amountCents: amount.amountCents, cadence } : undefined;
}
