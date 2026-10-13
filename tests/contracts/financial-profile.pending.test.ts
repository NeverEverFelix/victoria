import { describe, it } from "vitest";

/**
 * Post-MVP proposal scenarios. These are intentionally pending until a separate
 * product and safety review approves financial-data access.
 * Keep pending until the profile, authorization, and inference-context
 * interfaces are defined; do not encode a guessed Plaid product scope here.
 */
describe("financial profile MVP contract scenarios not yet executable", () => {
  it.todo("does not fetch or inject Plaid data without active user authorization");
  it.todo("isolates profile data across users in storage, specialist inputs, and inference context");
  it.todo("preserves provenance, observation time, freshness, and uncertainty for profile facts");
  it.todo("fails safely on stale, missing, conflicting, malformed, or unavailable profile data");
  it.todo("injects only relevant bounded profile context without unnecessary account identifiers or raw transactions");
  it.todo("prevents the specialist and Plaid integration from approving actions or moving money");
  it.todo("stops future fetches and inference injection after disconnect and applies the defined deletion policy");
  it.todo("requires exact user approval before a profile-informed savings suggestion creates a mocked ledger entry");
});
