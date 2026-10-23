import { describe, expect, it, vi } from "vitest";
import { createPlaidConsentHandler, PLAID_FINANCIAL_PROFILE_CONSENT_VERSION } from "../../../src/app/plaid/consent-handler.js";
import { createVictoriaSessionAuthenticator, signVictoriaSession } from "../../../src/app/http/signed-session-auth.js";
import type { PlaidConsentSnapshot } from "../../../src/app/plaid/consent-repository.js";

const secret = "test-only-session-secret-with-more-than-32-bytes";

function snapshot(userId = "user-a"): PlaidConsentSnapshot {
  return {
    consentId: "consent-1", userId, status: "active", products: ["transactions"],
    purpose: "financial_profile", grantedAt: "2026-10-22T12:00:00.000Z", revokedAt: null
  };
}

describe("Plaid consent HTTP boundary", () => {
  it("requires a verified user and discloses the fixed Transactions-only scope", async () => {
    const getConsent = vi.fn(async () => null);
    const handler = createPlaidConsentHandler({
      authenticate: createVictoriaSessionAuthenticator(secret),
      consent: { getConsent, recordGrant: vi.fn(async () => snapshot()) },
      getConnectedItemCount: vi.fn(async () => 2)
    });
    const unauthorized = await handler(new Request("https://victoria.local/api/plaid/consent"));
    const token = signVictoriaSession({ userId: "user-a", secret });
    const response = await handler(new Request("https://victoria.local/api/plaid/consent", {
      headers: { authorization: `Bearer ${token}` }
    }));

    expect(unauthorized.status).toBe(401);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ notice: {
      purpose: "financial_profile", products: ["transactions"],
      dataFields: ["transaction date", "merchant", "amount and currency", "category", "optional payment channel"],
      transactionLookbackDays: 90, retentionDays: 90, encryptedPlaidTokenStoredForSync: true,
      balancesRequested: false, transfersEnabled: false
    }, connectedItemCount: 2 });
    expect(getConsent).toHaveBeenCalledWith("user-a");
  });

  it("records consent only after explicit confirmation of the current notice version", async () => {
    const recordGrant = vi.fn(async () => snapshot());
    const handler = createPlaidConsentHandler({
      authenticate: createVictoriaSessionAuthenticator(secret),
      consent: { getConsent: vi.fn(async () => null), recordGrant },
      idFactory: () => "consent-event-1",
      now: () => new Date("2026-10-22T12:34:00.000Z")
    });
    const token = signVictoriaSession({ userId: "user-a", secret });
    const request = (body: unknown) => new Request("https://victoria.local/api/plaid/consent", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body)
    });

    const rejected = await handler(request({ action: "grant", confirmed: false, consentVersion: PLAID_FINANCIAL_PROFILE_CONSENT_VERSION }));
    expect(rejected.status).toBe(400);
    expect(recordGrant).not.toHaveBeenCalled();

    const response = await handler(request({ action: "grant", confirmed: true, consentVersion: PLAID_FINANCIAL_PROFILE_CONSENT_VERSION }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ consent: { status: "active", products: ["transactions"] } });
    expect(recordGrant).toHaveBeenCalledWith({
      eventId: "consent-event-1", userId: "user-a", products: ["transactions"], grantedAt: "2026-10-22T12:34:00.000Z"
    });
  });

  it("makes an already-active grant idempotent", async () => {
    const recordGrant = vi.fn(async () => snapshot());
    const handler = createPlaidConsentHandler({
      authenticate: createVictoriaSessionAuthenticator(secret),
      consent: { getConsent: vi.fn(async () => snapshot()), recordGrant }
    });
    const token = signVictoriaSession({ userId: "user-a", secret });
    const response = await handler(new Request("https://victoria.local/api/plaid/consent", {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "grant", confirmed: true, consentVersion: PLAID_FINANCIAL_PROFILE_CONSENT_VERSION })
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ alreadyActive: true });
    expect(recordGrant).not.toHaveBeenCalled();
  });
});
