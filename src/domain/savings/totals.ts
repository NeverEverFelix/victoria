import type { SavingsEntryLike } from "./types.js";

type DatedSavingsEntryLike = SavingsEntryLike & { createdAt: string };

export function sumCompletedSavings(entries: SavingsEntryLike[]): number {
  return entries.reduce((totalCents, entry) => {
    if (entry.status !== "completed") {
      return totalCents;
    }

    return addSafeIntegerCents(totalCents, entry.amountCents);
  }, 0);
}

export function sumCompletedSavingsForWeek(
  entries: DatedSavingsEntryLike[],
  asOf: Date = new Date()
): number {
  const weekStart = new Date(asOf);
  if (!Number.isFinite(weekStart.getTime())) {
    throw new Error("Savings total date must be valid.");
  }
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

  return entries.reduce((totalCents, entry) => {
    const createdAt = new Date(entry.createdAt);
    if (entry.status !== "completed" || !Number.isFinite(createdAt.getTime()) || createdAt < weekStart || createdAt >= nextWeekStart) {
      return totalCents;
    }

    return addSafeIntegerCents(totalCents, entry.amountCents);
  }, 0);
}

export function calculatePotentialMonthlySavings(
  avoidedSpendAmountCents: number,
  timesPerMonth: number
): number {
  if (!Number.isInteger(timesPerMonth) || timesPerMonth < 0) {
    throw new Error("Times per month must be a non-negative integer.");
  }

  if (!Number.isSafeInteger(avoidedSpendAmountCents) || avoidedSpendAmountCents <= 0) {
    throw new Error("Avoided-spend amount must be a positive safe integer number of cents.");
  }

  const total = avoidedSpendAmountCents * timesPerMonth;
  if (!Number.isSafeInteger(total)) {
    throw new Error("Calculated savings total must remain a safe integer number of cents.");
  }
  return total;
}

function addSafeIntegerCents(totalCents: number, amountCents: number): number {
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error("Savings amount must be an integer number of cents.");
  }
  const total = totalCents + amountCents;
  if (!Number.isSafeInteger(total)) {
    throw new Error("Calculated savings total must remain a safe integer number of cents.");
  }
  return total;
}
