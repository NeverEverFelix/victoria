export interface SupabaseBearerAuthenticatorOptions {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly fetcher?: typeof fetch;
}

const MAX_ACCESS_TOKEN_LENGTH = 8_192;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Verifies the bearer token with Supabase Auth and derives identity only from its response. */
export function createSupabaseBearerAuthenticator(options: SupabaseBearerAuthenticatorOptions) {
  const baseUrl = options.supabaseUrl.trim().replace(/\/+$/, "");
  const publishableKey = options.publishableKey.trim();
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("SUPABASE_URL must use HTTPS outside localhost.");
  }
  if (!isPublishableKey(publishableKey)) throw new Error("A Supabase publishable or anon key is required.");
  const fetcher = options.fetcher ?? fetch;

  return async function authenticate(request: Request): Promise<{ readonly userId: string } | null> {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/);
    const token = match?.[1];
    if (!token || token.length > MAX_ACCESS_TOKEN_LENGTH) return null;

    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/auth/v1/user`, {
        method: "GET",
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
        redirect: "error"
      });
    } catch {
      throw new Error("Supabase Auth is unavailable.");
    }
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error("Supabase Auth verification failed.");

    let payload: unknown;
    try {
      const body = await response.text();
      if (body.length > 16_384) throw new Error("Supabase Auth response is too large.");
      payload = JSON.parse(body) as unknown;
    } catch {
      throw new Error("Supabase Auth returned an invalid response.");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Supabase Auth returned an invalid user.");
    }
    const userId = (payload as Record<string, unknown>).id;
    if (typeof userId !== "string" || !USER_ID_PATTERN.test(userId)) {
      throw new Error("Supabase Auth returned an invalid user identity.");
    }
    return Object.freeze({ userId });
  };
}

function isPublishableKey(key: string): boolean {
  if (key.startsWith("sb_publishable_") && key.length > "sb_publishable_".length) return true;
  if (key.startsWith("sb_secret_") || !key) return false;
  const parts = key.split(".");
  if (parts.length !== 3 || !parts[1]) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { role?: unknown };
    return payload.role === "anon";
  } catch {
    return false;
  }
}
