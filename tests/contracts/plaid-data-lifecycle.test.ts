import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lifecycleMigration = readFileSync(new URL("../../db/migrations/0007_plaid_data_lifecycle.sql", import.meta.url), "utf8");
const dataRepository = readFileSync(new URL("../../src/app/plaid/plaid-data-repository.ts", import.meta.url), "utf8");

describe("Plaid lifecycle contract", () => {
  it("LIFE-001 expires raw transactions at the UTC 90-day date boundary and filters equality as expired", () => {
    expect(lifecycleMigration).toMatch(/transaction_date \+ 90\)::timestamp AT TIME ZONE 'UTC'/i);
    expect(lifecycleMigration).toMatch(/DELETE FROM public\.victoria_plaid_transactions WHERE expires_at <= p_now/i);
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
  });

  it("LIFE-004 stores only encrypted token envelopes in the persistent retry record", () => {
    const table = lifecycleMigration.slice(lifecycleMigration.indexOf("CREATE TABLE IF NOT EXISTS victoria_plaid_revocation_queue"),
      lifecycleMigration.indexOf("CREATE INDEX IF NOT EXISTS victoria_plaid_revocation_due_idx"));
    expect(table).toContain("access_token_ciphertext text NOT NULL");
    expect(table).toContain("access_token_iv text NOT NULL");
    expect(table).toContain("access_token_auth_tag text NOT NULL");
    expect(table).toContain("encryption_key_version text NOT NULL");
    expect(table).not.toContain("access_token text");
  });
});
