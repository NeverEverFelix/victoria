export type ExplicitDollarAmount =
  | { status: "absent" }
  | { status: "valid"; amountCents: number }
  | { status: "invalid_value" }
  | { status: "multiple_amounts" }
  | { status: "invalid_precision" }
  | { status: "unsupported_currency" };

export function parseExplicitDollarAmount(message: string): ExplicitDollarAmount {
  if (/[€£¥]\s*\d|\b\d+(?:\.\d+)?\s*(?:eur|euros?|gbp|pounds?|jpy|yen)\b/i.test(message)) {
    return { status: "unsupported_currency" };
  }

  const matches = [...message.matchAll(/(?:-\$|\$-?)([\d,]+(?:\.\d+)?)/g)];
  if (matches.length > 1) {
    const repeatedReferenceAmount = parseRepeatedReferenceAmount(message, matches);
    if (repeatedReferenceAmount) return repeatedReferenceAmount;
    return { status: "multiple_amounts" };
  }
  const match = matches[0];

  if (!match?.[1]) {
    return { status: "absent" };
  }

  const [, amountText] = match;
  if (match[0].includes("-")) {
    return { status: "invalid_value" };
  }
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(amountText)) {
    return { status: "invalid_value" };
  }
  const fractionalDigits = amountText?.split(".")[1]?.length ?? 0;
  if (fractionalDigits > 2) {
    return { status: "invalid_precision" };
  }

  const amountCents = Math.round(Number(amountText.replaceAll(",", "")) * 100);
  return !Number.isSafeInteger(amountCents) || amountCents <= 0
    ? { status: "invalid_value" }
    : { status: "valid", amountCents };
}

/** Treat “the $42” as a reference to an earlier identical amount, not a second candidate. */
function parseRepeatedReferenceAmount(
  message: string,
  matches: RegExpMatchArray[]
): Extract<ExplicitDollarAmount, { status: "valid" }> | null {
  let repeatedCents: number | undefined;
  for (const [index, match] of matches.entries()) {
    const amountText = match[1];
    const matchIndex = match.index;
    if (!amountText || matchIndex === undefined || match[0].includes("-") ||
        !/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(amountText) ||
        (amountText.split(".")[1]?.length ?? 0) > 2) return null;
    const cents = Math.round(Number(amountText.replaceAll(",", "")) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0 || (repeatedCents !== undefined && cents !== repeatedCents)) return null;
    if (index > 0 && !/\b(?:the|that|this|same)\s*$/i.test(message.slice(0, matchIndex))) return null;
    repeatedCents = cents;
  }
  return repeatedCents === undefined ? null : { status: "valid", amountCents: repeatedCents };
}

export function parseExplicitDollarAmountCents(message: string): number | undefined {
  const parsed = parseExplicitDollarAmount(message);
  return parsed.status === "valid" ? parsed.amountCents : undefined;
}
