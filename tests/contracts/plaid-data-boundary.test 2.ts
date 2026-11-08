import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../db/migrations/0005_plaid_transaction_sync.sql", import.meta.url), "utf8");

describe("Plaid transaction storage boundary", () => {
  it("keeps encrypted Item token fields inaccessible to authenticated clients", () => {
    expect(migration).toMatch(/ALTER TABLE victoria_plaid_items ENABLE ROW LEVEL SECURITY/i);
    expect(migration).toMatch(/REVOKE ALL ON victoria_plaid_items FROM authenticated/i);
    expect(migration).not.toMatch(/GRANT\s+SELECT\s+ON\s+victoria_plaid_items\b/i);
    expect(migration).toMatch(/GRANT ALL ON victoria_plaid_items, victoria_plaid_transactions TO service_role/i);
  });
});
