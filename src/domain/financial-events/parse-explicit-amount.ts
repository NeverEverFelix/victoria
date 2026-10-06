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

export function parseExplicitDollarAmountCents(message: string): number | undefined {
  const parsed = parseExplicitDollarAmount(message);
  return parsed.status === "valid" ? parsed.amountCents : undefined;
}
