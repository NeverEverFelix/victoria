import type { EnvSource } from "../../config/env.js";

/** Plaid read routes may run only in an explicitly enabled staging sandbox. */
export function isPersistentPlaidRuntimeEnabled(source: EnvSource): boolean {
  return source.APP_ENV === "staging" && source.PLAID_FINANCIAL_PROFILE_ENABLED === "true";
}
