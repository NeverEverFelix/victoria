import { parseExplicitDollarAmount, type ExplicitDollarAmount } from "./parse-explicit-amount.js";

/** Parses the corrected amount in a clear "$18, not $20" correction. */
export function parseExplicitCorrectionAmount(message: string): Extract<ExplicitDollarAmount, { status: "valid" }> | null {
  const amountMatches = [...message.matchAll(/(?:-\$|\$-?)([\d,]+(?:\.\d+)?)/g)];
  if (amountMatches.length !== 2) return null;

  const amountPattern = "((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)";
  const correction = message.match(new RegExp(`\\$${amountPattern}\\s*,?\\s+not\\s+\\$${amountPattern}`, "i"));
  if (!correction?.[1] || !correction[2]) return null;

  const correctedAmount = parseExplicitDollarAmount(`$${correction[1]}`);
  const excludedAmount = parseExplicitDollarAmount(`$${correction[2]}`);
  return correctedAmount.status === "valid" && excludedAmount.status === "valid" ? correctedAmount : null;
}
