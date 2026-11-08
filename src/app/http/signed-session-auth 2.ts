import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_SESSION_SECONDS = 12 * 60 * 60;
const CLOCK_SKEW_SECONDS = 60;

interface SessionClaims {
  readonly sub: string;
  readonly aud: "victoria";
  readonly iat: number;
  readonly exp: number;
}

/** Server-side helper for the login boundary to issue a short-lived signed bearer session. */
export function signVictoriaSession(input: {
  readonly userId: string;
  readonly secret: string;
  readonly now?: number;
  readonly lifetimeSeconds?: number;
}): string {
  const userId = input.userId.trim();
  const issuedAt = Math.floor((input.now ?? Date.now()) / 1000);
  const lifetimeSeconds = input.lifetimeSeconds ?? MAX_SESSION_SECONDS;
  assertSecret(input.secret);
  if (!userId || userId.length > 200 || !Number.isSafeInteger(lifetimeSeconds) ||
      lifetimeSeconds < 1 || lifetimeSeconds > MAX_SESSION_SECONDS) {
    throw new Error("Invalid Victoria session claims.");
  }
  const claims: SessionClaims = { sub: userId, aud: "victoria", iat: issuedAt, exp: issuedAt + lifetimeSeconds };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${signature(payload, input.secret)}`;
}

/** Reads identity only from a signed Authorization bearer token, never from request data. */
export function createVictoriaSessionAuthenticator(secret: string, now: () => number = Date.now) {
  assertSecret(secret);
  return async function authenticate(request: Request): Promise<{ readonly userId: string } | null> {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
    if (!match?.[1]) return null;
    const [payload, suppliedSignature] = match[1].split(".");
    if (!payload || !suppliedSignature) return null;
    const expectedSignature = signature(payload, secret);
    const expected = Buffer.from(expectedSignature, "base64url");
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

    try {
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionClaims>;
      const nowSeconds = Math.floor(now() / 1000);
      if (typeof claims.sub !== "string" || !claims.sub.trim() || claims.sub.length > 200 || claims.aud !== "victoria" ||
          !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
          (claims.iat as number) > nowSeconds + CLOCK_SKEW_SECONDS ||
          (claims.exp as number) <= nowSeconds || (claims.exp as number) <= (claims.iat as number) ||
          (claims.exp as number) - (claims.iat as number) > MAX_SESSION_SECONDS) return null;
      return Object.freeze({ userId: claims.sub.trim() });
    } catch {
      return null;
    }
  };
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("Victoria session signing secret must contain at least 32 bytes.");
  }
}
