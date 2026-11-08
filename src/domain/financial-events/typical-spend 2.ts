/**
 * Returns the median of qualifying purchase amounts in integer USD cents.
 * At least three valid positive amounts are required. For an even-sized sample,
 * the two middle values are averaged and a half cent rounds up.
 */
export function medianTypicalSpendCents(amounts: readonly number[]): number | null {
  if (amounts.length < 3 || amounts.some(amount => !Number.isSafeInteger(amount) || amount <= 0)) {
    return null;
  }

  const ordered = [...amounts].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2 === 1) return ordered[middle] ?? null;

  const lower = ordered[middle - 1];
  const upper = ordered[middle];
  if (lower === undefined || upper === undefined) return null;
  return lower + Math.round((upper - lower) / 2);
}
