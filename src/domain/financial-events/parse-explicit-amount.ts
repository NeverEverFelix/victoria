export function parseExplicitDollarAmountCents(message: string): number | undefined {
  const match = message.match(/\$(\d+(?:\.\d{1,2})?)/);

  if (!match?.[1]) {
    return undefined;
  }

  return Math.round(Number(match[1]) * 100);
}
