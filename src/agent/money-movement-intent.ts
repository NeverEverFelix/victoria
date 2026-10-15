/** Conservative deterministic fallback for explicit requests to move real funds. */
export function isRealMoneyMovementRequest(message: string): boolean {
  const text = message.toLocaleLowerCase("en-US");
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
