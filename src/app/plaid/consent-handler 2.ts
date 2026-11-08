import { randomUUID } from "node:crypto";
import type { PlaidConsentRepository, PlaidConsentSnapshot } from "./consent-repository.js";

export const PLAID_FINANCIAL_PROFILE_CONSENT_VERSION = "transactions-financial-profile-v1";

/** Authenticated consent boundary. Product scope is fixed server-side to Transactions only. */
export function createPlaidConsentHandler(dependencies: {
  authenticate(request: Request): Promise<{ readonly userId: string } | null>;
  consent: Pick<PlaidConsentRepository, "getConsent" | "recordGrant">;
  getConnectedItemCount?(userId: string): Promise<number>;
  now?: () => Date;
  idFactory?: () => string;
}) {
  return async function plaidConsent(request: Request): Promise<Response> {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "GET" && request.method !== "POST") return respond(405, { error: "method_not_allowed" });
    let user: { readonly userId: string } | null;
    try { user = await dependencies.authenticate(request); }
    catch { return respond(503, { error: "authentication_unavailable" }); }
    if (!user?.userId?.trim()) return respond(401, { error: "unauthorized" });

    let current: PlaidConsentSnapshot | null;
    try { current = await dependencies.consent.getConsent(user.userId); }
    catch { return respond(503, { error: "consent_unavailable" }); }
    if (current && !isValidCurrentConsent(current, user.userId)) return respond(503, { error: "consent_unavailable" });
    if (request.method === "GET") {
      let connectedItemCount = 0;
      try {
        connectedItemCount = dependencies.getConnectedItemCount ? await dependencies.getConnectedItemCount(user.userId) : 0;
      } catch {
        return respond(503, { error: "connection_status_unavailable" });
      }
      if (!Number.isSafeInteger(connectedItemCount) || connectedItemCount < 0) {
        return respond(503, { error: "connection_status_unavailable" });
      }
      return respond(200, {
        consent: current ? publicConsent(current) : null,
        connectedItemCount,
        notice: {
          version: PLAID_FINANCIAL_PROFILE_CONSENT_VERSION,
          purpose: "financial_profile",
          products: ["transactions"],
          dataFields: ["transaction date", "merchant", "amount and currency", "category", "optional payment channel"],
          transactionLookbackDays: 90,
          retentionDays: 90,
          encryptedPlaidTokenStoredForSync: true,
          balancesRequested: false,
          transfersEnabled: false
        }
      });
    }

    const mediaType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") return respond(415, { error: "unsupported_media_type" });
    let body: unknown;
    try {
      const text = await readBoundedBody(request, 4096);
      body = JSON.parse(text) as unknown;
    } catch (error) {
      return respond(error instanceof RequestTooLargeError ? 413 : 400, { error: "invalid_request" });
    }
    if (!isGrantConfirmation(body)) return respond(400, { error: "explicit_consent_required" });
    if (current?.status === "active" && current.products.length === 1 && current.products[0] === "transactions") {
      return respond(200, { consent: publicConsent(current), alreadyActive: true });
    }
    try {
      const granted = await dependencies.consent.recordGrant({
        eventId: (dependencies.idFactory ?? randomUUID)(),
        userId: user.userId,
        products: ["transactions"],
        grantedAt: (dependencies.now?.() ?? new Date()).toISOString()
      });
      if (!isValidCurrentConsent(granted, user.userId) || granted.status !== "active") {
        return respond(503, { error: "consent_unavailable" });
      }
      return respond(201, { consent: publicConsent(granted), alreadyActive: false });
    } catch {
      return respond(503, { error: "consent_unavailable" });
    }
  };
}

function isGrantConfirmation(value: unknown): value is { readonly action: "grant"; readonly confirmed: true; readonly consentVersion: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 3 && body.action === "grant" && body.confirmed === true &&
    body.consentVersion === PLAID_FINANCIAL_PROFILE_CONSENT_VERSION;
}

function isValidCurrentConsent(value: unknown, userId: string): value is PlaidConsentSnapshot {
  return Boolean(value && typeof value === "object" &&
    (value as PlaidConsentSnapshot).userId === userId &&
    ((value as PlaidConsentSnapshot).status === "active" || (value as PlaidConsentSnapshot).status === "revoked") &&
    (value as PlaidConsentSnapshot).purpose === "financial_profile" &&
    Array.isArray((value as PlaidConsentSnapshot).products) &&
    (value as PlaidConsentSnapshot).products.length === 1 &&
    (value as PlaidConsentSnapshot).products[0] === "transactions");
}

function publicConsent(value: PlaidConsentSnapshot) {
  return Object.freeze({
    consentId: value.consentId,
    status: value.status,
    purpose: value.purpose,
    products: Object.freeze([...value.products]),
    grantedAt: value.grantedAt,
    revokedAt: value.revokedAt
  });
}

async function readBoundedBody(request: Request, maximumBytes: number): Promise<string> {
  if (!request.body) throw new Error("Request body is missing.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new RequestTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

class RequestTooLargeError extends Error {}
