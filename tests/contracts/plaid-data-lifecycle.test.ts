import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lifecycleMigration = readFileSync(new URL("../../db/migrations/0007_plaid_data_lifecycle.sql", import.meta.url), "utf8");
const revocationScopeMigration = readFileSync(new URL("../../db/migrations/0008_plaid_revocation_user_scope.sql", import.meta.url), "utf8");
const dataRepository = readFileSync(new URL("../../src/app/plaid/plaid-data-repository.ts", import.meta.url), "utf8");

describe("Plaid lifecycle contract", () => {
  it("LIFE-001 expires raw transactions at the UTC 90-day date boundary and filters equality as expired", () => {
    expect(lifecycleMigration).toMatch(/transaction_date \+ 90\)::timestamp AT TIME ZONE 'UTC'/i);
    expect(lifecycleMigration).toMatch(/DELETE FROM public\.victoria_plaid_transactions WHERE expires_at <= p_now/i);
    expect(lifecycleMigration).toMatch(/m\.created_at AT TIME ZONE 'UTC'/i);
    expect(lifecycleMigration).toMatch(/p_now AT TIME ZONE 'UTC'/i);
    expect(lifecycleMigration).not.toMatch(/ALTER COLUMN expires_at SET DEFAULT \(now\(\)/i);
    expect(lifecycleMigration).toMatch(/CREATE POLICY victoria_plaid_revocation_queue_service_role[\s\S]+TO service_role[\s\S]+USING \(true\) WITH CHECK \(true\)/i);
    expect(dataRepository).toMatch(/expires_at > now\(\)/i);
  });

  it("LIFE-002 and LIFE-003 keeps the revocation queue server-only and scopes purge to one user", () => {
    expect(lifecycleMigration).toMatch(/ALTER TABLE victoria_plaid_revocation_queue ENABLE ROW LEVEL SECURITY/i);
    expect(lifecycleMigration).toMatch(/REVOKE ALL ON victoria_plaid_revocation_queue FROM PUBLIC, anon, authenticated/i);
    expect(lifecycleMigration).toMatch(/GRANT ALL ON victoria_plaid_revocation_queue TO service_role/i);
    expect(lifecycleMigration).toMatch(/WHERE user_id = p_user_id AND source_type = 'plaid_transaction_profile'/i);
    expect(lifecycleMigration).toMatch(/DELETE FROM public\.victoria_memory_embeddings/i);
    expect(lifecycleMigration).toMatch(/DELETE FROM public\.victoria_conversational_memories/i);
    expect(lifecycleMigration).toMatch(/WITH RECURSIVE doomed/i);
    const purgeFunctionStart = lifecycleMigration.indexOf("CREATE OR REPLACE FUNCTION victoria_purge_plaid_profile_memories");
    const expiryFunctionStart = lifecycleMigration.indexOf("CREATE OR REPLACE FUNCTION victoria_expire_plaid_data");
    const purgeFunction = lifecycleMigration.slice(purgeFunctionStart, expiryFunctionStart);
    expect(purgeFunction).toMatch(/GET DIAGNOSTICS removed_embeddings = ROW_COUNT/i);
    expect(purgeFunction).toMatch(/RETURN removed_memories \+ removed_embeddings/i);
    expect(lifecycleMigration).toMatch(/RETURN removed_transactions \+ removed_embeddings \+ removed_memories/i);
  });

  it("LIFE-004 stores only encrypted token envelopes in the persistent retry record", () => {
    const table = lifecycleMigration.slice(lifecycleMigration.indexOf("CREATE TABLE IF NOT EXISTS victoria_plaid_revocation_queue"),
      lifecycleMigration.indexOf("CREATE INDEX IF NOT EXISTS victoria_plaid_revocation_due_idx"));
    expect(table).toContain("access_token_ciphertext text NOT NULL");
    expect(table).toContain("access_token_iv text NOT NULL");
    expect(table).toContain("access_token_auth_tag text NOT NULL");
    expect(table).toContain("encryption_key_version text NOT NULL");
    expect(table).not.toContain("access_token text");
    expect(lifecycleMigration).toMatch(/ADD COLUMN IF NOT EXISTS claimed_until timestamptz/i);
    expect(lifecycleMigration).toMatch(/ADD COLUMN IF NOT EXISTS last_error_code text/i);
    expect(lifecycleMigration).toMatch(/status IN \('pending', 'manual_review'\)/i);
    expect(dataRepository).toMatch(/FOR UPDATE SKIP LOCKED/i);
  });

  it("LIFE-004 keys queued revocations by authenticated user and Item", () => {
    expect(revocationScopeMigration).toMatch(/PRIMARY KEY \(user_id, item_id\)/i);
    expect(dataRepository).toMatch(/ON CONFLICT \(user_id,item_id\) DO NOTHING/i);
    expect(dataRepository).toMatch(/q\.user_id\s*=\s*due\.user_id AND q\.item_id\s*=\s*due\.item_id/i);
  });
});
