import "server-only";
import { createHash } from "node:crypto";
import { parseVictoriaEnv, type EnvSource } from "../../config/env.js";
import { createSupabaseBearerAuthenticator } from "../auth/supabase-bearer-auth.js";
import { createPlaidFinancialProfileRuntime } from "../plaid/create-plaid-financial-profile-runtime.js";
import { isPersistentPlaidRuntimeEnabled } from "../plaid/runtime-availability.js";

type PlaidRuntime = ReturnType<typeof createPlaidFinancialProfileRuntime>;
let cached: { readonly key: string; readonly runtime: PlaidRuntime } | undefined;

/** Plaid is available only as an explicit staging sandbox capability. */
export function getPersistentPlaidRuntime(source: EnvSource = process.env, fetcher?: typeof fetch): PlaidRuntime | null {
  if (!isPersistentPlaidRuntimeEnabled(source)) return null;
  try {
    const env = parseVictoriaEnv(source);
    const supabaseUrl = source.SUPABASE_URL?.trim();
    const publishableKey = source.SUPABASE_PUBLISHABLE_KEY?.trim();
    const tokenKey = source.PLAID_TOKEN_ENCRYPTION_KEY?.trim();
    if (!supabaseUrl || !publishableKey || !tokenKey) return null;
    const key = createHash("sha256")
      .update(env.databaseUrl).update("\0").update(env.plaidClientId).update("\0").update(env.plaidSecret)
      .update("\0").update(tokenKey).update("\0").update(source.PLAID_TOKEN_ENCRYPTION_KEY_VERSION ?? "v1")
      .update("\0").update(supabaseUrl).update("\0").update(publishableKey).digest("hex");
    if (cached?.key === key) return cached.runtime;
    const runtime = createPlaidFinancialProfileRuntime({
      enabled: true,
      env,
      tokenEncryptionKeyBase64: tokenKey,
      ...(source.PLAID_TOKEN_ENCRYPTION_KEY_VERSION?.trim()
        ? { tokenEncryptionKeyVersion: source.PLAID_TOKEN_ENCRYPTION_KEY_VERSION.trim() }
        : {}),
      authenticate: createSupabaseBearerAuthenticator({ supabaseUrl, publishableKey, ...(fetcher ? { fetcher } : {}) }),
      ...(fetcher ? { fetcher } : {})
    });
    cached = Object.freeze({ key, runtime });
    return runtime;
  } catch {
    return null;
  }
}
