export type PlaidReadProduct =
  | "assets"
  | "auth"
  | "employment"
  | "identity"
  | "income_verification"
  | "investments"
  | "liabilities"
  | "transactions";

export interface PlaidConnectionConsent {
  readonly userId: string;
  readonly status: "active" | "revoked";
  readonly products: readonly string[];
}

export interface PlaidLinkTokenDependencies {
  /** Must return an identity from a verified session, never request-supplied user data. */
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  /** Must load the current user's explicit connection intent and approved read products. */
  getConsent(userId: string): Promise<PlaidConnectionConsent | null>;
  createLinkToken(input: { clientUserId: string; products: readonly PlaidReadProduct[] }): Promise<string>;
}

const PLAID_READ_PRODUCTS: readonly PlaidReadProduct[] = [
  "assets", "auth", "employment", "identity", "income_verification", "investments", "liabilities", "transactions"
];

export function isPlaidReadProduct(value: unknown): value is PlaidReadProduct {
  return typeof value === "string" && PLAID_READ_PRODUCTS.includes(value as PlaidReadProduct);
}

/** Starts Plaid Link after app-level consent; framework routes supply verified auth and consent storage. */
export function createPlaidLinkTokenHandler(dependencies: PlaidLinkTokenDependencies) {
  return async function createPlaidLinkToken(request: Request): Promise<Response> {
    const headers = { "Cache-Control": "no-store" };
    if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" }, { ...headers, Allow: "POST" });

    let user: { readonly userId: string } | null;
    try {
      user = await dependencies.authenticate(request);
    } catch {
      return jsonResponse(503, { error: "authentication_unavailable" }, headers);
    }
    if (!user || typeof user.userId !== "string" || !user.userId.trim()) return jsonResponse(401, { error: "unauthorized" }, headers);

    let consent: PlaidConnectionConsent | null;
    try {
      consent = await dependencies.getConsent(user.userId);
    } catch {
      return jsonResponse(503, { error: "consent_unavailable" }, headers);
    }
    if (consent === null) {
      return jsonResponse(403, { error: "active_connection_consent_required" }, headers);
    }
    if (!isPlaidConnectionConsent(consent)) {
      return jsonResponse(400, { error: "invalid_consent_record" }, headers);
    }
    if (consent.status !== "active" || consent.userId !== user.userId) {
      return jsonResponse(403, { error: "active_connection_consent_required" }, headers);
    }
    if (consent.products.length === 0 || !consent.products.every(isPlaidReadProduct)) {
      return jsonResponse(400, { error: "invalid_consented_products" }, headers);
    }

    try {
      const linkToken = await dependencies.createLinkToken({
        clientUserId: user.userId,
        products: consent.products as PlaidReadProduct[]
      });
      if (!linkToken.trim()) return jsonResponse(503, { error: "plaid_unavailable" }, headers);
      return jsonResponse(200, { linkToken }, headers);
    } catch {
      return jsonResponse(503, { error: "plaid_unavailable" }, headers);
    }
  };
}

function isPlaidConnectionConsent(value: unknown): value is PlaidConnectionConsent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const consent = value as Record<string, unknown>;
  return typeof consent.userId === "string" &&
    (consent.status === "active" || consent.status === "revoked") &&
    Array.isArray(consent.products) &&
    consent.products.every((product) => typeof product === "string");
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }
  });
}
