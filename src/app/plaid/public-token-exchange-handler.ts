import type { PlaidAccessTokenCipher } from "./access-token-cipher.js";
import type { PlaidConsentRepository } from "./consent-repository.js";
import type { PlaidApiClient } from "./plaid-api-client.js";
import type { PlaidDataRepository } from "./plaid-data-repository.js";
import type { FinancialProfileSyncService } from "./financial-profile-sync.js";

/** Exchanges a Link public token server-side; access tokens are only stored encrypted. */
export function createPlaidPublicTokenExchangeHandler(deps: {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  consent: Pick<PlaidConsentRepository, "getConsent">;
  plaid: Pick<PlaidApiClient, "exchangePublicToken">;
  data: Pick<PlaidDataRepository, "storeItem">;
  cipher: PlaidAccessTokenCipher;
  /** Optional initial sync; scheduled/webhook syncs use the dedicated refresh handler. */
  sync?: Pick<FinancialProfileSyncService, "syncUser">;
}) {
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "POST") return respond(405, { error: "method_not_allowed" });
    let user: { readonly userId: string } | null;
    try { user = await deps.authenticate(request); } catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });
    let consent;
    try { consent = await deps.consent.getConsent(user.userId); } catch { return respond(503, { error: "consent_unavailable" }); }
    if (!consent || consent.userId !== user.userId || consent.status !== "active" ||
        !consent.products.includes("transactions")) return respond(403, { error: "active_connection_consent_required" });
    let body: unknown;
    try { body = await request.json(); } catch { return respond(400, { error: "invalid_request" }); }
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).public_token !== "string") {
      return respond(400, { error: "invalid_request" });
    }
    try {
      const result = await deps.plaid.exchangePublicToken((body as { public_token: string }).public_token);
      await deps.data.storeItem(user.userId, result.itemId, deps.cipher.encrypt(result.accessToken));
      if (deps.sync) await deps.sync.syncUser(user.userId);
      return respond(201, { connected: true });
    } catch {
      return respond(503, { error: "plaid_unavailable" });
    }
  };
}
