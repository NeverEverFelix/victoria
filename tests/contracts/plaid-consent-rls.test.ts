import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../db/migrations/0007_plaid_consent_rls.sql", import.meta.url), "utf8");
const consentSchema = readFileSync(new URL("../../db/migrations/0002_plaid_consent_events.sql", import.meta.url), "utf8");

describe("Plaid consent event database boundary", () => {
  it("limits authenticated access to owner reads and keeps writes server-side", () => {
    expect(migration).toMatch(/to_regprocedure\('auth\.uid\(\)'\)/i);
    expect(migration).toMatch(/requires Supabase auth\.uid\(\)/i);
    expect(consentSchema).toMatch(/user_id text NOT NULL/i);
    expect(migration).toMatch(/auth\.uid\(\)::text/i);
    expect(migration).toMatch(/ALTER TABLE public\.victoria_plaid_consent_events ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/FOR SELECT TO authenticated[\s\S]*auth\.uid\(\)::text/i);
    expect(migration).toMatch(/REVOKE ALL ON public\.victoria_plaid_consent_events FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT SELECT ON public\.victoria_plaid_consent_events TO authenticated/i);
    expect(migration).toMatch(/GRANT ALL ON public\.victoria_plaid_consent_events TO service_role/i);
    expect(migration).not.toMatch(/FOR INSERT|FOR UPDATE|FOR DELETE/i);
  });
});
